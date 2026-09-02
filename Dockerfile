# The site is a Node server, not a static bundle: job pages are rendered per
# request and the submit endpoints write to disk. So this needs a host with a
# filesystem that survives a restart, which rules out the serverless free tiers.
#
# Two stages so the runtime image carries no build tooling. satori, resvg and
# sharp are devDependencies used only by `pnpm og`, and never ship.

FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable

# Dependencies first: this layer is cached until the lockfile actually changes,
# which is the difference between a 15-second deploy and a two-minute one.
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

FROM node:22-slim AS runtime
WORKDIR /app
RUN corepack enable
ENV NODE_ENV=production

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY --from=build /app/dist ./dist

# The inbox. Submissions live on the volume, so reading them means running this
# on the machine — `fly ssh console -C "node /app/scripts/queue.mjs"`. It has no
# dependencies beyond node:fs, which is why it can come along on its own.
COPY scripts/queue.mjs ./scripts/queue.mjs

# The standalone server reads HOST and PORT at runtime. It has to bind 0.0.0.0
# inside a container — the 127.0.0.1 in astro.config.mjs only affects `pnpm dev`.
ENV HOST=0.0.0.0
ENV PORT=8080

# Submissions, reports, rate-limit counters and the analytics log. Mounted from
# a volume, so it outlives the container. If this points anywhere else the data
# is gone on the next deploy.
ENV DATA_DIR=/data

EXPOSE 8080
CMD ["node", "./dist/server/entry.mjs"]
