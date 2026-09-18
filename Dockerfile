# syntax=docker/dockerfile:1

FROM docker:27-cli AS dockercli

# Shared toolchain (no app source). Dev uses this as-is; prod build layers on top.
FROM node:22-bookworm-slim AS tools

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    python3 make g++ git curl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable

COPY --from=dockercli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=dockercli /usr/local/libexec/docker/cli-plugins/docker-compose \
  /usr/local/libexec/docker/cli-plugins/docker-compose

WORKDIR /app

# Dev: bind-mount repo at /app; install + pnpm dev at container start (see compose + entrypoint).
FROM tools AS development

ENV NODE_ENV=development
ENV HOST=0.0.0.0
ENV PORT=3055
ENV NUXT_HOST=0.0.0.0
ENV NUXT_PORT=3055
EXPOSE 3055
CMD ["pnpm", "--filter", "@bros/app", "dev", "--host", "0.0.0.0", "--port", "3055"]

# Prod path: bake workspace into image.
FROM tools AS base

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* .npmrc ./
COPY src/app/package.json ./src/app/
COPY src/website/package.json ./src/website/
COPY src/layers/theme/package.json ./src/layers/theme/
COPY src/layers/docs/package.json ./src/layers/docs/

RUN pnpm install --frozen-lockfile || pnpm install --no-frozen-lockfile

COPY . .

FROM base AS build

RUN pnpm --filter @bros/app build

FROM node:22-bookworm-slim AS production

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=dockercli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=dockercli /usr/local/libexec/docker/cli-plugins/docker-compose \
  /usr/local/libexec/docker/cli-plugins/docker-compose

WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3055
ENV NITRO_HOST=0.0.0.0
ENV NITRO_PORT=3055
ENV BROS_WORKING_DIR=/app
ENV BROS_DATA_DIR=/data
ENV BROS_SIDECARS_DIR=/app/sidecars
ENV BROS_NETWORK=bros

COPY --from=build /app/src/app/.output /app/src/app/.output
COPY --from=build /app/package.json /app/package.json
COPY --from=build /app/bros.yml /app/bros.yml
COPY --from=build /app/sidecars /app/sidecars
COPY --from=build /app/vendor/bros-model/models /app/vendor/bros-model/models
COPY --from=build /app/vendor/bros-model/ollama /app/vendor/bros-model/ollama
COPY --from=build /app/vendor/bros-model/scripts /app/vendor/bros-model/scripts

EXPOSE 3055
CMD ["node", "/app/src/app/.output/server/index.mjs"]
