import type { APIRoute } from 'astro';
import { SHARE_URL_RE } from '@/lib/records.js';
import {
  checkRateLimit,
  createSubmission,
  updateSubmission,
  getSubmission,
  recentlySubmitted,
} from '@/lib/submit/store';
import { draftBotRecord } from '@/lib/submit/draft';
import { record } from '@/lib/analytics';
import { openRecordPr, submitConfigured } from '@/lib/submit/github';

export const prerender = false;

const MAX_BODY = 4000;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

const clientIp = (request: Request) =>
  request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
  request.headers.get('x-real-ip') ||
  'unknown';

/**
 * Accept a submission and return immediately.
 *
 * Drafting takes ten to twenty seconds, which is far too long to hold a
 * request open, so the work runs after the response and the page polls GET
 * for the outcome.
 */
export const POST: APIRoute = async ({ request }) => {
  if (!submitConfigured()) {
    return json({ error: 'Submissions are not enabled on this deployment.' }, 503);
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY) return json({ error: 'That is too long.' }, 413);

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: 'Malformed request.' }, 400);
  }

  // Honeypot: a field hidden from people and irresistible to naive bots.
  // Answer 202 rather than an error so a scraper learns nothing from the shape
  // of the response.
  if (typeof body.website === 'string' && body.website.trim()) {
    return json({ id: crypto.randomUUID(), status: 'queued' }, 202);
  }

  const url = String(body.url ?? '').trim();
  const note = String(body.note ?? '').trim();
  const submitter = String(body.submitter ?? '').trim().slice(0, 60);

  if (!SHARE_URL_RE.test(url)) {
    return json({ error: 'That needs to be an official x.ai/bot/… share link.' }, 400);
  }
  if (note.length > 500) return json({ error: 'Keep the note under 500 characters.' }, 400);

  if (await recentlySubmitted(url)) {
    return json({ error: 'That bot has already been submitted recently.' }, 409);
  }

  const limited = await checkRateLimit(clientIp(request));
  if (limited) return json({ error: limited }, 429);

  const submission = await createSubmission({ url, note, submitter }, 'bot');
  void record(request, 'submit_bot');

  // Fire-and-forget. Failures are recorded on the submission, never thrown into
  // a request nobody is listening to.
  void (async () => {
    try {
      await updateSubmission(submission.id, { status: 'drafting' });

      const draft = await draftBotRecord(url, note);
      if (!draft.ok) {
        await updateSubmission(submission.id, { status: 'rejected', message: draft.reason });
        return;
      }

      const prUrl = await openRecordPr({
        slug: draft.slug!,
        record: draft.record!,
        note,
        submitter,
      });
      await updateSubmission(submission.id, { status: 'opened', prUrl });
    } catch (err) {
      console.error('submission failed', submission.id, err);
      await updateSubmission(submission.id, {
        status: 'failed',
        message: 'Something broke on our side. Nothing was lost — try again shortly.',
      });
    }
  })();

  return json({ id: submission.id, status: 'queued' }, 202);
};

/** Polled by the form until the submission reaches a terminal state. */
export const GET: APIRoute = async ({ url }) => {
  const id = url.searchParams.get('id');
  if (!id) return json({ error: 'Missing id.' }, 400);

  const submission = await getSubmission(id);
  if (!submission) return json({ error: 'Unknown submission.' }, 404);

  return json({
    status: submission.status,
    prUrl: submission.prUrl,
    message: submission.message,
  });
};
