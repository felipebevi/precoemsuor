#!/usr/bin/env bash
# =============================================================
# deploy.sh — precoemsuor.9ideias.com.br
# Commit + push para o GitHub e atualiza o container no servidor "joy".
# Uso: ./deploy.sh "mensagem do commit"
# =============================================================
set -euo pipefail

COMMIT_MSG="${1:-deploy: atualiza app}"
REMOTE="joy"
REMOTE_DIR="/root/precoemsuor"
GITHUB_KEY="$HOME/.ssh/id_ed25519_precoja"
SITE="https://precoemsuor.com.br/"

echo "==== [1/3] Commit + push ===="
# O push abaixo publica a 'main'. Commitar em outra branch e rodar o deploy
# subiria a main ANTIGA sem avisar — o script diria "concluído" e o ar ficaria
# sem a sua mudança. Melhor barrar aqui.
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ "$BRANCH" != "main" ]; then
  echo "  ERRO: você está na branch '$BRANCH', mas o deploy publica a 'main'."
  echo "  Os commits desta branch NÃO iriam para o ar. Volte para a main antes."
  exit 1
fi

git add -A
if git diff --cached --quiet; then
  echo "  Nada novo para commitar."
else
  # sem '|| true': falha real de commit (hook, user.email faltando) deve abortar
  git commit -m "$COMMIT_MSG"
fi
GIT_SSH_COMMAND="ssh -i $GITHUB_KEY -o IdentitiesOnly=yes" git push git@github.com:felipebevi/precoemsuor.git main

echo "==== [2/3] Deploy no servidor $REMOTE ===="
# O token do GitHub só serve para o clone inicial. Buscar sempre significaria
# trafegar o token em todo deploy à toa — então só busca se o repo não existir.
if ssh "$REMOTE" "[ -d '$REMOTE_DIR/.git' ]"; then
  REPO_URL=""
else
  GITHUB_TOKEN="$(ssh "$REMOTE" "cat /root/.github_token 2>/dev/null || echo ''")"
  REPO_URL="https://felipebevi:${GITHUB_TOKEN}@github.com/felipebevi/precoemsuor.git"
fi

ssh "$REMOTE" bash <<ENDSSH
set -euo pipefail
REMOTE_DIR="$REMOTE_DIR"
if [ -d "\$REMOTE_DIR/.git" ]; then
  cd "\$REMOTE_DIR"
  # economias.json é um arquivo RASTREADO que o cron reescreve no lugar (o
  # compose o monta como volume), então o working tree do servidor vive sujo.
  # Sem isso, o dia em que um commit tocar esse arquivo o 'git pull' aborta
  # com "local changes would be overwritten" e o deploy morre no meio.
  # Descartar é seguro: as cotações são regeneradas logo abaixo.
  git checkout -- economias.json 2>/dev/null || true
  git pull origin main
else
  git clone "$REPO_URL" "\$REMOTE_DIR" && cd "\$REMOTE_DIR"
fi

# Clones antigos podem ter perdido o bit +x (foi o que quebrou o cron de
# cotações por 2 meses, silenciosamente). Garante antes de chamar.
chmod +x update-rates.sh deploy.sh 2>/dev/null || true

# Cotações frescas já no deploy — o cron só roda às 06:00.
bash update-rates.sh || echo "  aviso: não deu para atualizar as cotações agora (segue com as do repo)"

docker compose up --build -d
docker image prune -f
ENDSSH

echo "==== [3/3] Status ===="
ssh "$REMOTE" "docker ps --filter name=precoemsuor --format 'table {{.Names}}\t{{.Status}}'"
CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$SITE" || echo 000)"
if [ "$CODE" = "200" ]; then
  echo "Deploy concluído: $SITE (HTTP $CODE)"
else
  echo "ATENÇÃO: $SITE respondeu HTTP $CODE — confira antes de considerar publicado."
  exit 1
fi
