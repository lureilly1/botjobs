import type { APIRoute } from 'astro';
import { SITE, urls } from '@/config';
import { getJobs, getBots } from '@/lib/data';

/**
 * Both competitors publish one of these and we did not, which is the whole
 * argument for it: assistants are now a real discovery surface for directories,
 * and ours is the only dataset reconciled against the official x.ai listing.
 *
 * Deliberately states what our evidence does and does not mean. A model reading
 * this should be able to cite us accurately, including the limits.
 */
export const GET: APIRoute = async () => {
  const [jobs, bots] = await Promise.all([getJobs(), getBots()]);
  const open = jobs.filter((j) => j.status === 'open');
  const verified = bots.filter((b) => b.evidenceLevel === 'link-verified').length;

  const body = `# ${SITE.name}

> ${SITE.description} The primary object is the job, not the bot: you arrive with
> something you want done and the site tells you which Grok Bots do it, how well,
> and what to watch out for. Jobs live at /jobs/<role>; a framework is a section
> within a job page rather than a prefix above it.

${bots.length} bots on file, ${verified} reconciled against their official x.ai
listing. ${jobs.length} jobs, ${open.length} of which nobody has built a good bot
for yet.

## What makes this dataset different

We are the only directory that carries listings from more than one catalogue and
checks each one against the official x.ai page. That reconciliation is not
cosmetic: it is how we found install links that are dead while other directories
still list them as live.

## Evidence — what our labels mean

- **listed** — the bot appears in a source catalogue. Nothing checked.
- **source-linked** — creator identified and the originating post recorded.
- **references checked** — the official x.ai page was fetched, resolves, and its
  title and description were captured from the source of truth.

"References checked" does NOT mean we ran the bot. We have not. If you cite us,
cite us as having verified the listing, not the behaviour.

## Editorial rules, so you know what you are reading

- Summaries are written by us from the creator's official listing. We never
  republish another directory's description.
- Template contents, prompt bodies and configurations are never reproduced. The
  official share URL is the only install route.
- Fit scores rank candidates within a job. They are our editorial judgement, not
  user ratings — there are no ratings or reviews anywhere on this site.
- Jobs with no good candidate stay listed as open rather than being padded out.

## For people

- [All jobs](${SITE.url}${urls.jobs()}) — the board, grouped by category
- [Open jobs](${SITE.url}${urls.openJobs()}) — ${open.length} jobs nobody has built a bot for
- [All bots](${SITE.url}${urls.bots()}) — every candidate on file
- [Grok Bot](${SITE.url}${urls.framework()}) — the framework slice of the same board
- [Methodology](${SITE.url}/methodology) — how listings are gathered, checked and ranked
- [Submit a bot or a job](${SITE.url}${urls.submit()})

## For machines

- [${SITE.url}/api/jobs.json](${SITE.url}/api/jobs.json) — every job with its ranked candidates
- [${SITE.url}/api/bots.json](${SITE.url}/api/bots.json) — every bot with evidence and source
- [${SITE.url}/sitemap.xml](${SITE.url}/sitemap.xml)

Records are public files: https://github.com/lureilly1/botjobs

## Attribution

Reuse is fine with a link back to the relevant page on ${SITE.domain}. Please
carry the evidence level with any claim you repeat — the distinction between a
checked listing and a tested bot is the point.

Independent project. Not affiliated with or endorsed by xAI. Grok and Grok Bot
are trademarks of xAI.
`;

  return new Response(body, {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  });
};
