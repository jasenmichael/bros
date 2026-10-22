FROM node:26.7.0-bookworm-slim AS nodebin
FROM docker:27-cli AS dockercli

FROM ghcr.io/linuxserver/baseimage-selkies:ubunturesolute

ENV PIXELFLUX_WAYLAND=true
ENV SELKIES_MODE=websockets
ENV SUBFOLDER=/desktop/view/
ENV DEBIAN_FRONTEND=noninteractive
ENV HOME=/home/bros
ENV PATH="/home/bros/.local/sidecar-bins:/home/bros/.local/bin:/home/bros/.local/devbox-bin:/home/bros/.local/share/pnpm:/home/bros/.bun/bin:/home/bros/.deno/bin:/lsiopy/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

COPY --from=nodebin /usr/local/bin/node /usr/local/bin/node
COPY --from=nodebin /usr/local/lib/node_modules /usr/local/lib/node_modules
COPY core/desktop/core-apt.yml /tmp/core-apt.yml
RUN ln -sf ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
  && ln -sf ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx \
  && node -e 'const fs=require("fs"); const names=[...fs.readFileSync("/tmp/core-apt.yml","utf8").matchAll(/^\s*-\s*name:\s*([A-Za-z0-9.+-]+)/gm)].map(m=>m[1]); if(!names.length) process.exit(1); process.stdout.write(names.join("\n"))' > /tmp/apt-names \
  && apt-get update \
  && apt-get install -y --no-install-recommends $(tr "\n" " " < /tmp/apt-names) fonts-dejavu-core \
  && rm -rf /var/lib/apt/lists/* /tmp/core-apt.yml /tmp/apt-names

COPY --from=dockercli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=dockercli /usr/local/libexec/docker/cli-plugins/docker-compose \
  /usr/local/libexec/docker/cli-plugins/docker-compose

ARG TTYD_VERSION=1.7.7
RUN arch="$(dpkg --print-architecture)" \
  && case "$arch" in amd64) ttyd_arch=x86_64 ;; arm64) ttyd_arch=aarch64 ;; *) echo "unsupported $arch"; exit 1 ;; esac \
  && curl -fsSL -o /usr/local/bin/ttyd \
    "https://github.com/tsl0922/ttyd/releases/download/${TTYD_VERSION}/ttyd.${ttyd_arch}" \
  && chmod +x /usr/local/bin/ttyd

ARG PNPM_VERSION=10.15.0
ARG BUN_VERSION=1.2.21
ARG DENO_VERSION=2.1.4
RUN HOME=/tmp npm install -g pnpm@${PNPM_VERSION} --prefix /usr/local \
  && curl -fsSL https://bun.sh/install | HOME=/tmp BUN_INSTALL=/usr/local bash -s "bun-v${BUN_VERSION}" \
  && curl -fsSL https://deno.land/install.sh | HOME=/tmp DENO_INSTALL=/usr/local sh -s "v${DENO_VERSION}"
# Single-user Nix. Devbox 0.18's installer starts a daemon that dies with this RUN.
ARG UV_VERSION=0.13.5
ARG DEVBOX_VERSION=0.18.4
RUN arch="$(dpkg --print-architecture)" \
  && case "$arch" in \
       amd64) uv_target=x86_64-unknown-linux-gnu; devbox_arch=amd64 ;; \
       arm64) uv_target=aarch64-unknown-linux-gnu; devbox_arch=arm64 ;; \
       *) echo "unsupported $arch"; exit 1 ;; \
     esac \
  && curl -fsSL "https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/uv-${uv_target}.tar.gz" | tar -xz -C /tmp \
  && install -m 0755 "/tmp/uv-${uv_target}/uv" "/tmp/uv-${uv_target}/uvx" /usr/local/bin/ \
  && rm -rf "/tmp/uv-${uv_target}" \
  && mkdir -p /usr/local/libexec /opt/bros/nix-home /opt/bros/devbox /etc/nix \
  && curl -fsSL "https://github.com/jetify-com/devbox/releases/download/${DEVBOX_VERSION}/devbox_${DEVBOX_VERSION}_linux_${devbox_arch}.tar.gz" | tar -xz -C /usr/local/libexec devbox \
  && chmod 0755 /usr/local/libexec/devbox \
  && printf '%s\n' 'sandbox = false' 'experimental-features = nix-command flakes' > /etc/nix/nix.conf \
  && curl -fsSL https://nixos.org/nix/install | HOME=/opt/bros/nix-home sh -s -- --no-daemon --yes \
  && for b in /opt/bros/nix-home/.nix-profile/bin/*; do \
       [ -e "$b" ] || continue; \
       ln -sfn "$b" "/usr/local/bin/$(basename "$b")"; \
     done \
  && printf '%s\n' '#!/bin/sh' 'export XDG_DATA_HOME=/opt/bros/devbox' 'exec /usr/local/libexec/devbox "$@"' > /usr/local/bin/devbox \
  && chmod 0755 /usr/local/bin/devbox \
  && HOME=/opt/bros/nix-home devbox global list \
  && chmod -R a+rX /nix /opt/bros/nix-home /opt/bros/devbox
ENV npm_config_prefix=/home/bros/.local \
  PNPM_HOME=/home/bros/.local/share/pnpm \
  npm_config_store_dir=/home/bros/.local/share/pnpm/store \
  BUN_INSTALL=/home/bros/.bun \
  DENO_INSTALL_ROOT=/home/bros/.deno \
  DENO_DIR=/home/bros/.deno/cache \
  UV_CACHE_DIR=/home/bros/.cache/uv \
  RUSTUP_HOME=/usr/local/rustup \
  CARGO_HOME=/home/bros/.cargo
COPY core/desktop/install.mjs /opt/bros/install.mjs
COPY core/desktop/managers/ /opt/bros/managers/
COPY core/desktop/app-services/ /opt/bros/app-services/
COPY core/desktop/desktop-gui.sh /opt/bros/desktop-gui.sh
COPY core/desktop/root/ /
RUN chmod +x /opt/bros/desktop-gui.sh /custom-services.d/ttyd /custom-services.d/app-services /custom-cont-init.d/bros-live

WORKDIR /home/bros/workspace
EXPOSE 3000 7681
