/**
 * Record schemas and validation — the single source of truth for what a valid
 * job or bot looks like.
 *
 * Plain ESM JavaScript on purpose: `scripts/validate.mjs` and the pre-commit
 * hook import this directly with no build step, and the Astro site imports the
 * same module, so the site and CI can never disagree about what is valid.
 *
 * THIS FILE IS THE PUBLICATION GATE. The spec's prose rules ("never copy a
 * source description", "an open job needs a hand-written intro") are only real
 * if something enforces them, so each one is a check below rather than a
 * convention someone remembers.
 */

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Official share URLs look like https://x.ai/bot/<id>. The id is our dedupe key. */
export const SHARE_URL_RE = /^https:\/\/x\.ai\/bot\/([A-Za-z0-9_-]+)$/;

export const EVIDENCE_LEVELS = ['listed', 'source-linked', 'link-verified'];

export const LINK_STATUSES = ['live', 'redirected', 'dead'];

export const CATEGORIES = {
  'business-operations': 'Business & Operations',
  sales: 'Sales',
  marketing: 'Marketing',
  finance: 'Finance & Administration',
  research: 'Research & Monitoring',
  engineering: 'Engineering & Product',
  personal: 'Personal, Home & Travel',
};

/** An intro shorter than this is not editorial, it is a placeholder. */
const MIN_INTRO_CHARS = 250;

/* ------------------------------------------------------------------ helpers */

const isPlainObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0;
const isArray = (v) => Array.isArray(v);

/** Normalise prose for comparison: casing, punctuation and spacing are noise. */
function normalise(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Jaccard overlap of word sets, 0..1. Crude by design — it only needs to catch
 * "you pasted the source description and changed two words", not to be a
 * plagiarism engine.
 */
export function similarity(a, b) {
  const setA = new Set(normalise(a).split(' ').filter(Boolean));
  const setB = new Set(normalise(b).split(' ').filter(Boolean));
  if (setA.size === 0 || setB.size === 0) return 0;
  let shared = 0;
  for (const word of setA) if (setB.has(word)) shared += 1;
  return shared / (setA.size + setB.size - shared);
}

/** Above this, our description is a rewrite of someone else's rather than ours. */
export const MAX_DESCRIPTION_SIMILARITY = 0.6;

export function botIdFromShareUrl(url) {
  const match = SHARE_URL_RE.exec(String(url ?? ''));
  return match ? match[1] : null;
}

/**
 * A job's status is DERIVED, never stored, so it cannot drift out of sync with
 * the bots actually mapped to it.
 */
export function jobStatus(job) {
  return (job.bots?.length ?? 0) === 0 ? 'open' : 'filled';
}

/* -------------------------------------------------------------- bot records */

/**
 * @param {any} bot
 * @param {string} filenameSlug
 * @returns {string[]} human-readable errors, empty when valid
 */
export function validateBot(bot, filenameSlug) {
  const e = [];
  if (!isPlainObject(bot)) return ['not a JSON object'];

  if (!SLUG_RE.test(bot.slug ?? '')) e.push('slug: must be lowercase-hyphenated');
  else if (bot.slug !== filenameSlug) e.push(`slug: "${bot.slug}" does not match filename "${filenameSlug}"`);

  if (!isNonEmptyString(bot.name)) e.push('name: required');

  // Share URL and botId must agree. botId is the dedupe key, so a mismatch
  // silently splits one bot into two records.
  const derivedId = botIdFromShareUrl(bot.grokShareUrl);
  if (!derivedId) e.push('grokShareUrl: must be https://x.ai/bot/<id>');
  else if (bot.botId !== derivedId) e.push(`botId: "${bot.botId}" does not match the id in grokShareUrl ("${derivedId}")`);

  if (!isPlainObject(bot.creator)) e.push('creator: required object');
  else if (!isNonEmptyString(bot.creator.handle)) e.push('creator.handle: required');

  // Attribution is not optional. Every record names where we found it.
  if (!isPlainObject(bot.discoveredVia)) e.push('discoveredVia: required object (attribution)');
  else {
    if (!isNonEmptyString(bot.discoveredVia.name)) e.push('discoveredVia.name: required');
    if (!isNonEmptyString(bot.discoveredVia.url)) e.push('discoveredVia.url: required');
  }

  if (!isNonEmptyString(bot.description)) e.push('description: required (our own words)');

  if (!EVIDENCE_LEVELS.includes(bot.evidenceLevel))
    e.push(`evidenceLevel: must be one of ${EVIDENCE_LEVELS.join(', ')}`);
  if (!LINK_STATUSES.includes(bot.linkStatus))
    e.push(`linkStatus: must be one of ${LINK_STATUSES.join(', ')}`);

  if (!isArray(bot.categories)) e.push('categories: required array');
  else {
    for (const c of bot.categories)
      if (!(c in CATEGORIES)) e.push(`categories: "${c}" is not a known category`);
  }
  if (!isArray(bot.integrations)) e.push('integrations: required array');

  // `official` is what xAI itself says about the bot. Its presence is what
  // separates link-verified from a mere listing.
  if (!isPlainObject(bot.official)) {
    e.push('official: required object (may be empty-valued until verified)');
  } else {
    if (bot.evidenceLevel === 'link-verified') {
      if (bot.official.resolves !== true)
        e.push('evidenceLevel is link-verified but official.resolves is not true');
      if (!isNonEmptyString(bot.official.fetchedAt))
        e.push('evidenceLevel is link-verified but official.fetchedAt is missing');
      if (!isNonEmptyString(bot.official.title))
        e.push('evidenceLevel is link-verified but official.title is missing');
    }

    // THE COPY RULE, made mechanical. Our description must be our own words,
    // not the creator's official blurb lightly reworded. Quoting the creator is
    // fine — that is what official.description is for, rendered in quotes with
    // attribution. This check stops the two collapsing into each other.
    if (isNonEmptyString(bot.description) && isNonEmptyString(bot.official.description)) {
      const score = similarity(bot.description, bot.official.description);
      if (score > MAX_DESCRIPTION_SIMILARITY)
        e.push(
          `description: too close to official.description (${score.toFixed(2)} > ${MAX_DESCRIPTION_SIMILARITY}). Write our own summary; the creator's wording belongs in official.description, quoted.`
        );
    }
  }

  if (bot.evidenceLevel === 'source-linked' || bot.evidenceLevel === 'link-verified') {
    if (!isNonEmptyString(bot.sourceUrl))
      e.push(`evidenceLevel is ${bot.evidenceLevel} but sourceUrl is missing`);
  }

  return e;
}

/* ------------------------------------------------------------- job records */

/**
 * @param {any} job
 * @param {string} filenameSlug
 * @returns {string[]}
 */
export function validateJob(job, filenameSlug) {
  const e = [];
  if (!isPlainObject(job)) return ['not a JSON object'];

  if (!SLUG_RE.test(job.slug ?? '')) e.push('slug: must be lowercase-hyphenated');
  else if (job.slug !== filenameSlug) e.push(`slug: "${job.slug}" does not match filename "${filenameSlug}"`);

  if (!isNonEmptyString(job.title)) e.push('title: required');
  if (!(job.category in CATEGORIES)) e.push(`category: must be one of ${Object.keys(CATEGORIES).join(', ')}`);
  if (!isNonEmptyString(job.searchIntent)) e.push('searchIntent: required');

  if (!isNonEmptyString(job.intro)) e.push('intro: required');
  else if (job.intro.trim().length < MIN_INTRO_CHARS)
    e.push(`intro: ${job.intro.trim().length} chars, needs at least ${MIN_INTRO_CHARS}`);

  if (typeof job.introCurated !== 'boolean') e.push('introCurated: required boolean');
  if (typeof job.publish !== 'boolean') e.push('publish: required boolean');

  if (!isArray(job.bots)) e.push('bots: required array');
  else {
    const ranks = [];
    job.bots.forEach((b, i) => {
      if (!isPlainObject(b)) return e.push(`bots[${i}]: not an object`);
      if (!SLUG_RE.test(b.botSlug ?? '')) e.push(`bots[${i}].botSlug: invalid slug`);
      if (typeof b.fitScore !== 'number' || b.fitScore < 0 || b.fitScore > 100)
        e.push(`bots[${i}].fitScore: must be a number 0-100`);
      // fitReason is rendered on the job page as "What we found". A mapping
      // without a reason is an assertion with nothing behind it.
      if (!isNonEmptyString(b.fitReason)) e.push(`bots[${i}].fitReason: required`);
      if (typeof b.rank !== 'number') e.push(`bots[${i}].rank: required number`);
      else ranks.push(b.rank);
    });
    if (new Set(ranks).size !== ranks.length) e.push('bots: duplicate rank values');
  }

  if (!isArray(job.relatedJobs)) e.push('relatedJobs: required array');
  if (!isArray(job.integrations)) e.push('integrations: required array');

  // THE OPEN-JOB INVARIANT.
  //
  // A job with no bots still gets a page — that is the open-jobs product. But a
  // page saying "no bot does this yet" and nothing else is exactly the thin
  // content the whole plan exists to avoid, so an open job has to earn its
  // place with a hand-written intro. LLM-drafted intros are fine on jobs that
  // have bots to show.
  if (job.publish === true && jobStatus(job) === 'open' && job.introCurated !== true) {
    e.push(
      'open job (no bots mapped) must have introCurated: true — an open job earns its page with a hand-written intro, or it stays unpublished'
    );
  }

  return e;
}

/* ---------------------------------------------- cross-record referential checks */

/**
 * Checks that only make sense with the whole dataset in hand.
 *
 * @param {{slug: string, record: any}[]} jobs
 * @param {{slug: string, record: any}[]} bots
 * @returns {{file: string, errors: string[]}[]}
 */
export function validateDataset(jobs, bots) {
  const problems = [];
  const botSlugs = new Set(bots.map((b) => b.slug));
  const jobSlugs = new Set(jobs.map((j) => j.slug));

  // One bot = one canonical record. Two files sharing a botId means the
  // deduper let the same bot in twice under different slugs.
  const byBotId = new Map();
  for (const { slug, record } of bots) {
    const id = record?.botId;
    if (!id) continue;
    if (byBotId.has(id)) {
      problems.push({
        file: `data/bots/${slug}.json`,
        errors: [`duplicate botId "${id}" — already claimed by ${byBotId.get(id)}.json`],
      });
    } else byBotId.set(id, slug);
  }

  for (const { slug, record } of jobs) {
    const errors = [];
    for (const b of record?.bots ?? []) {
      if (b?.botSlug && !botSlugs.has(b.botSlug))
        errors.push(`bots: "${b.botSlug}" has no record in data/bots/`);
    }
    for (const r of record?.relatedJobs ?? []) {
      if (!jobSlugs.has(r)) errors.push(`relatedJobs: "${r}" has no record in data/jobs/`);
      if (r === slug) errors.push('relatedJobs: a job cannot relate to itself');
    }
    if (errors.length) problems.push({ file: `data/jobs/${slug}.json`, errors });
  }

  return problems;
}
