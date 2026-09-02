import type { APIRoute } from 'astro';
import { SITE, urls } from '@/config';
import { getBots, jobsForBot } from '@/lib/data';

/**
 * The bots dataset, machine-readable.
 *
 * Carries the union of catalogues — `listed_on` is the field no other directory
 * can populate, because none of them index each other.
 */
export const GET: APIRoute = async () => {
  const bots = (await getBots()).filter((b) => b.description);

  const payload = {
    generated_at: new Date().toISOString(),
    site: { name: SITE.name, url: SITE.url, methodology: `${SITE.url}/methodology` },
    notes: {
      description:
        'Written by us from the creator\'s official listing. Never copied from a source directory.',
      official:
        'What the creator says, taken from the official x.ai page on the date shown.',
      evidence:
        '"link-verified" means the official listing was fetched and reconciled. It does NOT mean the bot was run.',
    },
    count: bots.length,
    bots: bots.map((bot) => ({
      slug: bot.slug,
      name: bot.name,
      url: `${SITE.url}${urls.bot(bot.slug)}`,
      share_url: bot.grokShareUrl,
      bot_id: bot.botId,
      creator: bot.creator.handle ? `@${bot.creator.handle}` : bot.creator.name,
      source_post: bot.sourceUrl ?? null,
      description: bot.description,
      official: bot.official ?? null,
      integrations: bot.integrations ?? [],
      evidence: bot.evidenceLevel,
      link_status: bot.linkStatus,
      last_verified: bot.lastVerifiedAt ?? null,
      discovered_via: bot.discoveredVia?.name ?? null,
      listed_on: (bot.listings ?? []).map((l) => l.name),
      jobs: jobsForBot(bot.slug).map((j) => ({ slug: j.job.slug, fit_score: j.mapping.fitScore })),
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
