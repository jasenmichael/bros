# glibc guest so the host-built bros binary runs; docker.sock for nested compose.
FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
  && apt-get install -y --no-install-recommends bash curl ca-certificates docker.io \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /smoke
