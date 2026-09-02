/**
 * Open a pull request for a drafted record.
 *
 * The token belongs to a bot account and is scoped to that account's FORK, not
 * to the real repository. A leaked token vandalises a fork nobody reads; it
 * cannot touch main, cannot merge, and cannot rewrite history. That property is
 * the whole reason submissions go through a PR rather than a write endpoint.
 *
 * Required env (all absent = the feature is simply off):
 *   SUBMIT_GITHUB_TOKEN   PAT for the bot account, contents:write on its fork
 *   SUBMIT_FORK           owner/repo of the fork, e.g. botjobs-bot/botjobs
 *   SUBMIT_UPSTREAM       owner/repo of the real repo
 */

const API = 'https://api.github.com';

export const submitConfigured = () =>
  Boolean(process.env.SUBMIT_GITHUB_TOKEN && process.env.SUBMIT_FORK && process.env.SUBMIT_UPSTREAM);

interface GhOptions {
  method?: string;
  body?: unknown;
}

async function gh<T>(path: string, { method = 'GET', body }: GhOptions = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${process.env.SUBMIT_GITHUB_TOKEN}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'content-type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    throw new Error(`GitHub ${method} ${path} → ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');

/**
 * @returns the pull request URL
 */
export async function openRecordPr(opts: {
  slug: string;
  record: Record<string, unknown>;
  note: string;
  submitter?: string;
}): Promise<string> {
  const fork = process.env.SUBMIT_FORK!;
  const upstream = process.env.SUBMIT_UPSTREAM!;

  // Branch from upstream's current main so the PR is a clean single-file add.
  const base = await gh<{ object: { sha: string } }>(`/repos/${upstream}/git/ref/heads/main`);
  const branch = `submit/${opts.slug}-${Date.now().toString(36)}`;

  // Keep the fork's main in step, otherwise the branch is cut from stale history.
  await gh(`/repos/${fork}/git/refs/heads/main`, {
    method: 'PATCH',
    body: { sha: base.object.sha, force: true },
  }).catch(() => {
    /* a fresh fork may already be level; not worth failing the submission */
  });

  await gh(`/repos/${fork}/git/refs`, {
    method: 'POST',
    body: { ref: `refs/heads/${branch}`, sha: base.object.sha },
  });

  const path = `data/bots/${opts.slug}.json`;
  await gh(`/repos/${fork}/contents/${path}`, {
    method: 'PUT',
    body: {
      branch,
      message: `Add ${opts.record.name}`,
      content: b64(JSON.stringify(opts.record, null, 2) + '\n'),
    },
  });

  const attribution = opts.submitter?.trim()
    ? `Submitted by ${opts.submitter.trim().slice(0, 60)}.`
    : 'Submitted anonymously.';

  const pr = await gh<{ html_url: string }>(`/repos/${upstream}/pulls`, {
    method: 'POST',
    body: {
      title: `Add ${opts.record.name}`,
      head: `${fork.split('/')[0]}:${branch}`,
      base: 'main',
      maintainer_can_modify: true,
      body: [
        `Drafted from a submission on the site. ${attribution}`,
        '',
        `**Official listing:** ${opts.record.grokShareUrl}`,
        '',
        '**What the submitter said** (untrusted, for context only):',
        '',
        // Fenced so a note cannot forge markdown or inject a review comment.
        '```',
        opts.note.slice(0, 500).replace(/```/g, "'''"),
        '```',
        '',
        '---',
        'The description was written from the official x.ai listing, not copied from',
        'a source directory, and it passed the same similarity check CI runs. Check',
        'the wording reads like us before merging.',
      ].join('\n'),
    },
  });

  return pr.html_url;
}
