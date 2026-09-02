import type { APIRoute } from 'astro';
import { SITE, urls } from '@/config';
import { getJobs, botsForJob } from '@/lib/data';

/**
 * The jobs dataset, machine-readable.
 *
 * Both competitors expose a catalogue endpoint; this is the equivalent, except
 * the unit is a job rather than a bot, which is the thing nobody else publishes.
 * Every claim carries its evidence level so a consumer can repeat it accurately.
 */
export const GET: APIRoute = async () => {
  const jobs = await getJobs();

  const payload = {
    generated_at: new Date().toISOString(),
    site: {
      name: SITE.name,
      url: SITE.url,
      description: SITE.description,
      methodology: `${SITE.url}/methodology`,
      licence: 'Reuse with attribution and a link to the relevant page.',
    },
    notes: {
      evidence:
        '"link-verified" means the official x.ai listing was fetched and reconciled. It does NOT mean the bot was run.',
      fit_score: 'Our editorial ranking of a candidate within a job. Not a user rating.',
      open_jobs: 'A job with no candidates is one nobody has built a good bot for yet.',
    },
    count: jobs.length,
    jobs: jobs.map((job) => ({
      slug: job.slug,
      title: job.title,
      category: job.category,
      search_intent: job.searchIntent,
      url: `${SITE.url}${urls.job(job.slug)}`,
      status: job.status,
      candidates: botsForJob(job).map((bot) => ({
        slug: bot.slug,
        name: bot.name,
        url: `${SITE.url}${urls.bot(bot.slug)}`,
        share_url: bot.grokShareUrl,
        creator: bot.creator.handle ? `@${bot.creator.handle}` : bot.creator.name,
        fit_score: bot.mapping.fitScore,
        fit_reason: bot.mapping.fitReason,
        evidence: bot.evidenceLevel,
        link_status: bot.linkStatus,
        last_verified: bot.lastVerifiedAt ?? null,
      })),
    })),
  };

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=3600',
      'access-control-allow-origin': '*',
    },
  });
};
