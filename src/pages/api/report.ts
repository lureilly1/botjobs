import type { APIRoute } from 'astro';
import { checkRateLimit, createSubmission, updateSubmission } from '@/lib/submit/store';
import { clientIp } from '@/lib/analytics';

export const prerender = false;

/**
 * Ask for a listing to be corrected or removed.
 *
 * This is the most important form on the site and it had the highest friction:
 * a creator who wanted their own bot taken down was sent to open a GitHub
 * issue. Someone asking to be removed from a directory should not have to join
 * a different one to do it.
 *
 * Deliberately the least demanding endpoint here. No rate limit surprises the
 * submitter with a refusal, no field is required beyond the reason, and it
 * never touches GitHub. A removal that does not get through is the one failure
 * mode this project cannot afford.
 */

const MAX = { note: 1000, contact: 120, bot: 80 };

const back = (params: Record<string, string>) =>
  new Response(null, {
    status: 303,
    headers: {
      location: `/report?${new URLSearchParams(params)}`,
      'cache-control': 'no-store',
    },
  });

export const POST: APIRoute = async ({ request }) => {
  const form = await request.formData().catch(() => null);
  if (!form) return new Response('Bad request', { status: 400 });

  const str = (k: string, max: number) => String(form.get(k) ?? '').trim().slice(0, max);

  // Honeypot. Answer as though it worked so a scraper learns nothing.
  if (String(form.get('website') ?? '').trim()) return back({ posted: '1' });

  const note = str('note', MAX.note);
  if (note.length < 4) return back({ error: 'short', bot: str('bot', MAX.bot) });

  try {
    // Rate limited, but generously: this is the takedown route, so a shared
    // office IP hitting the submission limit must not block a removal.
    const limited = await checkRateLimit(clientIp(request));

    const submission = await createSubmission(
      {
        bot: str('bot', MAX.bot) || undefined,
        reason: form.get('reason') === 'removal' ? 'removal' : 'correction',
        contact: str('contact', MAX.contact) || undefined,
        note,
        submitter: undefined,
      },
      'report'
    );
    await updateSubmission(submission.id, {
      status: 'received',
      message: limited ? 'Accepted over the rate limit — it is a report.' : undefined,
    });
  } catch (err) {
    // Of everything on this site, this is the request we least want to drop on
    // the floor. Say plainly that it did not save and point at the route that
    // does not depend on our disk.
    console.error('report: could not store request —', (err as Error).message);
    return back({ error: 'storage', bot: str('bot', MAX.bot) });
  }

  return back({ posted: '1' });
};

/** A bare GET is someone following the link from robots.txt or a bot page. */
export const GET: APIRoute = () =>
  new Response(null, { status: 303, headers: { location: '/report' } });
