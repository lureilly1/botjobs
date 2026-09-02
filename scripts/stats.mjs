#!/usr/bin/env node
/**
 * Read the events log.
 *
 * Answers the questions the plan actually asks: are pages indexed and getting
 * traffic, which jobs earn install clicks, what are people searching for that
 * the board does not answer.
 *
 *   node scripts/stats.mjs            last 30 days
 *   node scripts/stats.mjs --days=7
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const DATA_DIR = process.env.DATA_DIR ?? 'data/private';
const days = Number(process.argv.find((a) => a.startsWith('--days='))?.split('=')[1]) || 30;

const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

let raw = '';
try {
  raw = await readFile(join(DATA_DIR, 'events.jsonl'), 'utf8');
} catch {
  console.log('\nNo events yet. The log appears once the site has served a request.\n');
  process.exit(0);
}

const since = Date.now() - days * 864e5;
const rows = raw
  .split('\n')
  .filter(Boolean)
  .map((l) => { try { return JSON.parse(l); } catch { return null; } })
  .filter((r) => r && new Date(r.t).getTime() > since);

if (!rows.length) {
  console.log(`\nNothing in the last ${days} days.\n`);
  process.exit(0);
}

const by = (rs, k) => rs.reduce((m, r) => (r[k] ? ((m[r[k]] = (m[r[k]] || 0) + 1), m) : m), {});
const top = (obj, n = 10) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n);
const table = (title, entries, empty = 'nothing yet') => {
  console.log(`\n${bold(title)}`);
  if (!entries.length) return console.log(dim(`  ${empty}`));
  const w = Math.max(...entries.map(([k]) => k.length));
  for (const [k, n] of entries) console.log(`  ${String(n).padStart(5)}  ${k.padEnd(w)}`);
};

const views = rows.filter((r) => r.event === 'page_view');
const installs = rows.filter((r) => r.event === 'bot_install_click');
const searches = rows.filter((r) => r.event === 'search');
const visitors = new Set(rows.map((r) => r.v)).size;

console.log(`\n${bold(`Last ${days} days`)}`);
console.log(`  ${views.length} page views · ${visitors} visitors · ${installs.length} install clicks`);
// The number the plan calls the single most important one.
if (views.length) {
  console.log(dim(`  install clicks per 100 views: ${((installs.length / views.length) * 100).toFixed(1)}`));
}

table('Most viewed', top(by(views, 'path')));
table('Install clicks by bot', top(by(installs, 'slug')), 'no install clicks yet');
table('Install clicks by job', top(by(installs, 'job')), 'none attributed to a job yet');
table('Searches', top(by(searches, 'query'), 15), 'no searches yet');
table('Referrers', top(by(rows, 'ref')), 'all direct so far');

// Searches that found nothing are the demand signal for the next jobs to add.
console.log('');
