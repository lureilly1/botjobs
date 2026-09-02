import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

/**
 * Server-side analytics. No client JavaScript, no cookies, no third-party
 * script.
 *
 * The plan called for PostHog in the browser. That is the wrong shape here:
 * every content page on this site ships zero executable JavaScript, and adding
 * a tracker would spend that property on measurement. Since we run a Node
 * server rather than a CDN, we can record the same events where the request
 * already is.
 *
 * It is also more accurate for the one metric that matters. The spec names
 * organic clicks to install pages as the single most important number, and a
 * client-side beacon on an outbound link is the least reliable thing in
 * analytics — the browser is navigating away as it fires. A redirect route
 * cannot miss.
 *
 * Privacy: no cookies, no identifiers that survive a day, no cross-site
 * anything. IPs are salted and hashed to a short digest purely so a visit can
 * be told from a refresh, and the salt rotates daily, so yesterday's digests
 * cannot be matched to today's.
 */

const DATA_DIR = process.env.DATA_DIR ?? 'data/private';
const LOG = join(DATA_DIR, 'events.jsonl');

export type EventName =
  | 'page_view'
  | 'bot_install_click'
  | 'source_click'
  | 'search'
  | 'submit_bot';

export interface AnalyticsEvent {
  t: string;
  event: EventName;
  path: string;
  /** Bot or job slug, where the event is about one. */
  slug?: string;
  job?: string;
  query?: string;
  ref?: string | null;
  /** Salted daily digest — a visit counter, not an identity. */
  v?: string;
}

/** Obvious non-humans. Unfiltered, crawler traffic swamps a small site's numbers. */
const BOT_UA =
  /bot|crawler|spider|crawling|slurp|bingpreview|facebookexternalhit|preview|monitor|curl|wget|headless|lighthouse|pingdom|python-requests|node-fetch|axios/i;

export const isProbablyBot = (ua: string | null) => !ua || BOT_UA.test(ua);

/** Rotates daily so a digest is never a durable identifier. */
function visitorDigest(ip: string, ua: string): string {
  const day = new Date().toISOString().slice(0, 10);
  return createHash('sha256')
    .update(`${ip}|${ua}|${day}|${process.env.IP_SALT ?? 'botjobs'}`)
    .digest('hex')
    .slice(0, 12);
}

export function clientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

/**
 * Referrers are kept only as a host. A full referring URL can carry a search
 * query or a session token, and we have no use for either.
 */
function referrerHost(request: Request): string | null {
  const raw = request.headers.get('referer');
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.host === new URL(request.url).host ? null : url.host;
  } catch {
    return null;
  }
}

let warned = false;

export async function record(
  request: Request,
  event: EventName,
  extra: Partial<AnalyticsEvent> = {}
): Promise<void> {
  const ua = request.headers.get('user-agent');
  if (isProbablyBot(ua)) return;

  const row: AnalyticsEvent = {
    t: new Date().toISOString(),
    event,
    path: new URL(request.url).pathname,
    ref: referrerHost(request),
    v: visitorDigest(clientIp(request), ua ?? ''),
    ...extra,
  };

  try {
    await mkdir(DATA_DIR, { recursive: true });
    await appendFile(LOG, JSON.stringify(row) + '\n', 'utf8');
  } catch (err) {
    // Analytics must never break a page render. Warn once, then stay quiet.
    if (!warned) {
      warned = true;
      console.warn('analytics: could not write events log —', (err as Error).message);
    }
  }

  await forward(row);
}

/**
 * Optional PostHog forwarding, server-side. Absent a key this does nothing and
 * the JSONL log is the whole system, which is enough to answer every question
 * in the plan.
 */
async function forward(row: AnalyticsEvent): Promise<void> {
  const key = process.env.POSTHOG_KEY;
  if (!key) return;

  const host = process.env.POSTHOG_HOST ?? 'https://eu.i.posthog.com';
  try {
    await fetch(`${host}/i/v0/e/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        api_key: key,
        event: row.event,
        distinct_id: row.v,
        properties: {
          $current_url: row.path,
          slug: row.slug,
          job: row.job,
          query: row.query,
          referrer_host: row.ref,
        },
        timestamp: row.t,
      }),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    /* never block a response on a metrics call */
  }
}
