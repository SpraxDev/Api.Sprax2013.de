#!/bin/sh
set -e

cd "$(dirname "$0")"
docker compose --project-name sprax-api stop
