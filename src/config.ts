/**
 * Site configuration.
 *
 * PATH_SEGMENT is deliberately a constant rather than a literal scattered
 * across routes. xAI's product naming is not stable (the Cursor merger is in
 * progress and reporting suggests brand consolidation), so a rename must cost
 * a config change and a redirect map — not 200 hand-edited routes.
 *
 * Nothing outside this file should ever contain the string 'grok-bot'.
 */
export const PATH_SEGMENT = 'grok-bot';

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

/** Every internal URL is built here. */
export const urls = {
  home: () => '/',
  jobs: () => `/${PATH_SEGMENT}/jobs`,
  job: (slug: string) => `/${PATH_SEGMENT}/jobs/${slug}`,
  openJobs: () => `/${PATH_SEGMENT}/jobs/open`,
  bots: () => `/${PATH_SEGMENT}/bots`,
  bot: (slug: string) => `/${PATH_SEGMENT}/bots/${slug}`,
  category: (slug: string) => `/${PATH_SEGMENT}/categories/${slug}`,
  guide: (slug: string) => `/${PATH_SEGMENT}/guides/${slug}`,
  search: (q?: string) => `/${PATH_SEGMENT}/search${q ? `?q=${encodeURIComponent(q)}` : ''}`,
  submit: () => '/submit',
  // Two sides of the same board: bots are the candidates, jobs are the
  // vacancies. Both land on /submit; the anchors keep them as distinct CTAs
  // without a second page to maintain.
  submitBot: () => '/submit#bot',
  submitJob: () => '/submit#job',
  report: (botSlug: string) => `/report?bot=${encodeURIComponent(botSlug)}`,
} as const;

/** Interim submission route until the drafting pipeline lands (plan T15). */
export const REPO = 'https://github.com/lureilly1/botjobs';
export const issueUrl = (template: 'bot' | 'job', title: string) =>
  `${REPO}/issues/new?labels=${template}-submission&title=${encodeURIComponent(title)}`;

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
