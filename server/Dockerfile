# syntax=docker/dockerfile:1
FROM --platform=$BUILDPLATFORM denoland/deno:2.4.2 AS build

ARG TARGETARCH

WORKDIR /src
COPY . .

WORKDIR /src/server
RUN case "${TARGETARCH}" in \
      amd64) DENO_TARGET=x86_64-unknown-linux-gnu ;; \
      arm64) DENO_TARGET=aarch64-unknown-linux-gnu ;; \
      *) echo "unsupported TARGETARCH=${TARGETARCH}" && exit 1 ;; \
    esac \
    && deno compile \
      --allow-net \
      --allow-read \
      --allow-write \
      --allow-ffi \
      --allow-env \
      --output build/server \
      --target "${DENO_TARGET}" \
      ./main.ts

FROM debian:bookworm-slim AS runtime

RUN groupadd --system --gid 1001 app \
  && useradd --system --uid 1001 --gid app --home /app --shell /usr/sbin/nologin app

WORKDIR /app
COPY --from=build /src/server/build/server /app/server

RUN mkdir -p /app/tmp && chown -R app:app /app

USER app

ENV SERVER_PORT=8080
EXPOSE 8080

CMD ["/app/server"]
