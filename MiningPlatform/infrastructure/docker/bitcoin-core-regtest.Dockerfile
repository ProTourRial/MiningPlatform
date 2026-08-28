# MiningPlatform
# Author: Abia Nugrahanto
# Copyright (c) 2026 Abia Nugrahanto. All rights reserved.

ARG BITCOIN_CORE_VERSION=31.0

FROM debian:bookworm-slim AS downloader
ARG BITCOIN_CORE_VERSION
ARG TARGETARCH

RUN apt-get update \
  && apt-get install --no-install-recommends -y ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

RUN set -eux; \
  case "${TARGETARCH}" in \
    amd64) archive="bitcoin-${BITCOIN_CORE_VERSION}-x86_64-linux-gnu.tar.gz"; checksum="d3e4c58a35b1d0a97a457462c94f55501ad167c660c245cb1ffa565641c65074" ;; \
    arm64) archive="bitcoin-${BITCOIN_CORE_VERSION}-aarch64-linux-gnu.tar.gz"; checksum="4de1d568dedd48604f75132421bc0abeca432639589b49a3909c81db3a813112" ;; \
    *) echo "Unsupported Bitcoin Core architecture: ${TARGETARCH}" >&2; exit 1 ;; \
  esac; \
  curl --fail --location --proto '=https' --tlsv1.2 \
    --output "/tmp/${archive}" \
    "https://bitcoincore.org/bin/bitcoin-core-${BITCOIN_CORE_VERSION}/${archive}"; \
  echo "${checksum}  /tmp/${archive}" | sha256sum --check --strict; \
  tar --extract --gzip --file "/tmp/${archive}" --directory /tmp; \
  install -D -m 0755 "/tmp/bitcoin-${BITCOIN_CORE_VERSION}/bin/bitcoind" /out/bitcoind; \
  install -D -m 0755 "/tmp/bitcoin-${BITCOIN_CORE_VERSION}/bin/bitcoin-cli" /out/bitcoin-cli

FROM debian:bookworm-slim AS runtime

RUN apt-get update \
  && apt-get install --no-install-recommends -y ca-certificates libstdc++6 \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system bitcoin \
  && useradd --system --gid bitcoin --home-dir /home/bitcoin --create-home bitcoin

COPY --from=downloader /out/bitcoind /usr/local/bin/bitcoind
COPY --from=downloader /out/bitcoin-cli /usr/local/bin/bitcoin-cli

RUN install -d -o bitcoin -g bitcoin /home/bitcoin/.bitcoin

USER bitcoin
WORKDIR /home/bitcoin
VOLUME ["/home/bitcoin/.bitcoin"]
EXPOSE 18443

ENTRYPOINT ["bitcoind"]
