#!/bin/sh
# Builds the site locally and uploads it, so the VPS never runs a build.
# usage: deploy/deploy.sh [robinhoodTestnet|robinhood]
set -eu
NETWORK="${1:-robinhoodTestnet}"
HOST="${KINETRA_HOST:-root@160.238.36.55}"
# testnet.kinetraagent.tech serves /opt/kinetra/testnet, kinetraagent.tech serves /opt/kinetra/site
DIR=testnet
[ "$NETWORK" = robinhood ] && DIR=site
SSH="ssh -i ${KINETRA_SSH_KEY:-$HOME/.ssh/kinetra_vps} -o IdentitiesOnly=yes"

cd "$(dirname "$0")/.."
VITE_NETWORK="$NETWORK" pnpm --filter @kinetra/web build
$SSH "$HOST" mkdir -p "/opt/kinetra/$DIR"
rsync -az --delete -e "$SSH" apps/web/dist/ "$HOST:/opt/kinetra/$DIR/"
rsync -az --inplace -e "$SSH" deploy/nginx.conf deploy/traefik.yaml deploy/setup-vps.sh "$HOST:/opt/kinetra/"
# config changes need a reload; static files are picked up as they land
$SSH "$HOST" 'docker inspect -f "{{range .Mounts}}{{.Destination}} {{end}}" kinetra-web 2>/dev/null | grep -q nginx/testnet && docker exec kinetra-web nginx -s reload || sh /opt/kinetra/setup-vps.sh'
echo "deployed $NETWORK site to $HOST:/opt/kinetra/$DIR"
