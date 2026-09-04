import { defineMiddleware, sequence } from 'astro:middleware';
import { record } from '@/lib/analytics';
import { resolveRedirect } from '@/lib/redirects';

/**
 * The job-first restructure's 301s, served before anything else runs.
 *
 * Middleware rather than `redirects` in astro.config: the map has to fold the
 * role-noun rename into the path move so an old URL reaches its new one in a
 * single hop, and config redirects cannot do a lookup. See src/lib/redirects.ts
 * for why each rule is the way it is.
 *
 * The query string is carried across. A redirect that drops ?q= turns someone's
 * shared search result into an empty page.
 *
 * Redirects are not recorded as page views — they render nothing.
 */
const redirects = defineMiddleware((context, next) => {
  const target = resolveRedirect(context.url.pathname);
  if (!target) return next();
  return context.redirect(target + context.url.search, 301);
});

/**
 * Page views, recorded where the request already is.
 *
 * Only HTML responses that actually succeeded — counting a 404 or an asset as
 * a page view is how analytics starts lying to you. Recording happens after the
 * response is produced and is never awaited into the critical path.
 */
const analytics = defineMiddleware(async (context, next) => {
  const response = await next();

  const path = context.url.pathname;
  const isHtml = response.headers.get('content-type')?.includes('text/html');
  const isAsset = path.startsWith('/_astro') || path.startsWith('/og/') || path.includes('.');

  if (response.status === 200 && isHtml && !isAsset) {
    // Search is recorded with its query so we can see what people ask for that
    // the board does not answer — the demand signal for new jobs.
    if (path.endsWith('/search')) {
      const query = context.url.searchParams.get('q')?.slice(0, 120);
      if (query) void record(context.request, 'search', { query });
    } else {
      void record(context.request, 'page_view');
    }
  }

  return response;
});

// Redirects first: an old URL should never reach a page, and a 301 is not a
// page view.
export const onRequest = sequence(redirects, analytics);
