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

  // Two destinations, both taken from our own records: the install link and the
  // creator's originating post. The spec counts source clicks separately —
  // people reading the original thread is a different signal from people
  // installing, and it is the one that says an attribution is worth having.
  const wantsSource = url.searchParams.get('to') === 'source';
  const destination = wantsSource ? bot.sourceUrl : bot.grokShareUrl;
  if (!destination) return new Response(null, { status: 404 });

  await record(request, wantsSource ? 'source_click' : 'bot_install_click', {
    slug: bot.slug,
    job,
  });

  return new Response(null, {
    status: 302,
    headers: {
      location: destination,
      'x-robots-tag': 'noindex, nofollow',
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
    },
  });
};
