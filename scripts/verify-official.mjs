#!/usr/bin/env node
/**
 * Reconcile every listing against its official x.ai page.
 *
 * This is the evidence tier nobody else has, and it costs nothing: share URLs
 * resolve anonymously and carry the creator's own title and description. A
 * catalogue can be stale or simply wrong — grokbot.dev calls one bot "Forge
 * (dev factory)" while x.ai calls it "Forge by Daniel" — and this is what lets
 * us be the directory that is right.
 *
 * Behaviour confirmed against the live service:
 *   live bot  → 200 with a bot-specific og:title
 *   dead bot  → 404, still serving OG tags but with the generic site title
 * So a status check alone is enough, and the generic-title guard is a belt to
 * that braces in case x.ai ever softens the 404.
 *
 *   node scripts/verify-official.mjs              stale records only
 *   node scripts/verify-official.mjs --force      re-check everything
 *   node scripts/verify-official.mjs --limit=20
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BOTS_DIR, writeBotRecord, sleep } from './lib/ingest.mjs';

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const DRY_RUN = args.includes('--dry-run');
const LIMIT = Number(args.find((a) => a.startsWith('--limit='))?.split('=')[1]) || Infinity;

const CONCURRENCY = 5;
const RECHECK_AFTER_DAYS = 7;
/** Three consecutive dead checks unpublish. Transient errors never count. */
const DEAD_CHECKS_TO_UNPUBLISH = 3;
/**
 * If more than this share of records would be marked dead in one run, stop and
 * report instead of writing. An outage or a change at the source must not be
 * able to empty the directory.
 */
const MASS_DEATH_THRESHOLD = 0.2;

const USER_AGENT =
  'BotJobsBot/0.1 (+https://botjobs.dev; independent Grok Bot directory; contact: https://github.com/lureilly1/botjobs)';

const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;

const decode = (s) =>
  String(s)
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();

function ogTag(html, property) {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']*)["']`,
    'i'
  );
  const alt = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${property}["']`,
    'i'
  );
  const m = re.exec(html) ?? alt.exec(html);
  return m ? decode(m[1]) : null;
}

/** x.ai's site-level title, served on pages that are not a bot. */
const GENERIC_TITLE = /creators of grok/i;

async function checkOne(record) {
  try {
    const res = await fetch(record.grokShareUrl, {
      headers: { 'user-agent': USER_AGENT, accept: 'text/html' },
      redirect: 'follow',
      signal: AbortSignal.timeout(20000),
    });

    if (res.status === 404 || res.status === 410) return { outcome: 'dead' };
    if (!res.ok) return { outcome: 'error', detail: `HTTP ${res.status}` };

    const html = await res.text();
    const title = ogTag(html, 'og:title');
    const description = ogTag(html, 'og:description');

    // 200 but serving the site shell rather than a bot: treat as gone.
    if (!title || GENERIC_TITLE.test(title)) return { outcome: 'dead' };

    const redirected = res.url && res.url !== record.grokShareUrl;
    return { outcome: 'live', title, description, redirected };
  } catch (err) {
    // Timeouts and network faults are OUR problem, not evidence the bot died.
    return { outcome: 'error', detail: err.name === 'TimeoutError' ? 'timeout' : err.message };
  }
}

/* -------------------------------------------------------------------- load */

const today = new Date().toISOString().slice(0, 10);
const staleBefore = new Date(Date.now() - RECHECK_AFTER_DAYS * 864e5).toISOString().slice(0, 10);

const files = (await readdir(BOTS_DIR)).filter((f) => f.endsWith('.json'));
const all = [];
for (const file of files) all.push(JSON.parse(await readFile(join(BOTS_DIR, file), 'utf8')));

const queue = all
  .filter((b) => FORCE || !b.official?.fetchedAt || b.official.fetchedAt < staleBefore)
  .slice(0, LIMIT === Infinity ? undefined : LIMIT);

console.log(`\n${dim('→')} ${all.length} records · ${queue.length} to check` + (FORCE ? dim(' (forced)') : ''));
if (!queue.length) {
  console.log(green('✓ nothing stale\n'));
  process.exit(0);
}

/* ------------------------------------------------------------------- check */

const results = new Map();
let done = 0;

async function worker(items) {
  for (const record of items) {
    results.set(record.slug, await checkOne(record));
    done += 1;
    if (done % 40 === 0) process.stdout.write(dim(`  ${done}/${queue.length}\n`));
    await sleep(120); // stay polite
  }
}

const lanes = Array.from({ length: CONCURRENCY }, (_, i) =>
  worker(queue.filter((_, idx) => idx % CONCURRENCY === i))
);
await Promise.all(lanes);

/* ------------------------------------------- safety rail before any writing */

const deadCount = [...results.values()].filter((r) => r.outcome === 'dead').length;
if (deadCount / queue.length > MASS_DEATH_THRESHOLD) {
  console.error(
    red(
      `\n✗ ${deadCount}/${queue.length} came back dead (>${MASS_DEATH_THRESHOLD * 100}%). ` +
        `That looks like an outage or a change at the source, not mass deletion.\n` +
        `  Nothing written. Re-run when the source is healthy.\n`
    )
  );
  process.exit(1);
}

/* ------------------------------------------------------------------- write */

const counts = { verified: 0, dead: 0, error: 0, unpublished: 0 };
const mismatches = [];

for (const record of queue) {
  const result = results.get(record.slug);
  if (!result || result.outcome === 'error') {
    counts.error += 1;
    continue; // leave the record exactly as it was
  }

  if (result.outcome === 'dead') {
    counts.dead += 1;
    const deadChecks = (record.deadChecks ?? 0) + 1;
    record.deadChecks = deadChecks;
    record.linkStatus = 'dead';
    record.official = { ...record.official, resolves: false, fetchedAt: today };
    record.lastVerifiedAt = today;
    // A dead install link cannot be recommended, whatever a catalogue claims.
    record.evidenceLevel = 'listed';
    if (deadChecks >= DEAD_CHECKS_TO_UNPUBLISH) {
      record.unpublished = true;
      counts.unpublished += 1;
    }
  } else {
    counts.verified += 1;
    delete record.deadChecks;
    delete record.unpublished;
    record.linkStatus = result.redirected ? 'redirected' : 'live';
    record.official = {
      title: result.title,
      description: result.description ?? null,
      resolves: true,
      fetchedAt: today,
    };
    record.lastVerifiedAt = today;
    record.evidenceLevel = 'link-verified';

    // Where the catalogue name and the official title diverge, the official
    // page wins on facts — but renaming is an editorial call, so surface it
    // rather than silently overwriting somebody's curated name.
    const a = record.name?.toLowerCase().replace(/[^a-z0-9]/g, '');
    const b = result.title?.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (a && b && !b.includes(a) && !a.includes(b)) {
      mismatches.push({ slug: record.slug, ours: record.name, official: result.title });
    }
  }

  if (!DRY_RUN) await writeBotRecord(record.slug, record);
}

/* ------------------------------------------------------------------ report */

console.log(
  `\n${green('✓')} ${counts.verified} verified · ${counts.dead} dead` +
    (counts.unpublished ? ` (${counts.unpublished} unpublished)` : '') +
    ` · ${dim(`${counts.error} unreachable, left untouched`)}`
);

if (mismatches.length) {
  console.log(
    `\n${yellow('!')} ${mismatches.length} name${mismatches.length === 1 ? '' : 's'} disagree with the official page:`
  );
  for (const m of mismatches.slice(0, 15)) {
    console.log(`  ${dim('·')} ${m.slug}`);
    console.log(`      ours:     ${m.ours}`);
    console.log(`      official: ${m.official}`);
  }
  if (mismatches.length > 15) console.log(dim(`  … and ${mismatches.length - 15} more`));
  console.log(dim('  Names are editorial, so these are reported rather than overwritten.'));
}

if (DRY_RUN) console.log(dim('\n(dry run — nothing written)'));
console.log('');
