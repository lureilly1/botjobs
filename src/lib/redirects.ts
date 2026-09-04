/**
 * The redirect map for the job-first restructure.
 *
 * The site moved from framework-first (/grok-bot/jobs/chief-of-staff) to
 * job-first (/jobs/ai-chief-of-staff) because the job is the primary object and
 * a framework is a section within it. This module is what keeps the old URLs
 * working, permanently.
 *
 * FOUR RULES, and every one of them has cost somebody a migration:
 *
 * 1. 301, never 302. A temporary redirect tells Google to keep the old URL
 *    indexed and to pass nothing to the new one, which is the opposite of what
 *    a permanent move needs.
 *
 * 2. Page level, never to the homepage. /grok-bot/jobs/inbox-management goes to
 *    /jobs/inbox-management, not to /. A bulk redirect to the root is read as a
 *    soft 404 and the signal is lost rather than transferred.
 *
 * 3. No chains. The path move and the role-noun rename happened in the same
 *    deploy precisely so that /grok-bot/jobs/chief-of-staff reaches
 *    /jobs/ai-chief-of-staff in ONE hop. RENAMED_JOBS is applied while
 *    resolving, not as a second redirect afterwards — see resolveRedirect.
 *
 * 4. These are permanent. They cost nothing to serve and they do not get
 *    removed after "a few months".
 *
 * The old paths are the one place in the codebase besides config.ts allowed to
 * contain the literal 'grok-bot': their entire purpose is to keep answering
 * after PATH_SEGMENT changes, so deriving them from the constant would silently
 * break them on the next rename.
 */

/**
 * Job slugs that changed when the page was retitled as a role noun.
 *
 * Role nouns get searched and task descriptions do not: people look for the job
 * a human holds, not the workflow. The rest of the board is renamed the same
 * way once the pilot has been given long enough to say whether it works — one
 * line each, and this map is what keeps the old URL alive afterwards.
 */
export const RENAMED_JOBS: Record<string, string> = {
  'chief-of-staff': 'ai-chief-of-staff',
};

/** The final job path for a slug, old or current. Never returns an old slug. */
export function currentJobSlug(slug: string): string {
  return RENAMED_JOBS[slug] ?? slug;
}

/** Old framework-first prefixes, mapped to where that section now lives. */
const MOVED_SECTIONS: Array<[string, string]> = [
  ['/grok-bot/jobs', '/jobs'],
  ['/grok-bot/bots', '/bots'],
  ['/grok-bot/categories', '/categories'],
  ['/grok-bot/search', '/search'],
];

/**
 * Where a request should be sent, or null if it is already at its final URL.
 *
 * `pathname` only — the caller carries the query string across, because a
 * redirect that drops ?q= turns a shared search result into an empty page.
 */
export function resolveRedirect(pathname: string): string | null {
  // Trailing slashes are normalised before matching so /grok-bot/jobs/ and
  // /grok-bot/jobs resolve identically. Only the old paths are redirected —
  // normalising the whole site's trailing slashes is a separate decision and
  // would put a redirect in front of URLs that currently serve 200.
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;

  if (path === '' || path === '/grok-bot') return null;

  for (const [oldPrefix, newPrefix] of MOVED_SECTIONS) {
    if (path !== oldPrefix && !path.startsWith(`${oldPrefix}/`)) continue;
    const rest = path.slice(oldPrefix.length);
    // Rule 3: the rename is folded in here, so the move and the rename are a
    // single hop rather than two.
    const target = newPrefix + (newPrefix === '/jobs' ? renameJobPath(rest) : rest);
    return target;
  }

  // Someone arriving at the pre-rename slug on the new structure — a guess, or
  // a link written between the two states. One hop, same destination.
  const jobMatch = /^\/jobs\/([^/]+)$/.exec(path);
  if (jobMatch) {
    const renamed = RENAMED_JOBS[jobMatch[1]];
    if (renamed) return `/jobs/${renamed}`;
  }

  return null;
}

/** `/chief-of-staff` → `/ai-chief-of-staff`. Leaves `/open` and `` alone. */
function renameJobPath(rest: string): string {
  const match = /^\/([^/]+)$/.exec(rest);
  if (!match) return rest;
  const renamed = RENAMED_JOBS[match[1]];
  return renamed ? `/${renamed}` : rest;
}
