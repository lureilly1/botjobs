import type { APIRoute } from 'astro';
import { getBot } from '@/lib/data';
import { record } from '@/lib/analytics';

/**
 * Outbound hop for "Add to Grok".
 *
 * The spec names organic clicks to install pages as the single most important
 * metric on the site, and a client-side beacon is the worst possible way to
 * measure one: the browser is already navigating away when it fires, and this
 * site ships no JavaScript to fire it with. A redirect cannot miss.
 *
 * The destination is always the bot's own official x.ai URL from our records —
 * never anything supplied in the request — so this cannot be used as an open
 * redirect. `noindex` and a robots disallow keep it out of the index, and it is
 * a 302 because the hop is ours, not a permanent home for the resource.
 */
export const GET: APIRoute = async ({ params, request, url }) => {
  const bot = getBot(params.slug!);
  if (!bot) return new Response(null, { status: 404 });

  // Which job page sent them, when we know — it turns install clicks into a
  // per-job conversion rate rather than one undifferentiated total.
  const job = url.searchParams.get('job')?.slice(0, 80) || undefined;

  await record(request, 'bot_install_click', { slug: bot.slug, job });

  return new Response(null, {
    status: 302,
    headers: {
      location: bot.grokShareUrl,
      'x-robots-tag': 'noindex, nofollow',
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
    },
  });
};
