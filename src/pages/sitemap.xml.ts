import type { APIRoute } from 'astro';
import { SITE, urls } from '@/config';
import { getJobs, getBots, isBotIndexable } from '@/lib/data';

/**
 * The sitemap is a claim about what is worth indexing, so it only carries pages
 * that earn it.
 *
 * Excluded on purpose:
 *  - unplaced bot pages (noindex — see isBotIndexable)
 *  - /report and anything else marked noindex
 *  - search and faceted URLs, which are noindex, follow
 *
 * A URL appearing here while carrying noindex is a contradictory signal, so the
 * two rules are derived from the same predicate rather than maintained apart.
 */
export const GET: APIRoute = async () => {
  const [jobs, bots] = await Promise.all([getJobs(), getBots()]);

  const entries: Array<{ path: string; lastmod?: string; priority: string }> = [
    { path: urls.home(), priority: '1.0' },
    { path: urls.jobs(), priority: '0.9' },
    { path: urls.openJobs(), priority: '0.8' },
    { path: urls.bots(), priority: '0.6' },
    { path: urls.submit(), priority: '0.5' },
  ];

  for (const job of jobs) {
    entries.push({ path: urls.job(job.slug), priority: job.bots.length ? '0.9' : '0.7' });
  }

  for (const bot of bots.filter(isBotIndexable)) {
    entries.push({
      path: urls.bot(bot.slug),
      lastmod: bot.lastVerifiedAt,
      priority: '0.5',
    });
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries
  .map(
    ({ path, lastmod, priority }) =>
      `  <url>\n    <loc>${new URL(path, SITE.url).href}</loc>` +
      (lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : '') +
      `\n    <priority>${priority}</priority>\n  </url>`
  )
  .join('\n')}
</urlset>
`;

  return new Response(xml, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
};
