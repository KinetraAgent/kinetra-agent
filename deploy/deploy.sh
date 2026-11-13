#!/bin/sh
# Builds the site locally and uploads it, so the VPS never runs a build.
# usage: deploy/deploy.sh [robinhoodTestnet|robinhood]
set -eu
NETWORK="${1:-robinhoodTestnet}"
HOST="${KINETRA_HOST:-root@160.238.36.55}"
KEY="${KINETRA_SSH_KEY:-$HOME/.ssh/kinetra_vps}"

cd "$(dirname "$0")/.."
VITE_NETWORK="$NETWORK" pnpm --filter @kinetra/web build
rsync -az --delete -e "ssh -i $KEY" apps/web/dist/ "$HOST:/var/www/kinetra/"
echo "deployed $NETWORK site to $HOST"
