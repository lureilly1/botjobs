/**
 * Shared ingest plumbing for the source adapters.
 *
 * The adapters are disposable infrastructure. They exist to turn somebody
 * else's catalogue into our record shape and nothing else — no business logic,
 * no editorial. If an adapter ever starts deciding what something *means*,
 * that logic belongs somewhere we own.
 */
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SLUG_RE, botIdFromShareUrl } from '../../src/lib/records.js';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const BOTS_DIR = join(ROOT, 'data', 'bots');

/** Identify ourselves. These are people we intend to email, not scrape blind. */
const USER_AGENT =
  'BotJobsBot/0.1 (+https://botjobs.dev; independent Grok Bot directory; contact: https://github.com/lureilly1/botjobs)';

/** Fetch JSON with a couple of polite retries on transient failure. */
export async function fetchJson(url, { retries = 2, timeoutMs = 20000 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: { accept: 'application/json', 'user-agent': USER_AGENT },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      return await res.json();
    } catch (err) {
      lastError = err;
      // Back off before retrying; a source under load should not be hammered.
      if (attempt < retries) await sleep(600 * (attempt + 1));
    }
  }
  throw new Error(`fetch failed for ${url}: ${lastError?.message}`);
}

/**
 * Walk a paginated feed by following `next` where the contract provides it.
 *
 * Deliberately does NOT guess at page/offset parameters. grokbot.dev's v1
 * contract says consumers SHOULD follow a `next` cursor if one appears, and
 * inventing undocumented pagination is how adapters break silently when a
 * source changes.
 */
export async function fetchAllPages(startUrl, { itemsKey = 'items', maxPages = 50 } = {}) {
  const items = [];
  let url = startUrl;
  let pages = 0;

  while (url && pages < maxPages) {
    const payload = await fetchJson(url);
    items.push(...(payload?.[itemsKey] ?? []));
    pages += 1;

    const next = payload?.next ?? payload?.cursor ?? null;
    url = next ? new URL(next, startUrl).href : null;
  }

  if (url) console.warn(`  ! stopped at ${maxPages} pages; a cursor was still pending`);
  return items;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function slugify(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
}

/** Every existing bot record, keyed by slug, plus a botId → slug index. */
export async function loadExistingBots() {
  if (!existsSync(BOTS_DIR)) return { bySlug: new Map(), byBotId: new Map() };

  const files = (await readdir(BOTS_DIR)).filter((f) => f.endsWith('.json'));
  const bySlug = new Map();
  const byBotId = new Map();

  for (const file of files) {
    const slug = basename(file, '.json');
    const record = JSON.parse(await readFile(join(BOTS_DIR, file), 'utf8'));
    bySlug.set(slug, record);
    if (record.botId) byBotId.set(record.botId, slug);
  }
  return { bySlug, byBotId };
}

/**
 * Fields the adapters own. Everything else on a record is ours and survives
 * re-ingest untouched.
 *
 * This is the whole reason ingest is safe to re-run: a nightly job must never
 * be able to overwrite a hand-written description or a verification result.
 */
const SOURCE_OWNED = new Set([
  'grokShareUrl',
  'botId',
  'creator',
  'sourceUrl',
  'integrations',
  'tags',
  'lastSeenAt',
]);

/**
 * Seeded by ingest on first sight, then ours forever.
 *
 * `name` is not a settled fact — catalogues disagree. grokbot.dev calls one bot
 * "Forge (dev factory)"; x.ai, the source of truth, calls it "Forge by Daniel".
 * Reconciling that is our job (T6), so ingest must not overwrite the answer on
 * the next run.
 *
 * `categories` is our taxonomy, not theirs. Inheriting somebody else's buckets
 * would give away the one thing on this site nobody can ingest back out of us.
 */
const SEED_ONLY = new Set(['name', 'categories']);

/**
 * Merge a freshly-scraped record over an existing one.
 *
 * @returns {{record: object, change: 'created'|'updated'|'unchanged'}}
 */
export function mergeBotRecord(existing, incoming) {
  if (!existing) {
    return {
      record: {
        ...incoming,
        // Ingest never writes editorial. See records.js — a null description is
        // what keeps an unreviewed record off the site.
        description: null,
        official: {},
        evidenceLevel: incoming.sourceUrl ? 'source-linked' : 'listed',
        linkStatus: 'unchecked',
        firstSeenAt: incoming.lastSeenAt,
      },
      change: 'created',
    };
  }

  const merged = { ...existing };
  let touched = false;

  for (const key of SOURCE_OWNED) {
    if (!(key in incoming)) continue;
    if (JSON.stringify(existing[key]) !== JSON.stringify(incoming[key])) {
      merged[key] = incoming[key];
      if (key !== 'lastSeenAt') touched = true;
    }
  }

  // Discovery credit belongs to whoever surfaced it first and never moves.
  merged.discoveredVia = existing.discoveredVia ?? incoming.discoveredVia;
  merged.firstSeenAt = existing.firstSeenAt ?? incoming.lastSeenAt;

  return { record: merged, change: touched ? 'updated' : 'unchanged' };
}

/** Stable key order, so a re-ingest produces a readable diff rather than noise. */
const KEY_ORDER = [
  'slug', 'name', 'grokShareUrl', 'botId', 'creator', 'sourceUrl', 'discoveredVia',
  'description', 'official', 'categories', 'integrations', 'tags',
  'evidenceLevel', 'linkStatus', 'lastVerifiedAt', 'firstSeenAt', 'lastSeenAt',
];

export function serialiseBot(record) {
  const ordered = {};
  for (const key of KEY_ORDER) if (key in record) ordered[key] = record[key];
  for (const key of Object.keys(record)) if (!(key in ordered)) ordered[key] = record[key];
  return JSON.stringify(ordered, null, 2) + '\n';
}

export async function writeBotRecord(slug, record) {
  await mkdir(BOTS_DIR, { recursive: true });
  await writeFile(join(BOTS_DIR, `${slug}.json`), serialiseBot(record), 'utf8');
}

/**
 * Resolve the slug a bot should live under.
 *
 * The official x.ai bot id is the dedupe key (plan §5). If we have already seen
 * this id under a different slug, that record wins — one bot is one file, and a
 * second catalogue finding the same bot must not create `forge-1`.
 */
export function resolveSlug({ botId, preferredSlug, name }, byBotId, bySlug) {
  const existingSlug = botId ? byBotId.get(botId) : null;
  if (existingSlug) return { slug: existingSlug, deduped: true };

  let slug = SLUG_RE.test(preferredSlug ?? '') ? preferredSlug : slugify(name);
  if (!SLUG_RE.test(slug)) return { slug: null, deduped: false };

  // Same slug, different bot: suffix with a short piece of the id rather than a
  // counter, so the name stays stable across runs.
  if (bySlug.has(slug) && bySlug.get(slug).botId !== botId) {
    slug = `${slug}-${String(botId).slice(0, 6).toLowerCase()}`;
  }
  return { slug, deduped: false };
}

export { botIdFromShareUrl };
