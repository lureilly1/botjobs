import { jobStatus, EVIDENCE_LEVELS } from './records.js';
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
  title: string;
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
  creator: { handle: string; url?: string };
  sourceUrl?: string;
  discoveredVia: { name: string; url: string };
  description: string;
  official: {
    title?: string;
    description?: string;
    resolves?: boolean;
    fetchedAt?: string;
  };
  categories: string[];
  integrations: string[];
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

/**
 * Whether a bot page belongs in the index.
 *
 * 408 pages of a hundred words each is precisely the scaled-content pattern
 * this project exists to avoid, and Google is explicit that combining external
 * content with little added value is spam regardless of intent. A bot we have
 * put forward for a job carries real editorial — our summary plus a reasoned
 * fit — so it earns a place. A bot sitting in the catalogue untouched does not,
 * and it stays reachable and crawlable while being kept out of the index.
 */
export function isBotIndexable(bot: Bot): boolean {
  return bot.linkStatus !== 'dead' && Boolean(bot.description) && jobsForBot(bot.slug).length > 0;
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
