#!/usr/bin/env node
/**
 * bot.store adapter.
 *
 * Their robots.txt allows /api/catalog for agents by name and /llms.txt
 * documents the contract, so we read the documented JSON — no HTML scraping.
 *
 * WHAT WE TAKE: facts. Official share URL (the dedupe key), maker, price.
 *
 * WHAT WE DO NOT TAKE: `tagline` and `description`. Two separate reasons, and
 * both matter:
 *   1. Where it is bot.store's own write-up, it is their editorial.
 *   2. Where the maker pasted the template in, the field contains the actual
 *      prompt body ("You are Invoice Terminator. Your only job is...").
 *      Reproducing template contents is the thing our rules forbid most
 *      firmly — it is the pattern most likely to attract a complaint.
 * Either way the field never lands in a record.
 *
 *   node scripts/ingest-botstore.mjs --dry-run
 */
import {
  fetchJson,
  loadExistingBots,
  mergeBotRecord,
  writeBotRecord,
  resolveSlug,
  botIdFromShareUrl,
} from './lib/ingest.mjs';

const SOURCE = {
  name: 'bot.store',
  catalog: 'https://bot.store/api/catalog',
};

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;

/** `makerName` mixes display name and handle: "Mikadzyki🌙 @mikadzyki_nft". */
function parseMaker(makerName) {
  const raw = typeof makerName === 'string' ? makerName.trim() : '';
  if (!raw) return null;

  const handle = /@([A-Za-z0-9_]{1,15})\b/.exec(raw)?.[1] ?? null;
  const name = raw.replace(/@[A-Za-z0-9_]{1,15}\b/, '').trim() || null;

  if (!handle && !name) return null;
  return {
    handle,
    name,
    url: handle ? `https://x.com/${handle}` : null,
  };
}

function toRecord(item, seenAt) {
  const botId = botIdFromShareUrl(item.grokShareUrl);
  if (!botId) return null;

  const creator = parseMaker(item.makerName);
  if (!creator) return null;

  return {
    slug: item.slug,
    name: typeof item.displayName === 'string' ? item.displayName.trim() : item.name,
    grokShareUrl: item.grokShareUrl,
    botId,
    creator,
    // bot.store carries no originating post, so a bot found only here stays
    // `listed` rather than `source-linked`. That is the honest level.
    sourceUrl: null,
    discoveredVia: { name: SOURCE.name, url: item.href },
    listings: [{ name: SOURCE.name, url: item.href }],
    categories: [],
    integrations: [],
    tags: [],
    lastSeenAt: seenAt,
  };
}

/* --------------------------------------------------------------------- run */

const seenAt = new Date().toISOString().slice(0, 10);

console.log(`\n${dim('→')} fetching ${SOURCE.catalog}`);
const payload = await fetchJson(SOURCE.catalog);
const items = payload?.bots ?? [];
console.log(`${dim('→')} ${items.length} listings upstream`);

const { bySlug, byBotId } = await loadExistingBots();
console.log(`${dim('→')} ${bySlug.size} records already local\n`);

const counts = { created: 0, updated: 0, unchanged: 0, skipped: 0 };
const skipReasons = new Map();
let overlap = 0;

for (const item of items) {
  const incoming = toRecord(item, seenAt);
  if (!incoming) {
    counts.skipped += 1;
    const why = !botIdFromShareUrl(item.grokShareUrl) ? 'no official share URL' : 'no maker';
    skipReasons.set(why, (skipReasons.get(why) ?? 0) + 1);
    continue;
  }

  const { slug, deduped } = resolveSlug(
    { botId: incoming.botId, preferredSlug: incoming.slug, name: incoming.name },
    byBotId,
    bySlug
  );
  if (!slug) {
    counts.skipped += 1;
    skipReasons.set('unusable slug', (skipReasons.get('unusable slug') ?? 0) + 1);
    continue;
  }
  // Already on file from another catalogue: the union working as intended.
  if (deduped) overlap += 1;

  incoming.slug = slug;
  const { record, change } = mergeBotRecord(bySlug.get(slug), incoming);
  counts[change] += 1;

  if (!DRY_RUN) await writeBotRecord(slug, record);
  bySlug.set(slug, record);
  byBotId.set(record.botId, slug);
}

console.log(
  `${green('✓')} ${counts.created} created · ${counts.updated} updated · ${dim(`${counts.unchanged} unchanged`)}`
);
console.log(
  `${dim('·')} ${overlap} already on file from another catalogue ` +
    `${dim(`(${((overlap / Math.max(items.length, 1)) * 100).toFixed(0)}% overlap)`)}`
);

if (counts.skipped) {
  console.log(`${yellow('!')} ${counts.skipped} skipped:`);
  for (const [why, n] of [...skipReasons].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${dim('·')} ${n} — ${why}`);
  }
}

if (DRY_RUN) console.log(dim('\n(dry run — nothing written)'));
console.log('');
