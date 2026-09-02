#!/usr/bin/env node
/**
 * Work out which named services each bot actually connects to.
 *
 * Neither catalogue supplies this — every record arrives with integrations: [].
 * Regex was tried and rejected twice over: loose matching counts "email" and
 * "inbox" as Gmail (46 false positives), strict matching misses every bot that
 * plainly uses Gmail without naming it (9 of a likely 40+). A keyword sweep is
 * exactly what produced the wrong supply numbers in T7.
 *
 * So this asks a model, from a CLOSED vocabulary, with "none" as the expected
 * answer. Output is a git diff like everything else.
 *
 *   node --env-file=.env scripts/detect-integrations.mjs
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BOTS_DIR, writeBotRecord } from './lib/ingest.mjs';
import {
  makeClient, parseJsonArray, textOf, parseArgs,
  dim, green, red, reportUsage, tallyUsage, emptyTotals, explainAuthError,
} from './lib/llm.mjs';

const BATCH_SIZE = 20;

/** Closed vocabulary. A model cannot invent an integration that has no page. */
export const INTEGRATIONS = [
  'gmail', 'google-calendar', 'google-drive', 'google-sheets', 'slack', 'notion',
  'github', 'linear', 'x', 'linkedin', 'reddit', 'youtube', 'discord', 'telegram',
  'whatsapp', 'shopify', 'stripe', 'salesforce', 'hubspot', 'zoom', 'spotify',
  'apple-calendar', 'outlook', 'trello', 'asana', 'airtable', 'figma', 'tesla',
];

const SYSTEM = `For each bot, list the named third-party services it connects to.

VOCABULARY — use only these ids, nothing else:
${INTEGRATIONS.join(', ')}

RULES
Include a service only when the bot plainly works with that specific product.
"Reads your email" is not gmail unless Gmail is named or unmistakably implied by
what it does (an inbox-zero bot that files and archives mail is gmail; a bot
that merely sends you a summary by email is not).

Most bots integrate with nothing — an empty array is the expected answer and is
strongly preferred over a guess. General web browsing is not an integration.
Being *about* a topic is not an integration: a bot that writes posts is not x
unless it actually reads or posts to X.

OUTPUT
JSON array only:
[{"slug":"...","integrations":["gmail"]}]`;

const args = parseArgs(process.argv);
const client = makeClient();

const files = (await readdir(BOTS_DIR)).filter((f) => f.endsWith('.json'));
const all = [];
for (const f of files) all.push(JSON.parse(await readFile(join(BOTS_DIR, f), 'utf8')));

const queue = all
  .filter((b) => b.linkStatus !== 'dead' && b.description)
  .filter((b) => args.force || !Array.isArray(b.integrations) || b.integrations.length === 0)
  .slice(0, args.limit === Infinity ? undefined : args.limit);

console.log(`\n${dim('→')} ${queue.length} bots to classify · ${dim(args.model)}`);
if (!queue.length) {
  console.log(green('✓ nothing to do\n'));
  process.exit(0);
}

const totals = emptyTotals();
const vocab = new Set(INTEGRATIONS);
let withAny = 0;
let done = 0;

for (let i = 0; i < queue.length; i += BATCH_SIZE) {
  const batch = queue.slice(i, i + BATCH_SIZE);
  const payload = batch.map((b) => ({
    slug: b.slug,
    name: b.official?.title || b.name,
    does: b.official?.description ?? b.description,
  }));

  let response;
  try {
    response = await client.messages.create({
      model: args.model,
      max_tokens: 4000,
      output_config: { effort: 'low' },
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: JSON.stringify(payload) }],
    });
  } catch (err) {
    const hint = explainAuthError(err);
    if (hint) { console.error(hint); process.exit(1); }
    console.error(red(`  ! batch ${i / BATCH_SIZE + 1}: ${err.message}`));
    continue;
  }

  tallyUsage(totals, response.usage);
  const rows = parseJsonArray(textOf(response));
  if (!rows) { console.error(red(`  ! batch ${i / BATCH_SIZE + 1}: unparseable`)); continue; }

  for (const row of rows) {
    const bot = batch.find((b) => b.slug === row?.slug);
    if (!bot) continue;
    // Anything outside the vocabulary is dropped, not trusted.
    const clean = (Array.isArray(row.integrations) ? row.integrations : [])
      .filter((x) => vocab.has(x))
      .slice(0, 5);
    bot.integrations = clean;
    if (clean.length) withAny += 1;
    if (!args.dryRun) await writeBotRecord(bot.slug, bot);
  }

  done += batch.length;
  process.stdout.write(dim(`  ${Math.min(done, queue.length)}/${queue.length}\n`));
}

console.log(`\n${green('✓')} ${withAny} of ${queue.length} bots have at least one integration`);
reportUsage(totals, args.model);
console.log('');
