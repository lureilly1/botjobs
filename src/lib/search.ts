import { getJobs, getBots, jobsForBot, type Job, type Bot } from '@/lib/data';

/**
 * Search over ~430 records.
 *
 * In-memory scoring, no index and no Postgres. At this size a full scan is
 * sub-millisecond, and the weighted ranking is far easier to reason about — and
 * to tune from real queries — than a stemmed FTS configuration would be.
 *
 * Jobs outrank bots by construction. The whole thesis is that the job is the
 * primary object: someone typing "clean my inbox" wants the job page that
 * compares candidates, not whichever single bot happens to match the string
 * best.
 */

const STOPWORDS = new Set([
  'a', 'an', 'the', 'my', 'me', 'i', 'to', 'for', 'of', 'and', 'or', 'in', 'on',
  'with', 'that', 'this', 'is', 'it', 'can', 'do', 'does', 'how', 'what', 'grok', 'bot', 'bots',
]);

const normalise = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

export function tokenise(query: string): string[] {
  return normalise(query)
    .split(' ')
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/** How many query terms appear in a field, and whether the whole phrase does. */
function hits(field: string | null | undefined, terms: string[], phrase: string) {
  if (!field) return { count: 0, exact: false };
  const hay = normalise(field);
  return {
    count: terms.filter((t) => hay.includes(t)).length,
    exact: phrase.length > 2 && hay.includes(phrase),
  };
}

export interface JobResult { kind: 'job'; job: Job; score: number }
export interface BotResult { kind: 'bot'; bot: Bot; score: number; jobCount: number }
export type SearchResult = JobResult | BotResult;

function scoreJob(job: Job, terms: string[], phrase: string): number {
  let score = 0;

  const title = hits(job.title, terms, phrase);
  const intent = hits(job.searchIntent, terms, phrase);
  const intro = hits(job.intro, terms, phrase);
  const category = hits(job.category, terms, phrase);
  const integrations = hits(job.integrations.join(' '), terms, phrase);

  // An exact phrase match on the intent is the strongest signal we have —
  // searchIntent is literally the query we expect for this page.
  if (intent.exact) score += 60;
  if (title.exact) score += 45;

  score += title.count * 18;
  score += intent.count * 14;
  score += category.count * 8;
  score += integrations.count * 8;
  score += Math.min(intro.count, 4) * 3;

  // Quality bonuses are TIEBREAKERS, not scores. Applying them unconditionally
  // gave every filled job a positive score, so a query matching nothing still
  // returned all 23 jobs and all 406 bots — and the "nothing on the board"
  // state could never appear. A record must earn a term match first.
  if (score === 0) return 0;

  // A job with candidates is more useful to land on than an empty one, but not
  // so much that an open job with an exact title match loses to a vague one.
  if (job.bots.length) score += 6;

  return score;
}

function scoreBot(bot: Bot, terms: string[], phrase: string): number {
  let score = 0;

  const name = hits(bot.name, terms, phrase);
  const description = hits(bot.description, terms, phrase);
  const official = hits(bot.official?.description, terms, phrase);
  const creator = hits(bot.creator.handle ?? bot.creator.name, terms, phrase);
  const tags = hits((bot.tags ?? []).join(' '), terms, phrase);

  if (name.exact) score += 40;
  score += name.count * 15;
  score += description.count * 7;
  score += official.count * 4;
  score += tags.count * 5;
  score += creator.count * 10;

  if (score === 0) return 0;

  // Evidence is a ranking signal, never a filter.
  if (bot.evidenceLevel === 'link-verified') score += 3;

  return score;
}

export async function search(query: string): Promise<{
  jobs: JobResult[];
  bots: BotResult[];
  terms: string[];
}> {
  const terms = tokenise(query);
  const phrase = normalise(query);
  if (!terms.length) return { jobs: [], bots: [], terms };

  const [allJobs, allBots] = await Promise.all([getJobs(), getBots()]);

  const jobs = allJobs
    .map((job) => ({ kind: 'job' as const, job, score: scoreJob(job, terms, phrase) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);

  const bots = allBots
    .filter((b) => b.description)
    .map((bot) => ({
      kind: 'bot' as const,
      bot,
      score: scoreBot(bot, terms, phrase),
      jobCount: jobsForBot(bot.slug).length,
    }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || b.jobCount - a.jobCount);

  return { jobs, bots, terms };
}
