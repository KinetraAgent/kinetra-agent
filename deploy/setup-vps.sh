#!/bin/sh
# One-time setup on the shared VPS. Traefik (Coolify) already owns ports 80/443,
# so the site runs as a small nginx container behind it. Run as root on the VPS
# after deploy.sh has uploaded /opt/kinetra.
set -eu

mkdir -p /opt/kinetra/site /opt/kinetra/testnet
docker rm -f kinetra-web 2>/dev/null || true
docker run -d --name kinetra-web --restart unless-stopped \
  --memory 64m --cpus 0.5 \
  -p 172.16.0.1:3901:80 \
  -v /opt/kinetra/site:/usr/share/nginx/html:ro \
  -v /opt/kinetra/testnet:/usr/share/nginx/testnet:ro \
  -v /opt/kinetra/nginx.conf:/etc/nginx/conf.d/default.conf:ro \
  nginx:1.29-alpine

cp /opt/kinetra/traefik.yaml /data/coolify/proxy/dynamic/kinetra.yaml
