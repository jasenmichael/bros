# syntax=docker/dockerfile:1

FROM docker:27.5.1-cli@sha256:851f91d241214e7c6db86513b270d58776379aacc5eb9c4a87e5b47115e3065c AS dockercli

FROM node:26.7.0-bookworm-slim@sha256:4db36457f406501e6f608802e5da617e5fbd0e80b75901b6a09de1ae5a667d32 AS nodetools

RUN npm install -g pnpm@12.15.0

# UI host for prod without host pnpm. Runs the prebuilt Nitro server.
# This stage does not install packages or rebuild the UI. Not the desktop image.
# Docker CLI talks to the mounted host sock for app autostart / compose.
FROM nodetools AS ui
WORKDIR /app
COPY --from=dockercli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=dockercli /usr/local/libexec/docker/cli-plugins/docker-compose \
  /usr/local/libexec/docker/cli-plugins/docker-compose
COPY app/ui/.output /app/app/ui/.output
COPY scripts/docker /app/scripts/docker
COPY docs/cli.md /app/docs/cli.md
COPY lib /app/lib
ENV NODE_ENV=production
ENV BROS_DIR=/app
ENV BROS_DESKTOP_STREAM_ORIGIN=http://bros:3000
ENV BROS_TERMINAL_ORIGIN=http://bros:7681
EXPOSE 3055
CMD ["/bin/sh", "/app/scripts/docker/prod-entrypoint.sh"]

FROM ghcr.io/linuxserver/baseimage-selkies:ubunturesolute-4eb74d68-ls53@sha256:beebd1f142f792e9767780a70cbc6c41c6c448e12fcda4504417404f1f118df3 AS runtime

ENV PIXELFLUX_WAYLAND=true
ENV SELKIES_MODE=websockets
ENV SELKIES_ENABLE_SHARING=false
ENV SUBFOLDER=/desktop/view/
ENV DEBIAN_FRONTEND=noninteractive
ENV HOME=/home/bros
ENV XDG_DATA_HOME=/home/bros/.local/share
ENV XDG_STATE_HOME=/home/bros/.local/state
ENV XDG_CACHE_HOME=/home/bros/.cache
ENV XDG_CONFIG_HOME=/home/bros/.config
ENV PATH="/home/bros/.local/app-bins:$PATH"
ENV BROS_DIR=/app
ENV BROS_NETWORK=bros

COPY lib/desktop/core-apt.yml /tmp/core-apt.yml
RUN awk '/^[[:space:]]*-[[:space:]]*name:/ { print $3 }' /tmp/core-apt.yml > /tmp/apt-names \
  && [ -s /tmp/apt-names ] \
  && apt-get update \
  && apt-get install -y --no-install-recommends $(tr "\n" " " < /tmp/apt-names) fonts-dejavu-core \
  && rm -rf /var/lib/apt/lists/* /tmp/core-apt.yml /tmp/apt-names

COPY --from=dockercli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=dockercli /usr/local/libexec/docker/cli-plugins/docker-compose \
  /usr/local/libexec/docker/cli-plugins/docker-compose
COPY --from=nodetools /usr/local/bin/node /usr/local/bin/node
COPY --from=nodetools /usr/local/bin/npm /usr/local/bin/npm
COPY --from=nodetools /usr/local/bin/npx /usr/local/bin/npx
COPY --from=nodetools /usr/local/bin/pnpm /usr/local/bin/pnpm
COPY --from=nodetools /usr/local/lib/node_modules /usr/local/lib/node_modules

ARG TTYD_VERSION=1.7.7
RUN arch="$(dpkg --print-architecture)" \
  && case "$arch" in amd64) ttyd_arch=x86_64 ;; arm64) ttyd_arch=aarch64 ;; *) echo "unsupported $arch"; exit 1 ;; esac \
  && curl -fsSL -o /usr/local/bin/ttyd \
    "https://github.com/tsl0922/ttyd/releases/download/${TTYD_VERSION}/ttyd.${ttyd_arch}" \
  && chmod +x /usr/local/bin/ttyd

# Devbox and Nix install at container start, after /home/bros and /nix are mounted.
ENV npm_config_prefix=/home/bros/.local \
  PNPM_HOME=/home/bros/.local/share/pnpm \
  npm_config_store_dir=/home/bros/.local/share/pnpm/store \
  BUN_INSTALL=/home/bros/.bun \
  DENO_INSTALL_ROOT=/home/bros/.deno \
  DENO_DIR=/home/bros/.deno/cache \
  UV_CACHE_DIR=/home/bros/.cache/uv \
  CARGO_HOME=/home/bros/.cargo
COPY lib/desktop/install.ts /opt/bros/install.ts
COPY lib/desktop/ensure.sh /opt/bros/ensure.sh
COPY lib/desktop/managers/ /opt/bros/managers/
COPY lib/desktop/app-services/ /opt/bros/app-services/
COPY lib/desktop/desktop-gui.sh /opt/bros/desktop-gui.sh
COPY lib/desktop/root/ /
COPY scripts/docker/prod-entrypoint.sh /app/scripts/docker/prod-entrypoint.sh
COPY scripts/docker/dev-entrypoint.sh /app/scripts/docker/dev-entrypoint.sh
RUN chmod +x /opt/bros/ensure.sh /opt/bros/desktop-gui.sh \
  /usr/local/bin/bros-portals.sh /usr/local/bin/bros-gtk-theme.sh \
  /custom-services.d/ttyd /custom-services.d/app-services /custom-cont-init.d/bros-live \
  && chmod +x /app/scripts/docker/prod-entrypoint.sh /app/scripts/docker/dev-entrypoint.sh

WORKDIR /home/bros/workspace
EXPOSE 3000 7681

FROM runtime AS development

FROM runtime AS production

COPY lib /app/lib
COPY scripts/docker /app/scripts/docker
ENV NODE_ENV=production
