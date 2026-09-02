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

export type SubmissionStatus =
  | 'queued'
  | 'drafting'
  /** Stored and waiting for a human. The normal end state without GitHub. */
  | 'received'
  | 'opened'
  | 'rejected'
  | 'failed';

export interface Submission {
  id: string;
  status: SubmissionStatus;
  kind: 'bot' | 'job' | 'report';
  input: {
    url?: string;
    /** Job submissions: what they want done, and the context around it. */
    title?: string;
    outcome?: string;
    tried?: string;
    /** The job page it was sent from, when it came from one. */
    fromJob?: string;
    /** Reports: the listing complained about, and which of the two it is. */
    bot?: string;
    reason?: 'removal' | 'correction';
    /** Optional, and only for reports — how to reach them about the outcome. */
    contact?: string;
    note: string;
    submitter?: string;
  };
  /** Set once a pull request exists. */
  prUrl?: string;
  /**
   * A validated record we drafted but had nowhere to push. `pnpm queue --write`
   * turns it into a file — the no-GitHub equivalent of opening a pull request.
   */
  draft?: { slug: string; record: Record<string, unknown> };
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

  let raw: string;
  try {
    raw = await readFile(STORE, 'utf8');
  } catch {
    // No file yet. The ordinary first-run case, and the only one worth
    // treating as an empty store.
    cache = { submissions: {}, hits: {} };
    return cache;
  }

  try {
    cache = JSON.parse(raw);
  } catch {
    // The file is there and will not parse. Carrying on from empty would mean
    // the next write replaces every stored submission with nothing, so refuse
    // to start instead of quietly destroying the queue.
    throw new Error(`Submissions store at ${STORE} exists but is unreadable.`);
  }
  return cache!;
}

/**
 * Atomic write: a torn file would lose every pending submission at once.
 *
 * Throws when the write fails — a read-only or full disk, most likely. That is
 * deliberate. The caller has to know the submission was not saved so it can say
 * so, because the alternative is telling someone we have their removal request
 * when we do not.
 */
async function persist(): Promise<void> {
  const attempt = writing.then(async () => {
    await mkdir(DATA_DIR, { recursive: true });
    const tmp = `${STORE}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(cache), 'utf8');
    await rename(tmp, STORE);
  });

  // The queue continues from a settled promise, not a rejected one. Assigning
  // `attempt` directly would leave every later write chained off a rejection
  // and failing without trying, so one transient error would poison the store
  // for the lifetime of the process.
  writing = attempt.catch(() => {});
  return attempt;
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

/** Everything waiting on a human, newest first. Read by `pnpm queue`. */
export async function pendingSubmissions(): Promise<Submission[]> {
  const store = await load();
  return Object.values(store.submissions)
    .filter((s) => s.status === 'received' || s.status === 'queued')
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** Has this share URL already been submitted recently, or already listed? */
export async function recentlySubmitted(url: string): Promise<boolean> {
  const store = await load();
  const cutoff = Date.now() - DAY;
  return Object.values(store.submissions).some(
    (s) => s.input.url === url && s.createdAt > cutoff && s.status !== 'failed'
  );
}
