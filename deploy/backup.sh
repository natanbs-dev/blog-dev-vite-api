#!/usr/bin/env bash
# Backup diário do banco (roda como usuário postgres pelo barbosa-backup.timer).
# Guarda 7 dias em /var/backups/barbosa.
set -euo pipefail
DIR=/var/backups/barbosa
mkdir -p "$DIR"
pg_dump -Fc barbosa > "$DIR/barbosa-$(date +%F).dump.tmp"
mv "$DIR/barbosa-$(date +%F).dump.tmp" "$DIR/barbosa-$(date +%F).dump"
find "$DIR" -name 'barbosa-*.dump' -mtime +7 -delete
