#!/usr/bin/env bash
# Atualiza o Sepol Host na VPS: puxa o código, sobe API + banco e publica o front para o Nginx.
#   ./deploy/deploy.sh            (rode como root, ou com um usuário que escreva em /var/www)
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
  docker build --target build -t sepol-host-front-build ./host-front
  local CID
  CID="$(docker create sepol-host-front-build)"
  rm -rf "${WEBROOT}.new" && mkdir -p "${WEBROOT}.new"
  docker cp "$CID:/app/dist/." "${WEBROOT}.new/"
  docker rm "$CID" >/dev/null

  echo "==> 4/4 Publicando em $WEBROOT"
  rm -rf "${WEBROOT}.old"
  if [ -d "$WEBROOT" ]; then mv "$WEBROOT" "${WEBROOT}.old"; fi
  mv "${WEBROOT}.new" "$WEBROOT"
  rm -rf "${WEBROOT}.old"
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
