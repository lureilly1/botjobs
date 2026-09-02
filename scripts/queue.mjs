#!/usr/bin/env node
/**
 * Everything waiting on a human — the inbox.
 *
 * Submissions never require a GitHub account from the submitter, and with no
 * fork token configured they never touch GitHub at all. So this is the whole
 * review surface:
 *
 *   pnpm queue           show what is waiting
 *   pnpm queue --write   write drafted bot records into data/bots/
 *
 * `--write` is deliberately a separate, explicit step. A drafted record is
 * validated but not read, and the validator is a gate, not an editor — run
 * `pnpm validate` and read the diff before committing anything it produces.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const DATA_DIR = process.env.DATA_DIR ?? 'data/private';
const write = process.argv.includes('--write');

const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[1;31m${s}\x1b[0m`;

let store;
try {
  store = JSON.parse(await readFile(join(DATA_DIR, 'submissions.json'), 'utf8'));
} catch {
  console.log('\nNothing submitted yet.\n');
  process.exit(0);
}

// Reports first, always. A removal has a 48-hour promise attached to it and a
// bot submission does not, so date order is the wrong order for this list.
const pending = Object.values(store.submissions ?? {})
  .filter((s) => s.status === 'received' || s.status === 'queued')
  .sort(
    (a, b) =>
      (b.kind === 'report') - (a.kind === 'report') || b.createdAt - a.createdAt
  );

if (!pending.length) {
  console.log('\nQueue is empty.\n');
  process.exit(0);
}

console.log(`\n${bold(`${pending.length} waiting`)}\n`);

let written = 0;
for (const s of pending) {
  const when = new Date(s.createdAt).toISOString().slice(0, 16).replace('T', ' ');
  const label = s.kind === 'report' ? red(s.input.reason === 'removal' ? 'REMOVAL' : 'CORRECTION') : bold(s.kind.toUpperCase());
  const who = s.input.submitter ?? s.input.contact ?? dim('anonymous');
  console.log(`${label}  ${dim(when)}  ${who}`);
  if (s.input.bot) console.log(`  data/bots/${s.input.bot}.json`);
  if (s.input.title) console.log(`  ${s.input.title}`);
  if (s.input.url) console.log(`  ${s.input.url}`);
  if (s.input.outcome) console.log(dim(`  wants:  ${s.input.outcome}`));
  if (s.input.tried) console.log(dim(`  tried:  ${s.input.tried}`));
  if (s.input.note) console.log(dim(`  note:   ${s.input.note}`));
  if (s.input.fromJob) console.log(dim(`  from:   ${s.input.fromJob}`));

  if (s.draft) {
    const path = join('data/bots', `${s.draft.slug}.json`);
    if (write) {
      await mkdir('data/bots', { recursive: true });
      await writeFile(path, `${JSON.stringify(s.draft.record, null, 2)}\n`, 'utf8');
      written += 1;
      console.log(green(`  wrote:  ${path}`));
    } else {
      console.log(dim(`  draft:  ${path} — pnpm queue --write`));
    }
  }
  console.log('');
}

if (written) {
  console.log(`${bold(`${written} record(s) written.`)} Now: pnpm validate, then read the diff.\n`);
}
