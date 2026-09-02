import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';

/**
 * Submission state and rate limiting.
 *
 * File-backed rather than a database: at a handful of submissions a day a JSON
 * file written atomically is entirely adequate, and it keeps the runtime
 * dependency-free. DATA_DIR must point outside the repo in production so user
 * input can never be committed.
 */

const DATA_DIR = process.env.DATA_DIR ?? 'data/private';
const STORE = join(DATA_DIR, 'submissions.json');

export type SubmissionStatus = 'queued' | 'drafting' | 'opened' | 'rejected' | 'failed';

export interface Submission {
  id: string;
  status: SubmissionStatus;
  kind: 'bot' | 'job';
  input: { url?: string; title?: string; note: string; submitter?: string };
  /** Set once a pull request exists. */
  prUrl?: string;
  /** Human-readable reason, shown to the submitter. Never a stack trace. */
  message?: string;
  createdAt: number;
}

interface StoreShape {
  submissions: Record<string, Submission>;
  /** ipHash -> timestamps, trimmed on read. */
  hits: Record<string, number[]>;
}

let cache: StoreShape | null = null;
let writing: Promise<void> = Promise.resolve();

async function load(): Promise<StoreShape> {
  if (cache) return cache;
  try {
    cache = JSON.parse(await readFile(STORE, 'utf8'));
  } catch {
    cache = { submissions: {}, hits: {} };
  }
  return cache!;
}

/** Atomic write: a torn file would lose every pending submission at once. */
async function persist(): Promise<void> {
  writing = writing.then(async () => {
    await mkdir(DATA_DIR, { recursive: true });
    const tmp = `${STORE}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(cache), 'utf8');
    await rename(tmp, STORE);
  });
  return writing;
}

/** IPs are hashed. We need to count them, not know them. */
const hashIp = (ip: string) =>
  createHash('sha256').update(`${ip}:${process.env.IP_SALT ?? 'botjobs'}`).digest('hex').slice(0, 16);

export const LIMITS = {
  perIpPerHour: 3,
  globalPerHour: 40,
  globalPerDay: 200,
};

const HOUR = 3600_000;
const DAY = 24 * HOUR;

/**
 * @returns null when allowed, or a message when the caller should back off.
 */
export async function checkRateLimit(ip: string): Promise<string | null> {
  const store = await load();
  const now = Date.now();
  const key = hashIp(ip);

  for (const [k, times] of Object.entries(store.hits)) {
    const kept = times.filter((t) => now - t < DAY);
    if (kept.length) store.hits[k] = kept;
    else delete store.hits[k];
  }

  const mine = store.hits[key] ?? [];
  if (mine.filter((t) => now - t < HOUR).length >= LIMITS.perIpPerHour) {
    return 'That is three submissions in an hour from here. Try again shortly.';
  }

  const all = Object.values(store.hits).flat();
  if (all.filter((t) => now - t < HOUR).length >= LIMITS.globalPerHour) {
    return 'We are taking more submissions than usual right now. Try again in an hour.';
  }
  if (all.length >= LIMITS.globalPerDay) {
    return 'We have hit today’s submission limit. Try again tomorrow.';
  }

  store.hits[key] = [...mine, now];
  await persist();
  return null;
}

export async function createSubmission(
  input: Submission['input'],
  kind: Submission['kind']
): Promise<Submission> {
  const store = await load();
  const submission: Submission = {
    id: randomUUID(),
    status: 'queued',
    kind,
    input,
    createdAt: Date.now(),
  };
  store.submissions[submission.id] = submission;
  await persist();
  return submission;
}

export async function updateSubmission(
  id: string,
  patch: Partial<Omit<Submission, 'id'>>
): Promise<void> {
  const store = await load();
  const existing = store.submissions[id];
  if (!existing) return;
  store.submissions[id] = { ...existing, ...patch };
  await persist();
}

export async function getSubmission(id: string): Promise<Submission | null> {
  const store = await load();
  return store.submissions[id] ?? null;
}

/** Has this share URL already been submitted recently, or already listed? */
export async function recentlySubmitted(url: string): Promise<boolean> {
  const store = await load();
  const cutoff = Date.now() - DAY;
  return Object.values(store.submissions).some(
    (s) => s.input.url === url && s.createdAt > cutoff && s.status !== 'failed'
  );
}
