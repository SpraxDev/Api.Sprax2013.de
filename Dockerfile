# syntax=docker/dockerfile:1
FROM node:12-buster as base

LABEL maintainer="Christian Koop <contact@sprax2013.de>"

RUN apt-get update && \
    apt-get upgrade -y && \
    apt-get install build-essential libxi-dev libglu1-mesa-dev libglew-dev pkg-config xvfb -y && \
    npm i -g npm --update-notifier false && \
    npm cache clean --force

RUN mkdir -p /app/storage/ /app/logs/ && \
    chown -R node:node /app/
WORKDIR /app/

USER node

COPY --chown=node:node LICENSE README.md ./
COPY --chown=node:node package.json package-lock.json ./


##
# Builder: Compiles the project into js files (optionally generates source maps too)
##
FROM base as builder

ARG BUILD_SCRIPT=build

RUN npm ci
COPY --chown=node:node tsconfig.json ./tsconfig.json
COPY --chown=node:node src/ ./src/
RUN npm run $BUILD_SCRIPT


##
# Development: Copies the resources, compiled js files and source maps and starts the application with source map support
##
FROM base as dev

# TODO: Check if volume mounts could be beneficial for development
RUN npm ci

COPY --chown=node:node --from=builder /app/build/ ./build/
COPY --chown=node:node resources/ ./resources/

CMD ["npm", "run", "start-headless"]


##
# Production: Copies the resources and compiled js files and starts the application
##
FROM base as prod

# TODO: This heavily relies on hostname being set and the default port 8080 being used
HEALTHCHECK --interval=1m --timeout=30s --retries=3 \
            CMD wget --spider $(hostname):8091

ENV NODE_ENV=production
RUN npm ci && \
    npm cache clean --force && \
    rm -Rf /home/node/.npm/

COPY --chown=node:node --from=builder /app/build/ ./build/
COPY --chown=node:node resources/ ./resources/

CMD ["npm", "run", "start-headless"]
