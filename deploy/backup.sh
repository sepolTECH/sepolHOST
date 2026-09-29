#!/usr/bin/env bash
# Backup do banco (pg_dump) + arquivos enviados (fotos/anexos). Mantém 14 dias.
#   ./deploy/backup.sh [pasta-destino]     (padrão: ./backups)
set -euo pipefail
cd "$(dirname "$0")/.."
DEST="${1:-./backups}"
mkdir -p "$DEST"
STAMP="$(date +%F_%H%M)"
COMPOSE="docker compose -f docker-compose.prod.yml"

$COMPOSE exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip > "$DEST/db_$STAMP.sql.gz"
docker run --rm -v sepol-host_uploads:/data:ro -v "$(cd "$DEST" && pwd)":/backup alpine \
  tar czf "/backup/uploads_$STAMP.tar.gz" -C /data .

find "$DEST" -type f \( -name 'db_*.sql.gz' -o -name 'uploads_*.tar.gz' \) -mtime +14 -delete
echo "✔ Backup salvo em $DEST ($STAMP)"
