#!/usr/bin/env node
/**
 * Propose which bots belong on which job page.
 *
 * ONE CALL PER JOB, not per bot. `rank` and `fitScore` are comparative
 * judgements — asking about each bot in isolation gives 408 independent guesses
 * that cannot be ranked against one another. Sending the whole candidate list
 * with one job lets the model actually compare, and the list is identical
 * across all 25 calls so it caches after the first.
 *
 * The output is a diff. Nothing publishes without review, and the validator
 * still refuses any mapping that points at a bot with no description.
 *
 *   node --env-file=.env scripts/map-jobs.mjs --only=inbox-management
 *   node --env-file=.env scripts/map-jobs.mjs --only=inbox-management --model=claude-sonnet-5 --dry-run
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BOTS_DIR, ROOT } from './lib/ingest.mjs';
import {
  makeClient, parseJsonArray, textOf, parseArgs,
  dim, green, yellow, red, reportUsage, tallyUsage, emptyTotals, explainAuthError,
} from './lib/llm.mjs';

const JOBS_DIR = join(ROOT, 'data', 'jobs');
const MAX_PER_JOB = 8;

const SYSTEM_RULES = `You are staffing a job board. Each job is a real task someone wants done; each
candidate is a published Grok Bot. Your job is to decide which candidates
genuinely do this work, rank them, and say why.

REJECTION IS THE DEFAULT
Most candidates do not fit most jobs. A directory that maps every bot to
something is worthless — the whole value here is that a listed candidate has
been judged. Returning an empty array is a correct and common answer, and it is
strongly preferred over padding. Do not stretch: a bot that touches email is not
therefore an inbox-management bot, and a general-purpose assistant is not a fit
for a specific job just because it could in principle be told to do it.

Return at most ${MAX_PER_JOB}. Fewer is better. Only include a candidate you
would defend to someone who installed it and found it did not do the job.

FIT SCORE
90-100  purpose-built for exactly this job
75-89   does this job well as one of a few things it does
60-74   does part of this job, or does it with real caveats
below 60 do not include it

FIT REASON
One or two sentences, published on the page. Concrete and specific to this
candidate — what it actually does for this job, and the honest caveat. Never
generic praise. British spelling, dry and unimpressed. Never invent
capabilities, integrations or claims that are not in the candidate's data.

OUTPUT
A JSON array only, ranked best first, no prose around it:
[{"botSlug": "...", "fitScore": 88, "fitReason": "..."}]
An empty array [] is a valid answer.`;

const args = parseArgs(process.argv);
const client = makeClient();

/* -------------------------------------------------------------------- load */

const botFiles = (await readdir(BOTS_DIR)).filter((f) => f.endsWith('.json'));
const bots = [];
for (const f of botFiles) bots.push(JSON.parse(await readFile(join(BOTS_DIR, f), 'utf8')));

const jobFiles = (await readdir(JOBS_DIR)).filter((f) => f.endsWith('.json'));
const jobs = [];
for (const f of jobFiles) jobs.push(JSON.parse(await readFile(join(JOBS_DIR, f), 'utf8')));

// Candidate summaries use the creator's official copy as INPUT. That is fine —
// it is what the bot's author says it does. It is never republished; our own
// description (written by describe-bots.mjs) is what appears on the page.
const candidates = bots
  .filter((b) => b.linkStatus !== 'dead')
  .map((b) => ({
    slug: b.slug,
    name: b.official?.title || b.name,
    does: b.official?.description ?? b.description ?? null,
    tags: b.tags ?? [],
  }))
  .filter((c) => c.does);

const queue = jobs
  .filter((j) => (args.only ? j.slug === args.only : true))
  .filter((j) => (args.force || args.only ? true : j.bots.length === 0))
  .slice(0, args.limit === Infinity ? undefined : args.limit);

console.log(
  `\n${dim('→')} ${candidates.length} candidates · ${queue.length} job(s) · ${dim(args.model)}`
);
if (!queue.length) {
  console.log(green('✓ nothing to map\n'));
  process.exit(0);
}

/* --------------------------------------------------------------------- run */

// The candidate roster is the cached prefix: identical on every call, and it
// dwarfs the per-job text, so caching it is most of the cost saving.
const rosterBlock = {
  type: 'text',
  text: `CANDIDATES\n${JSON.stringify(candidates)}`,
  cache_control: { type: 'ephemeral' },
};

const totals = emptyTotals();
const results = [];

for (const job of queue) {
  let response;
  try {
    response = await client.messages.create({
      model: args.model,
      max_tokens: 8000,
      thinking: { type: 'adaptive' },
      system: [{ type: 'text', text: SYSTEM_RULES }, rosterBlock],
      messages: [
        {
          role: 'user',
          content: `JOB: ${job.title}
What people search for: ${job.searchIntent}

About this job:
${job.intro}

Which candidates genuinely do this job? Rank them, reject the rest.`,
        },
      ],
    });
  } catch (err) {
    const hint = explainAuthError(err);
    if (hint) { console.error(hint); process.exit(1); }
    console.error(red(`  ! ${job.slug}: ${err.message}`));
    continue;
  }

  tallyUsage(totals, response.usage);
  const rows = parseJsonArray(textOf(response));
  if (!rows) {
    console.error(red(`  ! ${job.slug}: unparseable response`));
    continue;
  }

  const known = new Set(candidates.map((c) => c.slug));
  const mapped = rows
    .filter((r) => known.has(r?.botSlug) && typeof r.fitScore === 'number' && r.fitScore >= 60)
    .filter((r) => typeof r.fitReason === 'string' && r.fitReason.trim())
    .slice(0, MAX_PER_JOB)
    .map((r, i) => ({
      botSlug: r.botSlug,
      fitScore: Math.round(r.fitScore),
      fitReason: r.fitReason.trim(),
      rank: i + 1,
    }));

  // Hallucinated slugs are worth surfacing, not silently dropping.
  const unknown = rows.filter((r) => r?.botSlug && !known.has(r.botSlug)).length;

  results.push({ job, mapped, proposed: rows.length, unknown });

  const label = mapped.length ? green(`${mapped.length}`) : dim('0');
  console.log(
    `  ${label} ${job.slug}` +
      dim(` (proposed ${rows.length}${unknown ? `, ${unknown} unknown slugs` : ''})`)
  );

  if (!args.dryRun && mapped.length) {
    job.bots = mapped;
    await writeFile(join(JOBS_DIR, `${job.slug}.json`), JSON.stringify(job, null, 2) + '\n');
  }
}

/* ------------------------------------------------------------------ report */

const filled = results.filter((r) => r.mapped.length).length;
const totalMapped = results.reduce((n, r) => n + r.mapped.length, 0);
const rejected = results.reduce((n, r) => n + Math.max(0, r.proposed - r.mapped.length), 0);

console.log(
  `\n${green('✓')} ${totalMapped} mappings across ${filled}/${results.length} jobs` +
    (rejected ? dim(` · ${rejected} proposals dropped below the bar`) : '')
);
reportUsage(totals, args.model);

if (args.dryRun) {
  console.log(dim('\n(dry run — nothing written)\n'));
  for (const r of results) {
    if (!r.mapped.length) continue;
    console.log(`\n${r.job.title}`);
    for (const m of r.mapped) console.log(`  ${String(m.fitScore).padStart(3)}  ${m.botSlug}\n       ${dim(m.fitReason)}`);
  }
}
console.log('');
