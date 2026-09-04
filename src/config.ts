/**
 * Site configuration.
 *
 * PATH_SEGMENT is deliberately a constant rather than a literal scattered
 * across routes. xAI's product naming is not stable (the Cursor merger is in
 * progress and reporting suggests brand consolidation), so a rename must cost
 * a config change and a redirect map — not 200 hand-edited routes.
 *
 * Nothing outside this file and src/lib/redirects.ts should ever contain the
 * string 'grok-bot'. The redirect map is the one exception: it has to name the
 * old paths literally, because their whole job is to keep serving after the
 * constant changes.
 *
 * It is no longer a path prefix. See below.
 */
export const PATH_SEGMENT = 'grok-bot';

/** Display name for the framework. Used wherever the hub speaks about itself. */
export const FRAMEWORK = 'Grok Bot';

export const SITE = {
  name: 'Bot Jobs',
  domain: 'botjobs.dev',
  url: 'https://botjobs.dev',
  tagline: 'Find the right bot for the job.',
  description: 'The independent directory of things you can get Grok Bot to do.',
} as const;

/**
 * VOICE — read this before writing any copy.
 *
 * This is a job board, and the bots are the candidates. Carry that metaphor
 * everywhere: jobs are filled or open, bots are put forward, references get
 * checked. Dry and understated, never zany — the joke is that we are taking a
 * pile of chatbots as seriously as a recruitment desk takes applicants.
 *
 * The humour comes from being straight about limits, not from exclamation
 * marks. "Nobody has applied" is funnier and more useful than "Oops, nothing
 * here yet!" — and it is also true, which is the point.
 *
 * One hard exception: anything making a claim about evidence stays literal.
 * A reader must never finish a sentence of ours believing we tested a bot we
 * have not run.
 */

/**
 * Every internal URL is built here.
 *
 * JOB FIRST — read this before adding a route.
 *
 * The job is the primary object, so the canonical URL for one carries no
 * framework name: /jobs/ai-chief-of-staff, never /grok-bot/jobs/…. A framework
 * is a *section within* a job page, and /grok-bot/ is a page in its own right
 * rather than a prefix that everything else hangs off.
 *
 * The line to hold when adding something new: a page belongs under the hub only
 * if it stops making sense once the framework does. If the question it answers
 * survives a change of product, it lives at the root.
 *
 * Nothing currently sits under the hub but the hub. Integration pages looked
 * like they belonged there — they target "grok bot for gmail" — but the query
 * naming the product is not the test, because "bots that connect to Gmail" is
 * a facet of the candidate pool and stays a real question whoever builds them.
 * Be suspicious of the next page that seems to qualify: an empty category is
 * the expected state here, not a gap to fill.
 *
 * The reason is platform risk, and it is the whole architecture in one
 * sentence: xAI shipping an official bot directory would end a Grok-only site
 * overnight and barely dent a job-first one, because a vendor will never
 * catalogue its competitors' agents.
 *
 * Moving anything here means adding a 301 to src/lib/redirects.ts in the same
 * change. Old URLs are never deleted and never 404.
 */
export const urls = {
  home: () => '/',
  jobs: () => '/jobs',
  job: (slug: string) => `/jobs/${slug}`,
  openJobs: () => '/jobs/open',
  bots: () => '/bots',
  bot: (slug: string) => `/bots/${slug}`,
  category: (slug: string) => `/categories/${slug}`,
  /** The framework hub. A page, not a prefix — it targets its own terms. */
  framework: () => `/${PATH_SEGMENT}`,
  /**
   * A facet of the candidate pool, not of the framework. "Bots that connect to
   * Gmail" stays a real question whoever builds the bots, so it lives at the
   * root for the same reason /jobs and /categories do.
   */
  integration: (slug: string) => `/integrations/${slug}`,
  guide: (slug: string) => `/guides/${slug}`,
  search: (q?: string) => `/search${q ? `?q=${encodeURIComponent(q)}` : ''}`,
  submit: () => '/submit',
  // Two sides of the same board: bots are the candidates, jobs are the
  // vacancies. Both land on /submit; the anchors keep them as distinct CTAs
  // without a second page to maintain.
  submitBot: () => '/submit#bot',
  submitJob: () => '/submit#job',
  /** Outbound hop so install clicks are measurable without client JavaScript. */
  install: (botSlug: string, jobSlug?: string) =>
    `/go/${botSlug}${jobSlug ? `?job=${encodeURIComponent(jobSlug)}` : ''}`,
  /** The creator's originating post, counted separately from installs. */
  source: (botSlug: string) => `/go/${botSlug}?to=source`,
  report: (botSlug: string) => `/report?bot=${encodeURIComponent(botSlug)}`,
} as const;

export const REPO = 'https://github.com/lureilly1/botjobs';

/**
 * A GitHub issue, for people who would rather use GitHub than a form on the
 * site. Every route this appears on has a form beside it that does not need an
 * account — this is the alternative, never the only way through.
 *
 * The title and body are filled in. An empty issue box asks a stranger to
 * work out what we need from them, and most of them will simply close the tab.
 */
export const issueUrl = (kind: 'bot' | 'job' | 'removal', title: string, body = '') =>
  `${REPO}/issues/new?` +
  new URLSearchParams({
    labels: kind === 'removal' ? 'removal' : `${kind}-submission`,
    title,
    ...(body ? { body } : {}),
  });

/**
 * Evidence tiers. The labels are load-bearing: `link-verified` must never read
 * as "we tested this bot", because we have not. We reconciled its listing
 * against the official x.ai page, which is a different and lesser claim.
 */
export const EVIDENCE = {
  listed: {
    label: 'Listed',
    blurb: 'Turned up in a catalogue. We have not taken up its references.',
  },
  'source-linked': {
    label: 'Sourced',
    blurb: 'We know who built it and where it first appeared.',
  },
  'link-verified': {
    label: 'References checked',
    // Deliberately spelled out. "References checked" is the voice; this
    // sentence is the claim, and the claim stops at the paperwork.
    blurb: "Its listing matches the official x.ai page. We have not watched it work.",
  },
} as const;

export type EvidenceLevel = keyof typeof EVIDENCE;
