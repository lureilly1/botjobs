import {
  jobStatus,
  CATEGORIES,
  EVIDENCE_LEVELS,
  INTEGRATIONS,
  INTEGRATION_MIN_BOTS,
  INTEGRATION_MIN_PLACED,
} from './records.js';
import type { EvidenceLevel } from '@/config';

/**
 * Data access over the JSON records.
 *
 * `import.meta.glob(..., { eager: true })` bundles every record at build time,
 * so a page render is an in-memory lookup rather than a filesystem walk. At a
 * few hundred records this is the right trade — no database, no query layer,
 * and the whole dataset is a git diff.
 */

export interface BotMapping {
  botSlug: string;
  fitScore: number;
  fitReason: string;
  rank: number;
}

export interface Job {
  slug: string;
  /**
   * The role noun. This is what the page is titled and what it ranks for —
   * "AI chief of staff", not "Daily Briefing". Role nouns get searched and task
   * descriptions do not: people look for the job a human holds, not the
   * workflow.
   */
  title: string;
  /**
   * The task phrasing the job used to be titled with, kept as an H2 on the page
   * so a rename covers both forms rather than trading one for the other.
   * Absent on jobs that have not been renamed yet.
   */
  taskTitle?: string;
  category: string;
  searchIntent: string;
  intro: string;
  introCurated: boolean;
  bots: BotMapping[];
  relatedJobs: string[];
  integrations: string[];
  publish: boolean;
  /** Derived, never stored. See records.js — it must not drift from `bots`. */
  status: 'open' | 'filled';
}

export interface Bot {
  slug: string;
  name: string;
  grokShareUrl: string;
  botId: string;
  /**
   * A creator has a handle or a display name — the validator requires one of
   * the two, not both. 358 of 430 records carry a name, so leaving it off this
   * interface made every `creator.name` read look like a mistake.
   */
  creator: { handle: string; name?: string; url?: string };
  sourceUrl?: string;
  discoveredVia: { name: string; url: string };
  /** Every catalogue found carrying this bot. Overlap is the interesting part. */
  listings?: Array<{ name: string; url: string }>;
  /** Keywords from the source catalogue. Weighted lightly in search. */
  tags?: string[];
  description: string;
  official: {
    title?: string;
    description?: string;
    resolves?: boolean;
    fetchedAt?: string;
  };
  categories: string[];
  integrations?: string[];
  evidenceLevel: EvidenceLevel;
  linkStatus: 'live' | 'redirected' | 'dead';
  lastVerifiedAt?: string;
}

const jobModules = import.meta.glob<Omit<Job, 'status'>>('../../data/jobs/*.json', {
  eager: true,
  import: 'default',
});

const botModules = import.meta.glob<Bot>('../../data/bots/*.json', {
  eager: true,
  import: 'default',
});

const allJobs: Job[] = Object.values(jobModules).map((job) => ({
  ...job,
  status: jobStatus(job) as 'open' | 'filled',
}));

const allBots: Bot[] = Object.values(botModules);

const botsBySlug = new Map(allBots.map((b) => [b.slug, b]));

/**
 * The official x.ai bot id is the dedupe key everywhere else in this codebase,
 * so submissions must be checked against it too — not against a slug derived
 * from it, which would never match anything.
 */
const botsByBotId = new Map(allBots.map((b) => [b.botId, b]));

/**
 * The display label for a category slug.
 *
 * CATEGORIES lives in plain JS so the validator, the git hook and the site can
 * share it, which means TypeScript infers it as a closed literal and every
 * `CATEGORIES[someString]` is an error. One typed accessor beats a cast at each
 * of the four call sites.
 */
export function categoryLabel(slug: string): string {
  return (CATEGORIES as Record<string, string>)[slug] ?? slug;
}

/** Published jobs only. Drafts never reach a page, a listing or the sitemap. */
export async function getJobs(): Promise<Job[]> {
  return allJobs
    .filter((j) => j.publish)
    .sort((a, b) => b.bots.length - a.bots.length || a.title.localeCompare(b.title));
}

export async function getJob(slug: string): Promise<Job | null> {
  const job = allJobs.find((j) => j.slug === slug && j.publish);
  return job ?? null;
}

export async function getBots(): Promise<Bot[]> {
  // Dead links are still records, but they never surface as recommendations.
  return allBots
    .filter((b) => b.linkStatus !== 'dead')
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getBot(slug: string): Bot | null {
  return botsBySlug.get(slug) ?? null;
}

export function getBotByBotId(botId: string): Bot | null {
  return botsByBotId.get(botId) ?? null;
}

/** The bots mapped to a job, in editorial rank order. */
export function botsForJob(job: Job): Array<Bot & { mapping: BotMapping }> {
  return job.bots
    .slice()
    .sort((a, b) => a.rank - b.rank)
    .flatMap((mapping) => {
      const bot = botsBySlug.get(mapping.botSlug);
      return bot ? [{ ...bot, mapping }] : [];
    });
}

/** Every published job this bot has been put forward for, best fit first. */
export function jobsForBot(botSlug: string): Array<{ job: Job; mapping: BotMapping }> {
  return allJobs
    .filter((j) => j.publish)
    .flatMap((job) => {
      const mapping = job.bots.find((b) => b.botSlug === botSlug);
      return mapping ? [{ job, mapping }] : [];
    })
    .sort((a, b) => b.mapping.fitScore - a.mapping.fitScore);
}

/* ===========================================================================
   INDEXING POLICY — start narrow, widen as pages earn it
   ---------------------------------------------------------------------------
   Measured body content, excluding nav and footer:

     job pages          1104 words median, 12 in-body links
     integration pages   653 words median, 14 in-body links
     bot pages           246 words median,  4 in-body links
     category pages      142 words median,  4 in-body links

   Bot pages were 72% of the index at 246 words each, most of which restates a
   section of the job page that already ranks. That is the scaled-content shape
   this project exists to avoid, and it does not become acceptable because the
   words are ours.

   So: index what is genuinely a destination, and let the rest be navigation.
   Bot and category pages stay crawlable and keep passing link equity to the job
   pages — they simply do not compete with them for a slot.

   To widen later, lower MIN_JOBS_FOR_BOT_INDEX. A bot on three jobs carries
   three fit reasons, so it is the closest thing to a naturally deeper page. Do
   it when pages have more to say, not to grow the number.
   =========================================================================== */

/** Set above the maximum (3) so no bot page indexes yet. Lower to widen. */
const MIN_JOBS_FOR_BOT_INDEX = 99;

export function isBotIndexable(bot: Bot): boolean {
  if (bot.linkStatus === 'dead' || !bot.description) return false;
  return jobsForBot(bot.slug).length >= MIN_JOBS_FOR_BOT_INDEX;
}

/**
 * Category pages are 142 words: an intro and a list of links to pages that say
 * it better. They are useful navigation and a poor search result, so they are
 * crawled and not indexed until they carry something of their own.
 */
export function isCategoryIndexable(): boolean {
  return false;
}

/**
 * Integration slugs that clear the supply bar and therefore have a page.
 *
 * Computed rather than listed, so a page cannot exist without the bots to fill
 * it — and the sitemap, the links and the route all agree by construction.
 */
export function liveIntegrations(): Array<{ slug: string; label: string; count: number }> {
  return Object.entries(INTEGRATIONS as Record<string, { label: string }>)
    .map(([slug, meta]) => {
      const matching = allBots.filter((b) => (b.integrations ?? []).includes(slug) && b.description);
      const placed = matching.filter((b) => jobsForBot(b.slug).length > 0);
      return { slug, label: meta.label, count: matching.length, placed: placed.length };
    })
    .filter((i) => i.count >= INTEGRATION_MIN_BOTS && i.placed >= INTEGRATION_MIN_PLACED)
    .sort((a, b) => b.count - a.count)
    .map(({ slug, label, count }) => ({ slug, label, count }));
}

/** Integration pages a given bot belongs to. Used for cross-linking. */
export function integrationsForBot(bot: Bot): Array<{ slug: string; label: string }> {
  const live = new Map(liveIntegrations().map((i) => [i.slug, i.label]));
  return (bot.integrations ?? [])
    .filter((s) => live.has(s))
    .map((s) => ({ slug: s, label: live.get(s)! }));
}

/**
 * The strongest evidence level among a job's bots — what the job card can
 * honestly advertise. A job is only as verified as its best candidate.
 */
export function bestEvidence(job: Job): EvidenceLevel | null {
  let best = -1;
  for (const { botSlug } of job.bots) {
    const bot = botsBySlug.get(botSlug);
    if (!bot) continue;
    best = Math.max(best, EVIDENCE_LEVELS.indexOf(bot.evidenceLevel));
  }
  return best >= 0 ? (EVIDENCE_LEVELS[best] as EvidenceLevel) : null;
}
