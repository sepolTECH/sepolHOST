#!/usr/bin/env bash
# Atualiza o Sepol Host na VPS: puxa o código, sobe API + banco e publica o front para o Nginx.
#   ./deploy/deploy.sh            (usuário comum, SEM sudo: precisa estar no grupo "docker" e ser dono de /var/www/sepol-host)
# Variáveis opcionais: WEBROOT=/var/www/sepol-host
set -euo pipefail
cd "$(dirname "$0")/.."

# Tudo dentro de uma função: o "git pull" pode alterar este próprio arquivo durante a execução.
main() {
  local WEBROOT="${WEBROOT:-/var/www/sepol-host}"
  local COMPOSE="docker compose -f docker-compose.prod.yml"

  echo "==> 1/4 Atualizando o código (git pull)"
  git pull --ff-only

  echo "==> 2/4 Subindo banco + API (migrations rodam sozinhas)"
  $COMPOSE up -d --build --remove-orphans

  echo "==> 3/4 Compilando o front (dentro do Docker, sem instalar Node na VPS)"
  if [ ! -d "$WEBROOT" ] || [ ! -w "$WEBROOT" ]; then
    echo "✖ $WEBROOT não existe ou não é gravável por $(whoami)." >&2
    echo "  Rode uma vez: sudo mkdir -p $WEBROOT && sudo chown -R $(whoami): $WEBROOT" >&2
    return 1
  fi
  docker build --target build -t sepol-host-front-build ./host-front
  local CID TMP
  CID="$(docker create sepol-host-front-build)"
  TMP="$(mktemp -d)"
  docker cp "$CID:/app/dist/." "$TMP/"
  docker rm "$CID" >/dev/null

  echo "==> 4/4 Publicando em $WEBROOT"
  find "$WEBROOT" -mindepth 1 -delete
  cp -a "$TMP"/. "$WEBROOT"/
  rm -rf "$TMP"
  chmod -R a+rX "$WEBROOT"

  echo "==> Verificando a API"
  for i in $(seq 1 20); do
    if curl -fsS http://127.0.0.1:3333/api/health >/dev/null 2>&1; then
      curl -s http://127.0.0.1:3333/api/health; echo
      echo "✔ Deploy concluído."
      return 0
    fi
    sleep 2
  done
  echo "✖ A API não respondeu em 40 s. Veja: $COMPOSE logs --tail=100 api" >&2
  return 1
}

main "$@"
