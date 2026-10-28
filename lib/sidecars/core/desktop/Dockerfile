FROM docker:27.5.1-cli@sha256:851f91d241214e7c6db86513b270d58776379aacc5eb9c4a87e5b47115e3065c AS dockercli

FROM ghcr.io/linuxserver/baseimage-selkies:ubunturesolute-4eb74d68-ls53@sha256:beebd1f142f792e9767780a70cbc6c41c6c448e12fcda4504417404f1f118df3

ENV PIXELFLUX_WAYLAND=true
ENV SELKIES_MODE=websockets
ENV SUBFOLDER=/desktop/view/
ENV DEBIAN_FRONTEND=noninteractive
ENV HOME=/home/bros
ENV XDG_DATA_HOME=/home/bros/.local/share
ENV XDG_STATE_HOME=/home/bros/.local/state
ENV XDG_CACHE_HOME=/home/bros/.cache
ENV XDG_CONFIG_HOME=/home/bros/.config
ENV PATH="/home/bros/.local/sidecar-bins:$PATH"

COPY core/desktop/core-apt.yml /tmp/core-apt.yml
RUN awk '/^[[:space:]]*-[[:space:]]*name:/ { print $3 }' /tmp/core-apt.yml > /tmp/apt-names \
  && [ -s /tmp/apt-names ] \
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

# Devbox and Nix install at container start, after /home/bros and /nix are mounted.
ENV npm_config_prefix=/home/bros/.local \
  PNPM_HOME=/home/bros/.local/share/pnpm \
  npm_config_store_dir=/home/bros/.local/share/pnpm/store \
  BUN_INSTALL=/home/bros/.bun \
  DENO_INSTALL_ROOT=/home/bros/.deno \
  DENO_DIR=/home/bros/.deno/cache \
  UV_CACHE_DIR=/home/bros/.cache/uv \
  CARGO_HOME=/home/bros/.cargo
COPY core/desktop/install.mjs /opt/bros/install.mjs
COPY core/desktop/ensure.sh /opt/bros/ensure.sh
COPY core/desktop/managers/ /opt/bros/managers/
COPY core/desktop/app-services/ /opt/bros/app-services/
COPY core/desktop/desktop-gui.sh /opt/bros/desktop-gui.sh
COPY core/desktop/root/ /
RUN chmod +x /opt/bros/ensure.sh /opt/bros/desktop-gui.sh /custom-services.d/ttyd /custom-services.d/app-services /custom-cont-init.d/bros-live

WORKDIR /home/bros/workspace
EXPOSE 3000 7681
