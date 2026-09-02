#!/usr/bin/env node
/**
 * SEO invariants, checked against the running site rather than the source.
 *
 * These are rules the project keeps repeating in prose — no invented ratings,
 * the sitemap only carries indexable pages, facets stay out of the index. Prose
 * rules decay; this one runs in CI.
 *
 *   pnpm build && node scripts/check-seo.mjs
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = Number(process.env.SEO_CHECK_PORT ?? 4488);
const BASE = `http://127.0.0.1:${PORT}`;

const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

const failures = [];
const fail = (msg) => failures.push(msg);

const server = spawn('node', ['./dist/server/entry.mjs'], {
  env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1' },
  stdio: 'ignore',
});

const get = async (path) => {
  const res = await fetch(`${BASE}${path}`);
  return { status: res.status, body: await res.text() };
};

try {
  // Wait for the server rather than guessing at a sleep duration.
  for (let i = 0; i < 40; i += 1) {
    try {
      await fetch(BASE);
      break;
    } catch {
      await sleep(250);
    }
  }

  /* ------------------------------------------------------------- sitemap */

  const sitemap = await get('/sitemap.xml');
  if (sitemap.status !== 200) fail(`sitemap.xml returned ${sitemap.status}`);

  const locs = [...sitemap.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  if (locs.length === 0) fail('sitemap.xml contains no URLs');
  console.log(dim(`  sitemap: ${locs.length} URLs`));

  const paths = locs.map((u) => new URL(u).pathname + new URL(u).search);

  // Every sitemap URL must resolve AND must not be noindex. A URL listed as
  // worth indexing while telling crawlers not to index it is a contradiction,
  // and it is the single easiest SEO mistake to ship without noticing.
  let checked = 0;
  for (const path of paths) {
    const page = await get(path);
    if (page.status !== 200) {
      fail(`sitemap lists ${path} but it returns ${page.status}`);
      continue;
    }
    if (/name=["']robots["'][^>]*noindex/i.test(page.body)) {
      fail(`sitemap lists ${path} but the page is noindex`);
    }
    if (!/<link rel=["']canonical["']/i.test(page.body)) {
      fail(`${path} has no canonical link`);
    }
    checked += 1;
  }
  console.log(dim(`  checked ${checked} sitemap pages for noindex + canonical`));

  /* ------------------------------------------- no invented review ratings */

  // Google requires review snippets to come from real users. We have none, so
  // an internal fit score rendered as a rating would be an invented one.
  const sampled = [
    '/',
    '/grok-bot/jobs',
    '/grok-bot/jobs/inbox-management',
    '/grok-bot/bots',
    '/grok-bot/bots/inbox-zero',
    '/submit',
  ];
  for (const path of sampled) {
    const page = await get(path);
    for (const banned of ['aggregateRating', 'AggregateRating', '"@type": "Review"', 'ratingValue']) {
      if (page.body.includes(banned)) fail(`${path} contains ${banned} — we have no user reviews`);
    }
    // The star-rating prohibition applies to the rendered UI too.
    if (/★|⭐/.test(page.body)) fail(`${path} renders a star glyph`);
  }
  console.log(dim(`  checked ${sampled.length} pages for invented ratings`));

  /* ------------------------------------------------ facets stay unindexed */

  const facet = await get('/grok-bot/search?q=inbox');
  if (facet.status === 200 && !/name=["']robots["'][^>]*noindex/i.test(facet.body)) {
    fail('search results are indexable — faceted URLs must be noindex, follow');
  }
  if (paths.some((p) => p.includes('/search'))) fail('sitemap contains a search URL');
  if (paths.some((p) => p.startsWith('/report'))) fail('sitemap contains /report');

  /* ---------------------------------------------------------------- robots */

  const robots = await get('/robots.txt');
  if (robots.status !== 200) fail(`robots.txt returned ${robots.status}`);
  if (!robots.body.includes('Sitemap:')) fail('robots.txt does not reference the sitemap');
} finally {
  server.kill('SIGKILL');
}

if (failures.length) {
  console.error('');
  for (const f of failures) console.error(red('  ✗ ') + f);
  console.error(red(`\n${failures.length} SEO problem${failures.length === 1 ? '' : 's'}\n`));
  process.exit(1);
}

console.log(green('\n✓ SEO invariants hold\n'));
