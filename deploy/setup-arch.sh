#!/usr/bin/env bash
# Prepara o notebook Arch para rodar a API. Rode UMA vez, no Arch, como root:
#   sudo bash setup-arch.sh <usuario-que-faz-deploy>
# Pode rodar de novo sem estragar nada: cada passo pula o que já existe.
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo "rode com sudo"; exit 1; }
DEPLOYER="${1:-${SUDO_USER:-}}"
[[ -n "$DEPLOYER" ]] || { echo "informe o usuário que faz deploy"; exit 1; }
HERE="$(cd "$(dirname "$0")" && pwd)"
APP=/opt/barbosa-api
ENVF=/etc/barbosa-api.env

step() { printf '\n\033[1;33m› %s\033[0m\n' "$*"; }

step "pacotes"
pacman -S --needed --noconfirm postgresql nodejs-lts-krypton npm tailscale rsync

step "postgres"
if [[ ! -f /var/lib/postgres/data/PG_VERSION ]]; then
  sudo -iu postgres initdb -D /var/lib/postgres/data --locale=C.UTF-8 --encoding=UTF8 --auth-local=peer --auth-host=scram-sha-256
fi
systemctl enable --now postgresql
for _ in {1..20}; do sudo -iu postgres pg_isready -q && break; sleep 0.5; done

step "configuração ($ENVF)"
if [[ ! -f $ENVF ]]; then
  DBPASS="$(openssl rand -hex 24)"
  SECRET="$(openssl rand -hex 32)"
  install -m 600 -o root -g root /dev/null "$ENVF"
  cat > "$ENVF" <<EOF
NODE_ENV=production
HOST=127.0.0.1
PORT=8787
LOG_LEVEL=info
DATABASE_URL=postgres://barbosa:${DBPASS}@127.0.0.1:5432/barbosa
SITE_URL=https://blog-dev-vite.pages.dev
# o MESMO valor vai no Cloudflare Pages (secret PROXY_SECRET)
PROXY_SECRET=${SECRET}
# Brevo: Settings → SMTP & API → SMTP
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
# o remetente precisa estar verificado no Brevo (Senders)
MAIL_FROM="barbosa.md <troque@exemplo.com>"
EOF
  if ! sudo -iu postgres psql -tAc "select 1 from pg_roles where rolname='barbosa'" | grep -q 1; then
    sudo -iu postgres psql -qc "create role barbosa login password '${DBPASS}'"
  else
    sudo -iu postgres psql -qc "alter role barbosa password '${DBPASS}'"
  fi
else
  echo "já existe, mantido"
fi
sudo -iu postgres psql -tAc "select 1 from pg_database where datname='barbosa'" | grep -q 1 \
  || sudo -iu postgres createdb -O barbosa barbosa

step "usuário de sistema e pasta $APP"
id barbosa-api &>/dev/null || useradd --system --no-create-home --shell /usr/bin/nologin barbosa-api
install -d -o "$DEPLOYER" -g "$DEPLOYER" -m 755 "$APP"

step "serviços systemd"
install -m 644 "$HERE/barbosa-api.service" "$HERE/barbosa-backup.service" "$HERE/barbosa-backup.timer" /etc/systemd/system/
install -d -o postgres -g postgres -m 700 /var/backups/barbosa
systemctl daemon-reload
systemctl enable barbosa-api.service
systemctl enable --now barbosa-backup.timer tailscaled

step "sudo sem senha só para reiniciar a API (usado pelo deploy.sh)"
RULE=/etc/sudoers.d/barbosa-api
printf '%s ALL=(root) NOPASSWD: /usr/bin/systemctl restart barbosa-api, /usr/bin/systemctl restart barbosa-api.service\n' "$DEPLOYER" > "$RULE.tmp"
chmod 440 "$RULE.tmp"
visudo -cf "$RULE.tmp" >/dev/null && mv "$RULE.tmp" "$RULE"

step "não suspender ao fechar a tampa"
install -d /etc/systemd/logind.conf.d
printf '[Login]\nHandleLidSwitch=ignore\nHandleLidSwitchExternalPower=ignore\n' > /etc/systemd/logind.conf.d/barbosa.conf
echo "vale depois de reiniciar o notebook (ou: systemctl restart systemd-logind, que fecha a sessão gráfica)"

step "pronto"
echo "Node: $(node -v)   Postgres: $(sudo -iu postgres psql -tAc 'show server_version')"
echo "Faltam: deploy da API, 'sudo tailscale up' e 'sudo tailscale funnel --bg 8787'."
