#!/bin/sh
# One-time server setup. Run as root on the VPS: sh setup-vps.sh you@example.com
set -eu
EMAIL="$1"

apt-get update
apt-get install -y nginx certbot python3-certbot-nginx rsync ufw
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

mkdir -p /var/www/kinetra
cp /tmp/kinetra-nginx.conf /etc/nginx/sites-available/kinetra
ln -sf /etc/nginx/sites-available/kinetra /etc/nginx/sites-enabled/kinetra
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

certbot --nginx --non-interactive --agree-tos --redirect -m "$EMAIL" -d kinetraagent.tech -d www.kinetraagent.tech
