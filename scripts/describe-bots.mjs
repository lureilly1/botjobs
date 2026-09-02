#!/usr/bin/env node
/**
 * Write our own one-paragraph summary for each bot.
 *
 * Ingest deliberately leaves `description: null`, because reusing a source
 * directory's write-up is the thing our rules forbid (see src/lib/records.js).
 * This is where the gap gets filled — in our own words, from the creator's
 * official listing rather than from a competitor's editorial.
 *
 * The similarity rule the validator enforces is checked HERE too, before a
 * write. A draft that is really a reword of the creator's blurb is rejected
 * and retried rather than committed and caught later.
 *
 *   node --env-file=.env scripts/describe-bots.mjs --limit=16
 *   node --env-file=.env scripts/describe-bots.mjs --model=claude-sonnet-5
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BOTS_DIR, writeBotRecord } from './lib/ingest.mjs';
import { similarity, MAX_DESCRIPTION_SIMILARITY } from '../src/lib/records.js';
import {
  makeClient, parseJsonArray, textOf, parseArgs,
  dim, green, yellow, red, reportUsage, tallyUsage, emptyTotals,
} from './lib/llm.mjs';

const BATCH_SIZE = 8;

const SYSTEM = `You write listing summaries for Bot Jobs, an independent directory of Grok Bots.

VOICE
Dry, concrete, understated. British spelling. You are describing a job applicant
to someone deciding whether to interview them — factual, unimpressed by
marketing, interested in what the thing actually does day to day.

Never: "powerful", "seamlessly", "revolutionise", "game-changing", "empower",
"effortlessly", "unlock", exclamation marks, or a sentence that would fit any
bot in the catalogue.

THE RULE THAT MATTERS
You are given the creator's own description. Your summary must NOT be a reword
of it. Do not track its sentence order, do not swap its nouns for synonyms.
Read it, work out what the bot actually does, then describe that from scratch in
your own construction. A mechanical check rejects drafts that share too much
wording with the original, and rejected drafts are re-run at cost.

SHAPE
Two sentences, 30-55 words total. First: what it does, concretely. Second: a
qualifier that helps someone decide — what it assumes, when it fits, what it
needs, or where it would not help. Plain prose, no bullets, no bot name as the
subject (the name is already the heading). Never invent capabilities, numbers,
integrations or claims that are not in the input.

OUTPUT
A JSON array only, no prose around it:
[{"slug": "<slug>", "description": "<two sentences>"}]`;

const args = parseArgs(process.argv);
const client = makeClient();

/* -------------------------------------------------------------------- load */

const files = (await readdir(BOTS_DIR)).filter((f) => f.endsWith('.json'));
const all = [];
for (const f of files) all.push(JSON.parse(await readFile(join(BOTS_DIR, f), 'utf8')));

const queue = all
  .filter((b) => args.force || !b.description)
  // A dead bot cannot be recommended, so it is not worth describing.
  .filter((b) => b.linkStatus !== 'dead')
  .slice(0, args.limit === Infinity ? undefined : args.limit);

console.log(`\n${dim('→')} ${all.length} bots · ${queue.length} need a description · ${dim(args.model)}`);
if (!queue.length) {
  console.log(green('✓ nothing to write\n'));
  process.exit(0);
}

/* ------------------------------------------------------------------- write */

const totals = emptyTotals();
const counts = { written: 0, rejected: 0, failed: 0 };
const rejections = [];

for (let i = 0; i < queue.length; i += BATCH_SIZE) {
  const batch = queue.slice(i, i + BATCH_SIZE);

  const payload = batch.map((b) => ({
    slug: b.slug,
    name: b.official?.title || b.name,
    creator_description: b.official?.description ?? null,
    tags: b.tags ?? [],
  }));

  let response;
  try {
    response = await client.messages.create({
      model: args.model,
      max_tokens: 4000,
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: JSON.stringify(payload, null, 2) }],
    });
  } catch (err) {
    console.error(red(`  ! batch ${i / BATCH_SIZE + 1} failed: ${err.message}`));
    counts.failed += batch.length;
    continue;
  }

  tallyUsage(totals, response.usage);
  const rows = parseJsonArray(textOf(response));
  if (!rows) {
    console.error(red(`  ! batch ${i / BATCH_SIZE + 1}: unparseable response`));
    counts.failed += batch.length;
    continue;
  }

  for (const row of rows) {
    const bot = batch.find((b) => b.slug === row?.slug);
    if (!bot || typeof row.description !== 'string' || !row.description.trim()) {
      counts.failed += 1;
      continue;
    }

    // The same check the validator runs, applied before the write so a reworded
    // draft never reaches the repo.
    const official = bot.official?.description;
    if (official) {
      const score = similarity(row.description, official);
      if (score > MAX_DESCRIPTION_SIMILARITY) {
        counts.rejected += 1;
        rejections.push({ slug: bot.slug, score: score.toFixed(2) });
        continue;
      }
    }

    bot.description = row.description.trim();
    if (!args.dryRun) await writeBotRecord(bot.slug, bot);
    counts.written += 1;
  }

  process.stdout.write(dim(`  ${Math.min(i + BATCH_SIZE, queue.length)}/${queue.length}\n`));
}

/* ------------------------------------------------------------------ report */

console.log(
  `\n${green('✓')} ${counts.written} written` +
    (counts.rejected ? ` · ${yellow(`${counts.rejected} rejected as too close to the original`)}` : '') +
    (counts.failed ? ` · ${red(`${counts.failed} failed`)}` : '')
);
if (rejections.length) {
  console.log(dim('  rejected: ' + rejections.map((r) => `${r.slug} (${r.score})`).join(', ')));
  console.log(dim('  re-run to retry them.'));
}
reportUsage(totals, args.model);
if (args.dryRun) console.log(dim('\n(dry run — nothing written)'));
console.log('');
