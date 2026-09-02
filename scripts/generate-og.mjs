#!/usr/bin/env node
/**
 * Generate the social card set.
 *
 * The spec is explicit that we never reuse a source tweet's image — cards are
 * ours, in one consistent visual identity, so a link is recognisable in a feed
 * before anyone reads the domain. The palette is the mascot's: paper, ink,
 * hi-vis, and the same heavy outline the logo is drawn with.
 *
 * Written to public/og/ and committed. Rendering ~150 cards takes a while, so
 * it is a deliberate step rather than part of every build.
 *
 *   node scripts/generate-og.mjs            only cards that are missing
 *   node scripts/generate-og.mjs --force    redraw everything
 *   node scripts/generate-og.mjs --only=inbox-management
 */
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'og');

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const ONLY = args.find((a) => a.startsWith('--only='))?.split('=')[1] ?? null;

const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;

/* ------------------------------------------------------------------ palette */

const INK = '#231f1c';
const PAPER = '#fdfcf7';
const HIVIS = '#ffc81e';
const MUTED = '#6f6a63';

/**
 * Fonts come from the STATIC @fontsource packages, as .woff.
 *
 * Two constraints collide here. satori's opentype parser cannot read a
 * variable font's fvar table at all — it throws — so the -variable packages the
 * site itself uses are unusable. And it does not support woff2. The static
 * packages ship woff v1 at fixed weights, which satisfies both, and taking them
 * from node_modules means no font binaries in the repo and no download step.
 */
const FONT_DIR = join(ROOT, 'node_modules/@fontsource');
const [archivoBold, archivoRegular, mono, logo] = await Promise.all([
  readFile(join(FONT_DIR, 'archivo/files/archivo-latin-800-normal.woff')),
  readFile(join(FONT_DIR, 'archivo/files/archivo-latin-400-normal.woff')),
  readFile(join(FONT_DIR, 'jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff')),
  readFile(join(ROOT, 'public/logo-160.png')),
]);

const LOGO_SRC = `data:image/png;base64,${logo.toString('base64')}`;

const fonts = [
  { name: 'Archivo', data: archivoBold, weight: 800, style: 'normal' },
  { name: 'Archivo', data: archivoRegular, weight: 400, style: 'normal' },
  { name: 'Mono', data: mono, weight: 500, style: 'normal' },
];

/* -------------------------------------------------------------------- card */

/** Trim to a length that will not overflow the headline box. */
const clamp = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

/**
 * One card layout, three variations. Deliberately not three layouts: the point
 * of a card set is that a stranger recognises the second one because they saw
 * the first.
 */
function card({ eyebrow, title, highlight, meta, badge }) {
  return {
    type: 'div',
    props: {
      style: {
        width: 1200,
        height: 630,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: PAPER,
        padding: 64,
        // The outline the mascot is drawn with, at page scale.
        border: `14px solid ${INK}`,
        fontFamily: 'Archivo',
      },
      children: [
        // eyebrow
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              fontFamily: 'Mono',
              fontSize: 22,
              letterSpacing: 4,
              textTransform: 'uppercase',
              color: MUTED,
            },
            children: eyebrow,
          },
        },

        // headline, with the highlighted phrase on its own line behind a marker
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              flexDirection: 'column',
              flex: 1,
              justifyContent: 'center',
              marginTop: 8,
            },
            children: [
              title
                ? {
                    type: 'div',
                    props: {
                      style: {
                        display: 'flex',
                        fontSize: 52,
                        fontWeight: 800,
                        letterSpacing: -1.5,
                        color: INK,
                        lineHeight: 1.05,
                      },
                      children: title,
                    },
                  }
                : null,
              {
                type: 'div',
                props: {
                  style: { display: 'flex', marginTop: title ? 10 : 0 },
                  children: [
                    {
                      type: 'div',
                      props: {
                        style: {
                          display: 'flex',
                          fontSize: highlight.length > 26 ? 64 : 84,
                          fontWeight: 800,
                          letterSpacing: -2.5,
                          color: INK,
                          lineHeight: 1.02,
                          // The highlighter, as a block behind the words.
                          backgroundColor: HIVIS,
                          paddingLeft: 14,
                          paddingRight: 14,
                          paddingTop: 2,
                          paddingBottom: 6,
                        },
                        children: highlight,
                      },
                    },
                  ],
                },
              },
              badge
                ? {
                    type: 'div',
                    props: {
                      style: {
                        display: 'flex',
                        // A flex column stretches its children by default, which
                        // made the pill span the whole card.
                        alignSelf: 'flex-start',
                        marginTop: 26,
                        fontFamily: 'Mono',
                        fontSize: 20,
                        color: INK,
                        border: `3px solid ${INK}`,
                        borderRadius: 999,
                        paddingLeft: 18,
                        paddingRight: 18,
                        paddingTop: 6,
                        paddingBottom: 8,
                        backgroundColor: HIVIS,
                      },
                      children: badge,
                    },
                  }
                : null,
            ].filter(Boolean),
          },
        },

        // footer: wordmark, meta, mascot
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderTop: `4px solid ${INK}`,
              paddingTop: 26,
            },
            children: [
              {
                type: 'div',
                props: {
                  style: { display: 'flex', flexDirection: 'column' },
                  children: [
                    {
                      type: 'div',
                      props: {
                        style: { display: 'flex', fontSize: 30, fontWeight: 800, letterSpacing: -0.8, color: INK },
                        children: 'BotJobs.dev',
                      },
                    },
                    meta
                      ? {
                          type: 'div',
                          props: {
                            style: { display: 'flex', fontFamily: 'Mono', fontSize: 20, color: MUTED, marginTop: 4 },
                            children: meta,
                          },
                        }
                      : null,
                  ].filter(Boolean),
                },
              },
              {
                type: 'img',
                props: { src: LOGO_SRC, width: 124, height: 124 },
              },
            ],
          },
        },
      ],
    },
  };
}

async function render(node, file) {
  const svg = await satori(node, { width: 1200, height: 630, fonts });
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();
  await writeFile(join(OUT, file), png);
}

/* --------------------------------------------------------------------- run */

await mkdir(OUT, { recursive: true });

const readJson = async (dir) => {
  const files = (await readdir(join(ROOT, 'data', dir))).filter((f) => f.endsWith('.json'));
  return Promise.all(files.map(async (f) => JSON.parse(await readFile(join(ROOT, 'data', dir, f), 'utf8'))));
};

const [jobs, bots] = await Promise.all([readJson('jobs'), readJson('bots')]);
const placed = new Set(jobs.flatMap((j) => j.bots.map((b) => b.botSlug)));

let written = 0;
const skip = (file) => !FORCE && existsSync(join(OUT, file));

// Default card, used by the homepage and anything without its own.
if (!ONLY && !skip('default.png')) {
  await render(
    card({
      eyebrow: 'The vacancies board for Grok Bots',
      title: 'Find the right',
      highlight: 'GrokBot for the job.',
      meta: `${bots.length} bots · ${jobs.length} jobs`,
    }),
    'default.png'
  );
  written += 1;
}

for (const job of jobs) {
  if (!job.publish) continue;
  if (ONLY && job.slug !== ONLY) continue;
  const file = `job-${job.slug}.png`;
  if (skip(file)) continue;

  const open = job.bots.length === 0;
  await render(
    card({
      eyebrow: open ? 'Open position' : 'Now hiring',
      title: open ? 'Nobody has built' : 'Best Grok Bots for',
      highlight: clamp(job.title, 34),
      badge: open ? 'No bot does this yet' : null,
      meta: open ? 'A job people want done' : `${job.bots.length} candidate${job.bots.length === 1 ? '' : 's'} compared`,
    }),
    file
  );
  written += 1;
}

// Only bots that earn an index slot get a card — the rest are never shared.
for (const bot of bots) {
  if (!placed.has(bot.slug) || bot.linkStatus === 'dead') continue;
  if (ONLY && bot.slug !== ONLY) continue;
  const file = `bot-${bot.slug}.png`;
  if (skip(file)) continue;

  const creator = bot.creator.handle ? `@${bot.creator.handle}` : bot.creator.name;
  await render(
    card({
      eyebrow: 'Candidate',
      title: null,
      highlight: clamp(bot.name, 30),
      meta: `by ${creator} · references checked`,
    }),
    file
  );
  written += 1;
}

console.log(`${green('✓')} ${written} card${written === 1 ? '' : 's'} written ${dim(`→ public/og/`)}`);
