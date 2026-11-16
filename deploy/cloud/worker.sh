#!/bin/sh
# Runs the KINETRA Cloud worker that serves kinetra-cloud's jobs, on the VPS.
# usage: deploy/cloud/worker.sh [robinhood|robinhoodTestnet]
# deploy/cloud/<network>.env comes from `pnpm --filter @kinetra/contracts cloud-agent:<net>`; add the model key there first.
set -eu
NETWORK="${1:-robinhood}"
HOST="${KINETRA_HOST:-root@160.238.36.55}"
SSH="ssh -i ${KINETRA_SSH_KEY:-$HOME/.ssh/kinetra_vps} -o IdentitiesOnly=yes"
SITE=https://testnet.kinetraagent.tech
[ "$NETWORK" = robinhood ] && SITE=https://kinetraagent.tech

cd "$(dirname "$0")"
ENV="$NETWORK.env"
[ -f "$ENV" ] || { echo "missing deploy/cloud/$ENV: run the cloud-agent script first" >&2; exit 1; }
grep -qE '^(ANTHROPIC|OPENAI|OPENROUTER|GEMINI|GROQ|DEEPSEEK|XAI)_API_KEY=.+' "$ENV" || { echo "add a model key to deploy/cloud/$ENV" >&2; exit 1; }
SERVE_ARGS="$(sed -n 's/^SERVE_ARGS=//p' "$ENV")"
NAME="kinetra-cloud-$NETWORK"

$SSH "$HOST" "mkdir -p /opt/kinetra/cloud && chmod 700 /opt/kinetra/cloud"
rsync -az -e "$SSH" Dockerfile "$HOST:/opt/kinetra/cloud/"
# holds the agent key: created owner-only (macOS rsync has no --chmod)
$SSH "$HOST" "umask 077 && cat > /opt/kinetra/cloud/$ENV" < "$ENV"
# rebuild picks up the newest notarized CLI; the default ask mode keeps edits and commands off for outside briefs
$SSH "$HOST" "docker build -q -t kinetra-cloud:$NETWORK --build-arg SITE=$SITE /opt/kinetra/cloud \
  && docker rm -f $NAME 2>/dev/null; docker run -d --name $NAME --restart unless-stopped --memory 512m --cpus 1 \
  --env-file /opt/kinetra/cloud/$ENV -v $NAME-home:/root/.kinetra -v $NAME-work:/work kinetra-cloud:$NETWORK kinetra serve $SERVE_ARGS \
  && docker image prune -f >/dev/null"
echo "worker $NAME running on $HOST; logs: $SSH $HOST docker logs -f $NAME"
