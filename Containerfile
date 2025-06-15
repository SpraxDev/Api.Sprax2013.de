FROM docker.io/node:22-slim AS base

LABEL maintainer="Christian Koop <contact@sprax2013.de>"
LABEL org.opencontainers.image.source="https://github.com/SpraxDev/Api.Sprax2013.De"

RUN export DEBIAN_FRONTEND=noninteractive && \
    apt-get update && \
    apt-get upgrade -y && \
    apt-get install -y \
    openssl \
    xvfb && \
    apt-get clean && \
    npm install --global npm --update-notifier false && \
    npm cache clean --force && \
    rm -Rf /root/.npm/

# TODO: Use tini/tyni
COPY <<-"EOF" /usr/local/bin/spraxapi-entrypoint.sh
#!/bin/sh
set -e

if [ "${1:-}" = "spraxapi-web" ]; then
  spraxApiMode="web"
  shift
elif [ "${1:-}" = "spraxapi-queue-worker" ]; then
  spraxApiMode="queue-worker"
  shift
elif [ "${1:-}" = "spraxapi-cli" ]; then
  spraxApiMode="cli"
  shift
fi

if [ "${spraxApiMode:-}" != "" ]; then
  xvfb-run --server-args '-ac -screen 0 1280x1024x24' node --enable-source-maps --import ./dist/sentry-init.js dist/main.js "$spraxApiMode" "$@"
  exit $?
fi

exec "$@"
EOF
RUN chmod +x /usr/local/bin/spraxapi-entrypoint.sh
ENTRYPOINT ["/usr/local/bin/spraxapi-entrypoint.sh"]

RUN mkdir /app/ && \
    chown --recursive node:node /app/
WORKDIR /app/


FROM base AS builder

RUN export DEBIAN_FRONTEND=noninteractive && \
    apt-get update && \
    apt-get install -y \
    build-essential \
    python3 \
    python-is-python3

USER node

COPY --chown=node:node LICENSE README.md ./
COPY --chown=node:node package.json package-lock.json tsconfig.json ./

RUN npm clean-install
COPY --chown=node:node prisma/ prisma/
COPY --chown=node:node src/ src/

RUN npm run prisma:generate && \
    npm run build
RUN npm clean-install --omit dev


FROM base AS prod

ENV NODE_ENV=production
USER node

COPY --chown=node:node LICENSE README.md ./
COPY --chown=node:node package.json package-lock.json tsconfig.json ./
COPY --chown=node:node prisma/ prisma/
COPY --chown=node:node --from=builder /app/node_modules/ node_modules/
COPY --chown=node:node resources/ resources/
COPY --chown=node:node --from=builder /app/dist/ dist/

CMD ["spraxapi-web"]
