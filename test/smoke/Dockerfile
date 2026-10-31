# glibc guest so the host-built bros binary runs; docker.sock for nested compose.
FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    bash curl ca-certificates python3 \
    docker.io docker-compose-v2 \
  && rm -rf /var/lib/apt/lists/* \
  && docker compose version
WORKDIR /smoke
