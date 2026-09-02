import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getJobs } from '@/lib/data';
import type { AnalyticsEvent } from '@/lib/analytics';

/**
 * Summarise the events log for the public stats page.
 *
 * Cached for a minute: the page is linked from the footer, the log grows
 * without bound, and re-reading it on every request would turn a nice-to-have
 * into the slowest page on the site.
 */

const DATA_DIR = process.env.DATA_DIR ?? 'data/private';
const LOG = join(DATA_DIR, 'events.jsonl');
const TTL_MS = 60_000;
/** Enough to answer "last 30 days" without parsing a year of history. */
const MAX_BYTES = 4_000_000;

export interface Stats {
  views: number;
  visitors: number;
  installs: number;
  searches: number;
  topJobs: Array<{ slug: string; title: string; n: number }>;
  unmetSearches: string[];
}

let cache: { at: number; value: Stats | null } | null = null;

export async function readStats(days = 30): Promise<Stats | null> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;

  let raw: string;
  try {
    raw = await readFile(LOG, 'utf8');
  } catch {
    cache = { at: Date.now(), value: null };
    return null;
  }

  if (raw.length > MAX_BYTES) raw = raw.slice(raw.length - MAX_BYTES);

  const since = Date.now() - days * 864e5;
  const rows: AnalyticsEvent[] = [];
  for (const line of raw.split('\n')) {
    if (!line) continue;
    try {
      const row = JSON.parse(line) as AnalyticsEvent;
      if (new Date(row.t).getTime() > since) rows.push(row);
    } catch {
      // A truncated first line is expected after slicing; skip it.
    }
  }

  if (!rows.length) {
    cache = { at: Date.now(), value: null };
    return null;
  }

  const views = rows.filter((r) => r.event === 'page_view');
  const searches = rows.filter((r) => r.event === 'search');
  const jobs = await getJobs();
  const bySlug = new Map(jobs.map((j) => [j.slug, j.title]));

  const jobHits = new Map<string, number>();
  for (const view of views) {
    const slug = /\/jobs\/([^/]+)$/.exec(view.path)?.[1];
    if (slug && bySlug.has(slug)) jobHits.set(slug, (jobHits.get(slug) ?? 0) + 1);
  }

  // A search matching no job title is the honest signal for what to add next,
  // which is why it is worth publishing rather than hiding.
  const titles = jobs.map((j) => `${j.title} ${j.searchIntent}`.toLowerCase());
  const unmet = new Map<string, number>();
  for (const s of searches) {
    const q = s.query?.trim().toLowerCase();
    if (!q || q.length < 3) continue;
    const covered = titles.some((t) => t.includes(q));
    if (!covered) unmet.set(q, (unmet.get(q) ?? 0) + 1);
  }

  const value: Stats = {
    views: views.length,
    visitors: new Set(rows.map((r) => r.v)).size,
    installs: rows.filter((r) => r.event === 'bot_install_click').length,
    searches: searches.length,
    topJobs: [...jobHits.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([slug, n]) => ({ slug, title: bySlug.get(slug)!, n })),
    unmetSearches: [...unmet.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([q]) => q),
  };

  cache = { at: Date.now(), value };
  return value;
}
