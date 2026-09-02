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

// `unchecked` is the honest state straight after ingest: we have the share URL
// from a catalogue but have not yet fetched it ourselves.
export const LINK_STATUSES = ['unchecked', 'live', 'redirected', 'dead'];

export const CATEGORIES = {
  'business-operations': 'Business & Operations',
  sales: 'Sales',
  marketing: 'Marketing',
  finance: 'Finance & Administration',
  research: 'Research & Monitoring',
  engineering: 'Engineering & Product',
  personal: 'Personal, Home & Travel',
};

/**
 * Editorial for each category page.
 *
 * A category page listing five links and nothing else is thinner than the bot
 * pages it links to, and it was indexed — so it was a liability rather than an
 * asset. These are hand-written for the same reason the job intros are.
 */
export const CATEGORY_INTROS = {
  'business-operations': "Back-office work is where an always-on agent looks most obviously useful and disappoints most often. The jobs here are repetitive, rule-shaped and unloved — triaging mail, preparing for meetings, chasing the things nobody owns — which is exactly the shape a bot handles well. What separates the ones people keep from the ones they uninstall is restraint: a bot that reports everything gets skimmed and then ignored, and a bot that acts without asking eventually acts wrongly on something that mattered. Look for the ones that decide what not to tell you.",
  sales: "Sales is the best-supplied category on this site, which follows from the work: it is repetitive, the output is measurable, and someone is usually already paying for a tool it might replace. The useful division is between finding and contacting. Finding — watching for buying signals, keeping a list current, working out who actually decides — is where a bot does real work. Contacting is where the category earns its reputation, and the ease of sending is most of what makes outbound bad. Bots that draft for review are a different proposition from bots that send on a schedule.",
  marketing: "Marketing jobs split neatly into watching and making. Watching suits a scheduled bot almost perfectly — competitors, mentions, rankings and trends are fixed sources checked on a cadence, and the value is entirely in noticing a change you would otherwise have missed. Making is harder. Writing bots are the easiest thing to build and the hardest to keep, and the constraint is voice: a bot given examples of your writing produces something recognisably yours, while a bot given a topic produces something recognisably nobody's.",
  finance: "Financial admin is monthly, rule-following and thoroughly unloved, which makes it a natural fit. The jobs here handle receipts, invoice matching, forgotten subscriptions and getting the month closed before the deadline — work where being finished on time matters more than being done cleverly. Two cautions apply throughout. This is financial data, so read carefully what a template asks for access to, and be precise about the difference between reading a statement and acting on an account. And expect to correct the categorisation for the first couple of months: the rules are personal.",
  research: "Monitoring is the job an always-on agent is genuinely better at than a person, for one unglamorous reason: it is patient. Checking the same sources every morning, noticing the thing that changed, and staying quiet when nothing did is work humans do badly and briefly. The difference between a monitor worth keeping and one you mute is a threshold. A bot that reports every release produces a newsletter you stop opening; a bot that reports only what changes a decision you have already made stays useful indefinitely. Few templates set that up for you.",
  engineering: "Engineering bots cluster around the parts of the work that are legible and bounded — reviewing a diff, reproducing a reported bug, triaging issues, keeping dependencies current. Review is the strongest of them because a pull request is a finite thing with a clear question attached and a wrong answer is cheap, since a human reads the comment anyway. That is a far better risk profile than a bot that writes and merges. Judge these on whether the output is specific enough that ignoring it would count as a decision.",
  personal: "The consumer side of this ecosystem is larger than anyone predicted, and it is where the most genuinely novel bots live: houses that watch their own electricity rates, shopping that waits for a price, study that remembers what you got wrong last week. These templates are highly personal — most were built for one household and shared afterwards — so expect to rewrite the specifics rather than install and go. The recurring design question is how much the bot is allowed to actuate, and it is worth answering before rather than after.",
};

/**
 * Integration pages exist only where the data supports one.
 *
 * The SERP for "grok bot for gmail" is contested by vendor content marketing
 * rather than directories, which makes these worth targeting — but only where
 * there are enough real candidates to say something. A page per integration
 * regardless of supply is the thin-content pattern, so membership needs at
 * least MIN_BOTS on file and MIN_PLACED actually put forward for a job.
 */
export const INTEGRATION_MIN_BOTS = 6;
export const INTEGRATION_MIN_PLACED = 3;

export const INTEGRATIONS = {
  gmail: {
    label: 'Gmail',
    intro: "Email is the most contested job in this ecosystem and Gmail is where nearly all of it happens. The bots here divide on a line worth understanding before you install one: a single clear-out is an afternoon's work and a standing arrangement is a scheduled routine, and most templates do one or the other rather than both. The thing to check is what the bot may do unasked. Archiving on its own judgement is genuinely useful; sending on your behalf is a different risk, because a malformed email is an instruction as far as an agent is concerned.",
  },
  x: {
    label: 'X',
    intro: "X is the one integration where Grok Bot has a structural advantage rather than an incidental one — it reads posts, timelines, mentions and trends first-party, with no scraping arrangement to break. That makes watching genuinely reliable, and watching is most of what these bots are good for. Posting is where the category gets into trouble, and not subtly: a bot that answers mentions can be prompted by anyone who works out it exists. If you want one that writes, treat the absence of an approval step as the main fact about that listing.",
  },
  linkedin: {
    label: 'LinkedIn',
    intro: "Almost every LinkedIn bot here is doing sales research: working out who someone is, what they have posted recently, and what they are likely to care about before a conversation. That is the useful half. The other half is posting and connecting at volume, which LinkedIn itself is increasingly hostile to and which produces the kind of output everyone has learned to scroll past. Worth knowing that access here is less stable than the other integrations on this site — a bot that signs in on your behalf is one platform policy change away from stopping.",
  },
  github: {
    label: 'GitHub',
    intro: "Repository work suits an agent because the inputs are bounded and the failures are cheap: a pull request is a finite thing with a clear question attached, and a human reads the comment either way. The bots here review diffs, triage issues, chase dependencies and — at the ambitious end — open pull requests unattended overnight. The distinction that matters is between proposing and merging. A bot that leaves you something to read is a much smaller decision than one with write access to your default branch.",
  },
  notion: {
    label: 'Notion',
    intro: "Notion bots are mostly filing systems: taking what you already write down and putting it somewhere findable, or watching a source and filing on your behalf. The second is more useful and considerably harder to get right, since an automatic filer with poor judgement produces an archive you trust less than the mess it replaced. Worth thinking about before you commit, because this is the category where switching costs are highest — a bot holding two years of your notes is one you are stuck with.",
  },
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

  // A maker without a public X handle is legitimate — bot.store lists plenty
  // by display name only — so either identifier satisfies attribution.
  if (!isPlainObject(bot.creator)) e.push('creator: required object');
  else if (!isNonEmptyString(bot.creator.handle) && !isNonEmptyString(bot.creator.name))
    e.push('creator: needs a handle or a name (attribution is not optional)');

  // Attribution is not optional. Every record names where we found it.
  if (!isPlainObject(bot.discoveredVia)) e.push('discoveredVia: required object (attribution)');
  else {
    if (!isNonEmptyString(bot.discoveredVia.name)) e.push('discoveredVia.name: required');
    if (!isNonEmptyString(bot.discoveredVia.url)) e.push('discoveredVia.url: required');
  }

  // description is nullable ON PURPOSE.
  //
  // Ingest pulls facts — share URL, creator, source post, tags. It must never
  // pull a source directory's description, because that is their editorial and
  // reusing it is the exact pattern our own rules forbid. So an ingested record
  // arrives with description: null and stays unpublishable until somebody
  // writes our summary. The copy rule is enforced structurally: the pipeline
  // that could plagiarise has nowhere to put the stolen text.
  if (bot.description !== null && !isNonEmptyString(bot.description))
    e.push('description: must be our own words, or null until written');

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

  // The tiers are not a single ladder — they answer different questions.
  //
  //   source-linked  → where did this come from?  (needs the originating post)
  //   link-verified  → does it still exist, and what does xAI call it?
  //                    (needs the official page, and nothing else)
  //
  // A bot listed only on bot.store has no originating post but its official
  // page reconciles perfectly, so it is legitimately link-verified with no
  // sourceUrl. Requiring one here would have forced 59 records to understate
  // evidence we actually hold.
  if (bot.evidenceLevel === 'source-linked' && !isNonEmptyString(bot.sourceUrl)) {
    e.push('evidenceLevel is source-linked but sourceUrl is missing');
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

  // THE SELF-CONTRADICTION CHECK.
  //
  // An open-job intro earns its page by saying nothing good exists yet. The
  // moment a candidate is mapped, that sentence becomes false — and a page
  // reading "nobody has built one" above six candidates is worse than either
  // version alone. This actually happened: a keyword sweep reported zero
  // supply for account-research, the intro was written around that, and the
  // mapping pass then found six. Prose and data drift apart silently, so the
  // check is mechanical.
  if (isArray(job.bots) && job.bots.length > 0 && isNonEmptyString(job.intro)) {
    const claimsNothingExists =
      /\b(nobody|no one|no ?body) has (yet )?built\b|\bno bot (does|exists)\b|\bdoes not exist yet\b|\bcatalogues do not have one\b|\bwe could not find (a|one)\b/i.test(
        job.intro
      );
    if (claimsNothingExists)
      e.push(
        `intro claims nothing exists, but ${job.bots.length} bot(s) are mapped — rewrite the intro or drop the mappings`
      );
  }

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

  const botsBySlug = new Map(bots.map((b) => [b.slug, b.record]));

  for (const { slug, record } of jobs) {
    const errors = [];
    for (const b of record?.bots ?? []) {
      if (b?.botSlug && !botSlugs.has(b.botSlug)) {
        errors.push(`bots: "${b.botSlug}" has no record in data/bots/`);
        continue;
      }
      // A published job cannot put forward a candidate we have not written up.
      // This is what stops raw ingest output reaching a page: an ingested bot
      // has description: null until somebody describes it in our own words.
      if (record?.publish === true && !botsBySlug.get(b.botSlug)?.description) {
        errors.push(
          `bots: "${b.botSlug}" has no description yet — a published job cannot put forward a bot we have not written up`
        );
      }
    }
    for (const r of record?.relatedJobs ?? []) {
      if (!jobSlugs.has(r)) errors.push(`relatedJobs: "${r}" has no record in data/jobs/`);
      if (r === slug) errors.push('relatedJobs: a job cannot relate to itself');
    }
    if (errors.length) problems.push({ file: `data/jobs/${slug}.json`, errors });
  }

  return problems;
}
