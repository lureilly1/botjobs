import type { APIRoute } from 'astro';
import { SITE, PATH_SEGMENT } from '@/config';

/**
 * Faceted and search URLs are noindex, follow at the page level; disallowing
 * them here as well would stop a crawler ever seeing that header. So they are
 * left crawlable on purpose and kept out of the index by the meta tag and the
 * sitemap instead.
 */
export const GET: APIRoute = () =>
  new Response(
    `User-agent: *
Allow: /

# Removal requests carry personal context and have no search value.
Disallow: /report

# Outbound hop for install links. The official x.ai URL is on every bot page.
Disallow: /go/

Sitemap: ${new URL('/sitemap.xml', SITE.url).href}
Llms-Txt: ${new URL('/llms.txt', SITE.url).href}

# Machine-readable: /llms.txt, /api/jobs.json, /api/bots.json
# Bot Jobs is an independent directory. Records are public files:
# https://github.com/lureilly1/botjobs
# Listings link to official x.ai share URLs and never reproduce template
# contents. Corrections and removals: ${new URL('/report', SITE.url).href}
# Job pages live under /${PATH_SEGMENT}/jobs/
`,
    { headers: { 'content-type': 'text/plain; charset=utf-8' } }
  );
