/**
 * Shared Anthropic client for the authoring scripts.
 *
 * Neither script publishes anything. Both write their output into the JSON
 * records as a git diff for review, and the validator still gates what reaches
 * the site — so a bad generation costs a `git checkout`, not a bad page.
 */
import Anthropic from '@anthropic-ai/sdk';

export const DEFAULT_MODEL = 'claude-opus-5';

export function makeClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(
      '\n\x1b[31mANTHROPIC_API_KEY is not set.\x1b[0m\n' +
        '  cp .env.example .env, add your key, then re-run with:\n' +
        '  node --env-file=.env scripts/<script>.mjs\n'
    );
    process.exit(1);
  }
  return new Anthropic();
}

/**
 * Extract a JSON array from a model response.
 *
 * Defensive on purpose: a fenced block, a leading sentence, or trailing prose
 * all show up occasionally, and losing a whole batch to a stray backtick is a
 * silly way to spend money.
 */
export function parseJsonArray(text) {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const raw = (fenced ? fenced[1] : text).trim();

  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) return null;

  try {
    const parsed = JSON.parse(raw.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Text content of a response, concatenated. */
export function textOf(response) {
  return response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

export function parseArgs(argv) {
  const args = argv.slice(2);
  const get = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
  return {
    model: get('model') ?? process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL,
    only: get('only') ?? null,
    limit: Number(get('limit')) || Infinity,
    dryRun: args.includes('--dry-run'),
    force: args.includes('--force'),
  };
}

export const dim = (s) => `\x1b[2m${s}\x1b[0m`;
export const green = (s) => `\x1b[32m${s}\x1b[0m`;
export const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
export const red = (s) => `\x1b[31m${s}\x1b[0m`;

/** Rough spend report so a run's cost is never a surprise. */
export function reportUsage(totals, model) {
  const rates = {
    'claude-opus-5': { in: 5, out: 25 },
    'claude-sonnet-5': { in: 2, out: 10 },
    'claude-haiku-4-5': { in: 1, out: 5 },
  }[model];

  const line =
    `${totals.input.toLocaleString()} in · ` +
    `${totals.cacheRead.toLocaleString()} cached · ` +
    `${totals.output.toLocaleString()} out`;

  if (!rates) return console.log(dim(`  ${line}`));

  // Cache reads bill at roughly a tenth of input; writes at roughly 1.25x.
  const cost =
    (totals.input / 1e6) * rates.in +
    (totals.cacheWrite / 1e6) * rates.in * 1.25 +
    (totals.cacheRead / 1e6) * rates.in * 0.1 +
    (totals.output / 1e6) * rates.out;

  console.log(dim(`  ${line}  ≈ $${cost.toFixed(2)} on ${model}`));
}

export function tallyUsage(totals, usage) {
  totals.input += usage.input_tokens ?? 0;
  totals.output += usage.output_tokens ?? 0;
  totals.cacheRead += usage.cache_read_input_tokens ?? 0;
  totals.cacheWrite += usage.cache_creation_input_tokens ?? 0;
  return totals;
}

export const emptyTotals = () => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
