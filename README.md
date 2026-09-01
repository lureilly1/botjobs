# Bot Jobs

**[botjobs.dev](https://botjobs.dev)** — the independent directory of things you can get
Grok Bot to do.

The primary object is **the job, not the bot**. You arrive with an intent — *monitor my
competitors* — and the site answers which Grok Bots do that, what they need, and where
they came from. A job nobody has built a bot for yet stays up as an **open job**.

Not affiliated with or endorsed by xAI. Grok and Grok Bot are trademarks of xAI.

## Stack

- [Astro](https://astro.build) server output + Node adapter — every content page is fully
  rendered HTML with **zero JavaScript shipped**
- [shadcn/ui](https://ui.shadcn.com) components (Tailwind v4 + React), rendered statically
  in `.astro` files. React hydrates only for genuinely interactive islands
- Records are JSON files in `data/` — the repo is the admin panel

## Run it locally

```sh
pnpm install
pnpm dev          # http://localhost:4321
```

```sh
pnpm build && pnpm start
```

No environment variables are required for local development.

## Re-skinning

Everything a new site needs to change lives in one block at the top of
[`src/styles/global.css`](src/styles/global.css). Move `--brand-hue` and the whole
directory changes character without touching a component:

```css
--brand-hue: 258;   /* 145 = green, 25 = red, 65 = amber */
--brand-chroma: 0.17;
```

Route naming is centralised in [`src/config.ts`](src/config.ts). Nothing outside that file
contains the string `grok-bot`, so a product rename costs a constant and a redirect map.

## Contributing

Bots and jobs are JSON files in `data/`, added by PR. The
[submit form](https://botjobs.dev/submit) drafts the entry and opens the PR for you — you
never need to touch JSON. Direct PRs are always welcome too.

## Conventions

- **Never copy a source directory's description.** Our own words, or the creator's own
  quoted and linked.
- **"Discovered via" credit on every record**, naming the source with a link.
- **Never reproduce template contents, prompt bodies, or reconstructed configurations.**
  Link to the official `x.ai/bot/…` URL and stop there.
- **Text evidence badges only** — no stars, no invented ratings, no `AggregateRating`.
  `link-verified` means we reconciled the listing against the official page. It does not
  mean we ran the bot, and it must never be labelled as though it does.

## License

[MIT](LICENSE).
