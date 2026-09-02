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

## Deploy

This is a Node server, not a static bundle. Job pages render per request, and
`/submit` and `/report` write to disk — so it needs a host with a **filesystem
that survives a restart**. The serverless free tiers do not have one, and on
those every submission and every analytics event is lost on each deploy,
silently. A `Dockerfile` and `fly.toml` are included for that reason.

```sh
fly launch --copy-config --no-deploy   # reuses fly.toml; pick your own app name
fly volumes create botjobs_data --size 1
fly secrets set IP_SALT="$(openssl rand -hex 16)"
fly deploy
```

`fly deploy` builds remotely, so Docker does not need to be running locally.

Optional secrets: `ANTHROPIC_API_KEY` to have submitted bots written up
automatically, `POSTHOG_KEY` to mirror analytics off the box.

### The one setting not to remove

`astro.config.mjs` sets `security: { checkOrigin: false }`. It looks like
something to tidy up. It is not.

Astro's cross-origin form check compares the browser's `Origin` against an
origin it derives itself — and the Node adapter reads the scheme off the
socket, ignoring `x-forwarded-proto`. Anywhere TLS terminates at an edge or a
proxy, the browser sends `https` and the adapter builds `http`, so **every form
on the site returns 403**. No proxy configuration fixes it.

Turning it off is safe here for a reason specific to this site rather than as a
general rule: the check defends against a forged request riding an ambient
credential, and there are no accounts, no sessions and no cookies here. Nothing
to ride — a forged POST does exactly what an honest one does, which is add a row
to a queue a person reads. The per-IP rate limit, the honeypot and the
validation are what actually protect those endpoints, and none of them involve
this setting. **Revisit it the day anything here sets a cookie.**

After deploying, submit a job on the live site. A 403 means somebody removed it.

### Reading the inbox

Submissions live on the volume, not in the repo:

```sh
fly ssh console -C "node /app/scripts/queue.mjs"
```

Removals sort to the top, in red, with the file path to delete.

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

Bots and jobs are JSON files in `data/`. **Submitting one needs no GitHub account and
opens no pull request** — [the submit form](https://botjobs.dev/submit) takes a share link
or a sentence, checks it, and queues it for a person. Direct PRs are welcome too, from
anyone who would rather write the JSON themselves.

Running the inbox:

```sh
pnpm queue           # everything waiting on a human
pnpm queue --write   # turn drafted bot records into files in data/bots/
pnpm validate        # then read the diff before committing
```

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
