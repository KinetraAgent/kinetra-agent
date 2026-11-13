#!/bin/sh
# Builds the site locally and uploads it, so the VPS never runs a build.
# usage: deploy/deploy.sh [robinhoodTestnet|robinhood]
set -eu
NETWORK="${1:-robinhoodTestnet}"
HOST="${KINETRA_HOST:-root@160.238.36.55}"
SSH="ssh -i ${KINETRA_SSH_KEY:-$HOME/.ssh/kinetra_vps} -o IdentitiesOnly=yes"

cd "$(dirname "$0")/.."
VITE_NETWORK="$NETWORK" pnpm --filter @kinetra/web build
$SSH "$HOST" mkdir -p /opt/kinetra/site
rsync -az --delete -e "$SSH" apps/web/dist/ "$HOST:/opt/kinetra/site/"
rsync -az --inplace -e "$SSH" deploy/nginx.conf deploy/traefik.yaml deploy/setup-vps.sh "$HOST:/opt/kinetra/"
# config changes need a reload; static files are picked up as they land
$SSH "$HOST" 'docker exec kinetra-web nginx -s reload 2>/dev/null || sh /opt/kinetra/setup-vps.sh'
echo "deployed $NETWORK site to $HOST"
