#!/usr/bin/env node
/**
 * grokbot.dev adapter.
 *
 * Their v1 API is additive-only with a 90-day sunset on breaking changes, and
 * their content signal permits reference use — so we read the documented JSON
 * rather than scraping, follow `next` where it appears, and ignore fields we do
 * not recognise.
 *
 * WHAT WE TAKE: facts. Share URL, creator, the originating X post, tags,
 * categories.
 *
 * WHAT WE DO NOT TAKE: their `tagline`, `description` and `body`. That is
 * grokbot.dev's editorial writing, and lifting it is precisely the pattern our
 * own rules forbid. Records therefore land with description: null and cannot be
 * published until somebody writes ours. See src/lib/records.js.
 *
 *   node scripts/ingest-grokbot.mjs           write records
 *   node scripts/ingest-grokbot.mjs --dry-run report only, touch nothing
 *   node scripts/ingest-grokbot.mjs --limit=20
 */
import {
  fetchAllPages,
  loadExistingBots,
  mergeBotRecord,
  writeBotRecord,
  resolveSlug,
  botIdFromShareUrl,
} from './lib/ingest.mjs';

const SOURCE = {
  name: 'grokbot.dev',
  templates: 'https://grokbot.dev/api/v1/templates.json',
  page: (slug) => `https://grokbot.dev/marketplace/${slug}/`,
};

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const LIMIT = Number(args.find((a) => a.startsWith('--limit='))?.split('=')[1]) || Infinity;

const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;

/** Map one upstream template onto our record shape. Facts only. */
function toRecord(item, seenAt) {
  const botId = botIdFromShareUrl(item.share_url);
  if (!botId) return null; // No official share URL means no dedupe key and no install route.

  const handle = item.sharer?.handle ?? null;
  if (!handle) return null;

  // tag_facets.domain is grokbot.dev's own grouping. We keep it as a raw tag
  // rather than mapping it to our categories — our taxonomy is ours, and T8
  // assigns jobs deliberately rather than inheriting somebody else's buckets.
  const tags = Array.isArray(item.tags) ? item.tags.filter((t) => typeof t === 'string') : [];

  return {
    slug: item.slug,
    name: typeof item.name === 'string' ? item.name.trim() : null,
    grokShareUrl: item.share_url,
    botId,
    creator: {
      handle,
      url: item.sharer?.url ?? `https://x.com/${handle}`,
    },
    sourceUrl: item.source?.url ?? null,
    discoveredVia: { name: SOURCE.name, url: SOURCE.page(item.slug) },
    listings: [{ name: SOURCE.name, url: SOURCE.page(item.slug) }],
    categories: [],
    integrations: Array.isArray(item.integrations) ? item.integrations : [],
    tags,
    lastSeenAt: seenAt,
  };
}

/* --------------------------------------------------------------------- run */

const seenAt = new Date().toISOString().slice(0, 10);

console.log(`\n${dim('→')} fetching ${SOURCE.templates}`);
const items = await fetchAllPages(SOURCE.templates);
console.log(`${dim('→')} ${items.length} templates upstream`);

const { bySlug, byBotId } = await loadExistingBots();
console.log(`${dim('→')} ${bySlug.size} records already local\n`);

const counts = { created: 0, updated: 0, unchanged: 0, skipped: 0, deduped: 0 };
const skipReasons = new Map();

let processed = 0;
for (const item of items) {
  if (processed >= LIMIT) break;
  processed += 1;

  const incoming = toRecord(item, seenAt);
  if (!incoming) {
    counts.skipped += 1;
    const why = !botIdFromShareUrl(item.share_url) ? 'no official share URL' : 'no creator handle';
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
  if (deduped) counts.deduped += 1;

  incoming.slug = slug;
  const { record, change } = mergeBotRecord(bySlug.get(slug), incoming);
  counts[change] += 1;

  if (!DRY_RUN) await writeBotRecord(slug, record);
  bySlug.set(slug, record);
  byBotId.set(record.botId, slug);
}

/* ------------------------------------------------------------------ report */

console.log(
  `${green('✓')} ${counts.created} created · ${counts.updated} updated · ` +
    `${dim(`${counts.unchanged} unchanged`)}` +
    (counts.deduped ? ` · ${counts.deduped} matched an existing bot by id` : '')
);

// Never silently drop records. If a source stops exposing share URLs we want
// that visible in the run output, not discovered weeks later as missing rows.
if (counts.skipped) {
  console.log(`${yellow('!')} ${counts.skipped} skipped:`);
  for (const [why, n] of [...skipReasons].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${dim('·')} ${n} — ${why}`);
  }
}

if (DRY_RUN) console.log(dim('\n(dry run — nothing written)'));
console.log(dim('\nRecords land with description: null and cannot be published until written.'));
console.log('');
