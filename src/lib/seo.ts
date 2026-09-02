import { SITE, urls } from '@/config';
import type { Job, Bot } from '@/lib/data';

const abs = (path: string) => new URL(path, SITE.url).href;

export function breadcrumbs(trail: Array<{ name: string; path?: string }>) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      ...(item.path ? { item: abs(item.path) } : {}),
    })),
  };
}

export function websiteNode() {
  return {
    '@type': 'WebSite',
    name: SITE.name,
    url: SITE.url,
    description: SITE.description,
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: abs(`${urls.search()}?q={search_term_string}`) },
      'query-input': 'required name=search_term_string',
    },
  };
}

export function jobPageNode(job: Job, botCount: number) {
  return {
    '@type': 'WebPage',
    name: job.title,
    url: abs(urls.job(job.slug)),
    description: job.searchIntent,
    // The intro is the original editorial that justifies the page existing, so
    // it is what we declare as the primary content.
    primaryImageOfPage: undefined,
    mainEntity: {
      '@type': 'ItemList',
      name: `Grok Bots for ${job.title}`,
      numberOfItems: botCount,
    },
    isPartOf: { '@type': 'WebSite', name: SITE.name, url: SITE.url },
  };
}

export function collectionNode(opts: {
  name: string;
  path: string;
  description: string;
  items: Array<{ name: string; path: string }>;
}) {
  return {
    '@type': 'CollectionPage',
    name: opts.name,
    url: abs(opts.path),
    description: opts.description,
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: opts.items.length,
      itemListElement: opts.items.slice(0, 100).map((item, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: item.name,
        url: abs(item.path),
      })),
    },
  };
}

/**
 * A bot page. Modelled as a WebPage about a SoftwareApplication rather than as
 * the application itself — we are the directory, not the publisher, and the
 * install route belongs to the creator.
 */
export function botPageNode(bot: Bot) {
  return {
    '@type': 'WebPage',
    name: bot.name,
    url: abs(urls.bot(bot.slug)),
    description: bot.description ?? undefined,
    mainEntity: {
      '@type': 'SoftwareApplication',
      name: bot.name,
      applicationCategory: 'BusinessApplication',
      url: bot.grokShareUrl,
      author: {
        '@type': 'Person',
        name: bot.creator.handle ? `@${bot.creator.handle}` : bot.creator.name,
        ...(bot.creator.url ? { url: bot.creator.url } : {}),
      },
      // No aggregateRating and no review: we have no user reviews, and an
      // internal score presented as one would be an invented rating.
    },
    isPartOf: { '@type': 'WebSite', name: SITE.name, url: SITE.url },
  };
}
