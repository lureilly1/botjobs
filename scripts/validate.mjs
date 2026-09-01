#!/usr/bin/env node
/**
 * Validates every record in data/. Run by `pnpm validate`, by CI on every PR,
 * and by the pre-commit hook.
 *
 * This is the publication gate: if it fails, the record does not merge. The
 * rules themselves live in src/lib/records.js so the running site and this
 * script can never disagree.
 *
 *   node scripts/validate.mjs           validate everything
 *   node scripts/validate.mjs --quiet   errors only, no summary
 */
import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateBot, validateJob, validateDataset, jobStatus } from '../src/lib/records.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const QUIET = process.argv.includes('--quiet');

const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

/** Reads every *.json in a data directory, reporting parse errors rather than throwing. */
async function loadDir(kind) {
  const dir = join(ROOT, 'data', kind);
  if (!existsSync(dir)) return { records: [], failures: [] };

  const files = (await readdir(dir)).filter((f) => f.endsWith('.json'));
  const records = [];
  const failures = [];

  for (const file of files) {
    const slug = basename(file, '.json');
    try {
      records.push({ slug, file: `data/${kind}/${file}`, record: JSON.parse(await readFile(join(dir, file), 'utf8')) });
    } catch (err) {
      failures.push({ file: `data/${kind}/${file}`, errors: [`invalid JSON: ${err.message}`] });
    }
  }
  return { records, failures };
}

const [jobsLoad, botsLoad] = await Promise.all([loadDir('jobs'), loadDir('bots')]);

const problems = [...jobsLoad.failures, ...botsLoad.failures];

for (const { slug, file, record } of botsLoad.records) {
  const errors = validateBot(record, slug);
  if (errors.length) problems.push({ file, errors });
}

for (const { slug, file, record } of jobsLoad.records) {
  const errors = validateJob(record, slug);
  if (errors.length) problems.push({ file, errors });
}

problems.push(...validateDataset(jobsLoad.records, botsLoad.records));

/* ------------------------------------------------------------------ report */

if (problems.length) {
  // Merge errors reported against the same file from different passes.
  const byFile = new Map();
  for (const { file, errors } of problems) {
    byFile.set(file, [...(byFile.get(file) ?? []), ...errors]);
  }

  console.error('');
  for (const [file, errors] of [...byFile].sort()) {
    console.error(bold(red('✗ ')) + bold(file));
    for (const err of errors) console.error('  ' + red('•') + ' ' + err);
    console.error('');
  }
  const count = [...byFile.values()].reduce((n, e) => n + e.length, 0);
  console.error(red(bold(`${count} problem${count === 1 ? '' : 's'} in ${byFile.size} file${byFile.size === 1 ? '' : 's'}`)));
  process.exit(1);
}

if (!QUIET) {
  const jobs = jobsLoad.records.map((j) => j.record);
  const published = jobs.filter((j) => j.publish);
  const open = published.filter((j) => jobStatus(j) === 'open');
  const drafted = published.filter((j) => j.introCurated === false);

  console.log('');
  console.log(green(bold('✓ all records valid')));
  console.log(
    dim(
      `  ${botsLoad.records.length} bots · ${jobs.length} jobs ` +
        `(${published.length} published, ${open.length} open, ${drafted.length} with drafted intros)`
    )
  );
  console.log('');
}
