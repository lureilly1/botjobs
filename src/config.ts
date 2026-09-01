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
  tagline: 'Find the best AI Bot for the job.',
  description: 'The independent directory of things you can get Grok Bot to do.',
} as const;

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
  report: (botSlug: string) => `/report?bot=${encodeURIComponent(botSlug)}`,
} as const;

/**
 * Evidence tiers. The labels are load-bearing: `link-verified` must never read
 * as "we tested this bot", because we have not. We reconciled its listing
 * against the official x.ai page, which is a different and lesser claim.
 */
export const EVIDENCE = {
  listed: {
    label: 'Listed',
    blurb: 'Appears in a source catalogue. Nothing verified.',
  },
  'source-linked': {
    label: 'Source-linked',
    blurb: 'Creator identified and the original post recorded.',
  },
  'link-verified': {
    label: 'Link verified',
    blurb: 'Official x.ai page checked and reconciled. We have not run this bot.',
  },
} as const;

export type EvidenceLevel = keyof typeof EVIDENCE;
