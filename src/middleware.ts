import { defineMiddleware } from 'astro:middleware';
import { record } from '@/lib/analytics';

/**
 * Page views, recorded where the request already is.
 *
 * Only HTML responses that actually succeeded — counting a 404 or an asset as
 * a page view is how analytics starts lying to you. Recording happens after the
 * response is produced and is never awaited into the critical path.
 */
export const onRequest = defineMiddleware(async (context, next) => {
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
