# syntax=docker/dockerfile:1

FROM docker:27.5.1-cli@sha256:851f91d241214e7c6db86513b270d58776379aacc5eb9c4a87e5b47115e3065c AS dockercli

# Shared toolchain (no app source). Dev uses this as-is; prod build layers on top.
FROM node:26.7.0-bookworm-slim@sha256:4db36457f406501e6f608802e5da617e5fbd0e80b75901b6a09de1ae5a667d32 AS tools

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    git curl ca-certificates systemd \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g pnpm@12.15.0

COPY --from=dockercli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=dockercli /usr/local/libexec/docker/cli-plugins/docker-compose \
  /usr/local/libexec/docker/cli-plugins/docker-compose

WORKDIR /app
ENV BROS_DIR=/app

# Dev: bind-mount repo at /app; entrypoint installs the src/ workspace then runs pnpm.
FROM tools AS development

WORKDIR /app/src

ENV NODE_ENV=development
EXPOSE 3055
CMD ["pnpm", "--filter", "@bros/ui", "dev"]

# Prod path: bake workspace into image.
FROM tools AS base

WORKDIR /app
COPY src/package.json src/pnpm-workspace.yaml src/pnpm-lock.yaml src/.npmrc ./src/
COPY src/cli/package.json ./src/cli/
COPY src/ui/package.json ./src/ui/
COPY src/layers/theme/package.json ./src/layers/theme/
COPY src/layers/docs/package.json ./src/layers/docs/

WORKDIR /app/src
# @bros/website is GitHub Pages only. ui... pulls docs + theme.
RUN pnpm install --filter "@bros/ui..." --filter "@bros/cli..." --frozen-lockfile \
  || pnpm install --filter "@bros/ui..." --filter "@bros/cli..." --no-frozen-lockfile

WORKDIR /app
COPY . .

FROM base AS build

WORKDIR /app/src
RUN pnpm --filter @bros/ui build \
  && pnpm --filter @bros/cli build

FROM node:26.7.0-bookworm-slim@sha256:4db36457f406501e6f608802e5da617e5fbd0e80b75901b6a09de1ae5a667d32 AS production

RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ca-certificates curl git systemd \
  && rm -rf /var/lib/apt/lists/*

COPY --from=dockercli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=dockercli /usr/local/libexec/docker/cli-plugins/docker-compose \
  /usr/local/libexec/docker/cli-plugins/docker-compose

WORKDIR /app
ENV NODE_ENV=production
ENV BROS_DIR=/app
ENV BROS_NETWORK=bros

COPY --from=build /app/src/ui/.output /app/src/ui/.output
COPY --from=build /app/src/cli/dist/index.mjs /usr/local/lib/bros-cli.mjs
# Entry imports dist/shared and dynamically imports dist/chunks. Both sit beside the file.
COPY --from=build /app/src/cli/dist/shared /usr/local/lib/shared
COPY --from=build /app/src/cli/dist/chunks /usr/local/lib/chunks
COPY --from=build /app/docs/cli.md /usr/local/lib/bros-cli.md
COPY --from=build /app/vendor/bros-model/models /app/vendor/bros-model/models
COPY --from=build /app/vendor/bros-model/ollama /app/vendor/bros-model/ollama
COPY --from=build /app/vendor/bros-model/scripts /app/vendor/bros-model/scripts
COPY --from=build /app/lib/skills /app/lib/skills
COPY --from=build /app/lib/rules /app/lib/rules
COPY docker/prod-entrypoint.sh /app/docker/prod-entrypoint.sh

EXPOSE 3055
CMD ["/bin/sh", "/app/docker/prod-entrypoint.sh"]
