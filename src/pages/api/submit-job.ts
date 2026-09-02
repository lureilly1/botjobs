import type { APIRoute } from 'astro';
import { PATH_SEGMENT } from '@/config';
import { checkRateLimit, createSubmission, updateSubmission } from '@/lib/submit/store';
import { record, clientIp } from '@/lib/analytics';

export const prerender = false;

/**
 * Post a job — something you want a Grok Bot to do.
 *
 * Accepts a plain form POST and redirects, rather than taking JSON and needing
 * a script to send it. That means it works with JavaScript switched off, works
 * inside a <dialog> with no framework, and needs no GitHub account from the
 * submitter or GitHub credentials from us.
 *
 * A job is a sentence and some context, not a record we can safely draft and
 * open a pull request for — the taxonomy is the one asset here that stays
 * hand-written. So this stores and queues it, and a human adds it.
 */

const MAX = { title: 120, outcome: 500, tried: 500, submitter: 60 };

const back = (to: string, params: Record<string, string>) =>
  new Response(null, {
    status: 303,
    headers: {
      location: `${to}?${new URLSearchParams(params)}`,
      'cache-control': 'no-store',
    },
  });

export const POST: APIRoute = async ({ request }) => {
  const form = await request.formData().catch(() => null);
  if (!form) return new Response('Bad request', { status: 400 });

  const str = (k: string, max: number) => String(form.get(k) ?? '').trim().slice(0, max);

  // Where to send them back to — always a path on this site, never whatever
  // arrived in the form, or this becomes an open redirect.
  const raw = String(form.get('return') ?? '/submit');
  const to = raw.startsWith('/') && !raw.startsWith('//') ? raw.split('?')[0] : '/submit';

  // Honeypot: hidden from people, irresistible to naive bots. Answer as though
  // it worked so a scraper learns nothing from the response.
  if (String(form.get('website') ?? '').trim()) return back(to, { posted: '1' });

  const title = str('title', MAX.title);
  if (title.length < 8) return back(to, { error: 'short' });

  // Everything below writes to disk, and a read-only or full disk is the
  // realistic failure. It must not reach the submitter as a stack trace: they
  // typed something out and are entitled to know whether we kept it.
  try {
    const limited = await checkRateLimit(clientIp(request));
    if (limited) return back(to, { error: 'rate' });

    const submission = await createSubmission(
      {
        title,
        outcome: str('outcome', MAX.outcome),
        tried: str('tried', MAX.tried),
        fromJob: str('fromJob', 80) || undefined,
        submitter: str('submitter', MAX.submitter) || undefined,
        note: '',
      },
      'job'
    );

    // No pipeline to wait on: it is stored, and that is the finished state.
    await updateSubmission(submission.id, { status: 'received' });
  } catch (err) {
    console.error('submit-job: could not store submission —', (err as Error).message);
    return back(to, { error: 'storage' });
  }

  void record(request, 'submit_bot', { slug: undefined, job: title.slice(0, 80) });

  return back(to, { posted: '1' });
};

/** Anything else lands on the submit page rather than a bare 405. */
export const GET: APIRoute = () =>
  new Response(null, { status: 303, headers: { location: `/${PATH_SEGMENT ? 'submit' : 'submit'}` } });
