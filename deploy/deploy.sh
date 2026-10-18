#!/usr/bin/env bash
# Publica a API no notebook Arch. Rode no notebook de desenvolvimento:
#   ./deploy/deploy.sh            (máquina "arch" na Tailscale)
#   ./deploy/deploy.sh outro-nome
set -euo pipefail
HOST="${1:-arch}"
DIR=/opt/barbosa-api
cd "$(dirname "$0")/.."

echo "› typecheck e build"
npm run typecheck
npm run build

echo "› enviando para $HOST:$DIR"
rsync -az --delete dist drizzle deploy package.json package-lock.json "$HOST:$DIR/"

echo "› dependências de produção e reinício"
ssh "$HOST" "cd $DIR && npm ci --omit=dev --no-audit --no-fund && sudo systemctl restart barbosa-api && sleep 2 && systemctl is-active barbosa-api"
echo "› pronto. Logs: ssh $HOST journalctl -u barbosa-api -f"
