# Sepol Host — Deploy na VPS com Nginx (passo a passo)

Cada cliente cria a própria conta (ou você cria para ele) e **só enxerga os próprios dados**: hóspedes, reservas,
finanças, calendário, lista negra, avaliações, fotos e anexos. O isolamento é feito no back-end (todas as consultas
filtram pelo usuário logado) e reforçado no banco (uma reserva não pode apontar para hóspede de outro cliente).

## Como fica a arquitetura

```
Internet ──443──▶ Nginx (instalado na VPS) ──┬─ /        → arquivos do site (/var/www/sepol-host)
                  HTTPS via Certbot          └─ /api/*   → 127.0.0.1:3333 ─▶ API (Docker) ─▶ PostgreSQL (Docker)
```

| Peça | O que é | Exposto na internet? |
| ---- | ------- | -------------------- |
| **Nginx** (na VPS, fora do Docker) | Serve o site, faz o HTTPS (Let's Encrypt/Certbot) e repassa `/api` para a API | Sim (portas 80 e 443) |
| `api` (Docker) | Node.js/Express — roda as migrations e cria o admin na subida | Não (só `127.0.0.1:3333`) |
| `db` (Docker) | PostgreSQL 16 | Não |

Os dados ficam em volumes do Docker (`pgdata` = banco, `uploads` = fotos e anexos). Os certificados ficam em
`/etc/letsencrypt`. Nada disso vai para o GitHub — por isso o backup (passo 10) é obrigatório.

O site (React/Vite) é compilado **dentro do Docker** pelo script `deploy/deploy.sh`; você não precisa instalar Node
na VPS.

---

## Antes de começar — o que você precisa

- Uma VPS com **Ubuntu 22.04/24.04 ou Debian 12**, com acesso SSH e pelo menos 1 GB de RAM (2 GB é mais confortável
  para compilar o site).
- Um **domínio** (ou subdomínio, ex.: `host.seudominio.com.br`) cujo DNS você consegue editar.
- O projeto no **GitHub**, já com as últimas alterações enviadas (`git push`).
- Uma conta em um serviço de **SMTP** (Brevo, Resend, Amazon SES, etc.) para o "Esqueci minha senha".

---

## Passo 1 — Apontar o domínio para a VPS

No painel de DNS do domínio, crie um registro:

| Tipo | Nome | Valor |
| ---- | ---- | ----- |
| A    | `host` (ou o subdomínio que quiser) | IP público da VPS |

(Se a VPS tiver IPv6 e você quiser usá-lo, crie também um registro `AAAA`.)

Confira se já propagou (no seu computador): `nslookup host.seudominio.com.br` — deve devolver o IP da VPS.
**Não avance antes disso:** o Certbot só emite o HTTPS quando o domínio já aponta para a VPS.

## Passo 2 — Preparar a VPS

Conecte por SSH (`ssh root@IP-DA-VPS`) e rode:

```bash
# Atualiza o sistema
apt update && apt upgrade -y

# Docker + Docker Compose
curl -fsSL https://get.docker.com | sh
docker --version && docker compose version

# Git, Nginx e Certbot (HTTPS)
apt install -y git nginx certbot python3-certbot-nginx

# Firewall: libera só SSH, HTTP e HTTPS (nunca abra 3333 nem 5432)
apt install -y ufw
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
ufw status

# Confirma que o Nginx subiu (abrir http://IP-DA-VPS no navegador mostra "Welcome to nginx")
systemctl enable --now nginx
systemctl status nginx --no-pager
```

> Se você usa um usuário comum em vez de `root`, adicione-o ao grupo do Docker: `usermod -aG docker SEU-USUARIO`
> (e entre de novo no SSH). Nos comandos abaixo, use `sudo` se necessário — o `deploy/deploy.sh` grava em
> `/var/www`, então rode-o com `sudo` também.

> **Se a VPS já tem outros sites no Nginx:** tudo bem, cada site fica no seu próprio arquivo em
> `sites-available` e o Nginx separa pelo `server_name`. Só **não** apague o `default` do passo 7 se algum outro site
> depender dele.

## Passo 3 — Dar acesso da VPS ao GitHub

**Se o repositório for público**, pule para o passo 4.

**Se for privado**, escolha uma das opções:

**Opção A — Deploy key (recomendada, só leitura, só esse repositório)**

```bash
# Na VPS: gera uma chave só para esse fim
ssh-keygen -t ed25519 -C "vps-sepol-host" -f ~/.ssh/sepol_deploy -N ""
cat ~/.ssh/sepol_deploy.pub
```

1. No GitHub: repositório → **Settings → Deploy keys → Add deploy key**.
2. Cole a chave pública impressa acima, dê um nome (ex.: `vps`) e **não** marque "Allow write access".
3. De volta à VPS, diga ao SSH para usar essa chave:

```bash
cat >> ~/.ssh/config <<'EOF'
Host github.com
  IdentityFile ~/.ssh/sepol_deploy
  IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config
ssh -T git@github.com     # responda "yes"; deve dizer "Hi ...! You've successfully authenticated"
```

**Opção B — Token de acesso (HTTPS)**

No GitHub: **Settings → Developer settings → Personal access tokens → Fine-grained tokens** → crie um token só para
esse repositório com permissão **Contents: Read-only**. Na hora do `git clone` (passo 4), use seu usuário e o token
como senha.

## Passo 4 — Baixar o projeto

```bash
git clone git@github.com:SEU-USUARIO/SEU-REPOSITORIO.git /opt/sepol-host
# (Opção B/HTTPS:  git clone https://github.com/SEU-USUARIO/SEU-REPOSITORIO.git /opt/sepol-host)
cd /opt/sepol-host
ls -a        # deve mostrar docker-compose.prod.yml, .env.production.example, host-back, host-front, deploy...
```

## Passo 5 — Configurar o `.env` (só existe na VPS)

```bash
cd /opt/sepol-host
cp .env.production.example .env
nano .env
```

Preencha **todos** os campos:

| Variável | O que colocar |
| -------- | ------------- |
| `DOMAIN` | O domínio do passo 1, **sem** `https://` (ex.: `host.seudominio.com.br`). A API usa para liberar o CORS e montar os links de e-mail |
| `POSTGRES_PASSWORD` | Uma senha longa e aleatória (`openssl rand -hex 24`) |
| `JWT_SECRET` | Gere com `openssl rand -hex 48` |
| `ALLOW_REGISTRATION` | `true` = qualquer pessoa cria conta no site; `false` = só você cria clientes (passo 11) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Seu login de administrador (senha com 8+ caracteres, letras e números) |
| `SMTP_*` | Dados do provedor de e-mail (veja abaixo) |

**SMTP** — exemplo (os valores exatos aparecem no painel do provedor):

```
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=false            # false para a porta 587; true para a 465
SMTP_USER=seu-usuario-smtp
SMTP_PASS=sua-chave-smtp
SMTP_FROM=Sepol Host <no-reply@seudominio.com.br>
```

No DNS do domínio do remetente, adicione também os registros **SPF, DKIM e DMARC** que o provedor indicar; sem eles
os e-mails de redefinição de senha tendem a cair no spam. Sem `SMTP_HOST`, o e-mail **não é enviado** (o link só
aparece no log da API).

Proteja o arquivo: `chmod 600 .env`. **Nunca** envie o `.env` para o GitHub (o `.gitignore` já o ignora).

## Passo 6 — Primeiro deploy: API, banco e site

O script faz tudo: sobe o banco e a API no Docker, compila o site e publica em `/var/www/sepol-host`.

```bash
cd /opt/sepol-host
chmod +x deploy/*.sh          # o Git no Windows costuma perder a permissão de execução
./deploy/deploy.sh
```

A primeira vez demora alguns minutos (baixa imagens e compila a API e o site). No final ele testa a API e deve
imprimir `{"status":"ok","database":"up"}` e `✔ Deploy concluído.` Para acompanhar ou investigar:

```bash
docker compose -f docker-compose.prod.yml ps                 # db e api devem estar "running"/"healthy"
docker compose -f docker-compose.prod.yml logs -f api        # espere: "Migrations em dia" e "API rodando"
ls /var/www/sepol-host                                        # deve ter index.html e a pasta assets/
```

(Ctrl+C sai dos logs sem parar nada.)

## Passo 7 — Configurar o Nginx

```bash
cd /opt/sepol-host

# 1) Copia o modelo e troca SEU-DOMINIO pelo seu domínio
cp deploy/nginx/sepol-host.conf /etc/nginx/sites-available/sepol-host
sed -i 's/SEU-DOMINIO/host.seudominio.com.br/' /etc/nginx/sites-available/sepol-host

# 2) Ativa o site e desativa a página padrão do Nginx
ln -s /etc/nginx/sites-available/sepol-host /etc/nginx/sites-enabled/sepol-host
rm -f /etc/nginx/sites-enabled/default

# 3) Testa a sintaxe e recarrega
nginx -t && systemctl reload nginx
```

O que o arquivo faz: serve o site em `/var/www/sepol-host`, repassa `/api/` para `127.0.0.1:3333` (com os
cabeçalhos `X-Forwarded-*` que a API usa para enxergar o IP real no limite de tentativas de login), faz cache longo
dos arquivos em `/assets/`, nunca cacheia o `index.html` e manda qualquer rota desconhecida para o `index.html`
(o site é uma SPA). Se você editar o arquivo, sempre rode `nginx -t` antes de `systemctl reload nginx`.

Teste pelo HTTP: `curl -i http://host.seudominio.com.br/api/health` → `{"status":"ok","database":"up"}`.

## Passo 8 — Ativar o HTTPS (Certbot)

```bash
certbot --nginx -d host.seudominio.com.br --redirect -m seu@email.com --agree-tos --no-eff-email
```

O Certbot emite o certificado, acrescenta o bloco HTTPS (porta 443) no arquivo do Nginx e redireciona o HTTP para
HTTPS. A renovação é automática (um timer do systemd renova antes de vencer). Confirme:

```bash
certbot renew --dry-run          # deve terminar com "Congratulations, all simulated renewals succeeded"
systemctl list-timers | grep certbot
```

> O HTTPS é obrigatório: o cookie de sessão da API só trafega em HTTPS (`COOKIE_SECURE=true`).

## Passo 9 — Testar

1. Abra `https://SEU-DOMINIO` — deve carregar a tela de login com o cadeado do HTTPS.
2. Entre com `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
3. Depois do primeiro login, edite o `.env` e apague o valor de `ADMIN_PASSWORD` (a senha só serve para criar o
   admin na primeira subida) e rode `docker compose -f docker-compose.prod.yml up -d` para aplicar.
4. Teste o "Esqueci minha senha" com um e-mail real e confira se chegou (olhe o spam também).
5. **Teste o isolamento:** crie duas contas de teste e confirme que uma não vê os dados da outra.
6. Confirme que a API e o banco **não** estão expostos: de outro computador (ou celular fora do Wi-Fi da VPS), `http://IP-DA-VPS:3333`
   e `IP-DA-VPS:5432` não devem abrir.

Verificação rápida da API: `curl https://SEU-DOMINIO/api/health` → `{"status":"ok","database":"up"}`.

## Passo 10 — Backup (faça no primeiro dia)

```bash
cd /opt/sepol-host
./deploy/backup.sh /opt/backups     # banco + fotos/anexos; guarda 14 dias
ls -lh /opt/backups
```

Agendar todo dia às 03:00:

```bash
( crontab -l 2>/dev/null; echo "0 3 * * * cd /opt/sepol-host && ./deploy/backup.sh /opt/backups >> /var/log/sepol-backup.log 2>&1" ) | crontab -
```

**Copie os backups para fora da VPS** (outro servidor, Google Drive, S3...). Backup só na mesma máquina não protege
contra perda do servidor.

**Restaurar o banco** (em um banco vazio):

```bash
cd /opt/sepol-host
gunzip -c /opt/backups/db_AAAA-MM-DD_HHMM.sql.gz | docker compose -f docker-compose.prod.yml exec -T db sh -c 'psql -U "$POSTGRES_USER" "$POSTGRES_DB"'
```

**Restaurar as fotos/anexos:**

```bash
docker run --rm -v sepol-host_uploads:/data -v /opt/backups:/backup alpine tar xzf /backup/uploads_AAAA-MM-DD_HHMM.tar.gz -C /data
```

## Passo 11 — Cadastrar clientes

- **Cadastro aberto** (`ALLOW_REGISTRATION=true`): o cliente acessa o site e cria a própria conta.
- **Você cria os clientes** (`ALLOW_REGISTRATION=false`): rode para cada cliente

```bash
cd /opt/sepol-host
docker compose -f docker-compose.prod.yml exec api node dist/db/createUser.js "Nome do Cliente" cliente@email.com "SenhaForte123"
```

Cada conta é totalmente independente: o mesmo CPF de hóspede ou o mesmo número de reserva pode existir em clientes
diferentes sem conflito. Para **desativar** um cliente (perde o acesso imediatamente), troque o e-mail no comando:

```bash
docker compose -f docker-compose.prod.yml exec db sh -c "psql -U \$POSTGRES_USER \$POSTGRES_DB -c \"UPDATE users SET is_active = false WHERE email = 'cliente@email.com'\""
```

Os "associados" (equipe de limpeza etc.) são criados pelo próprio cliente dentro do sistema, com e-mail e senha
gerados — não precisam de nenhum passo na VPS.

## Passo 12 — Atualizar o sistema depois

No seu computador: `git add -A && git commit -m "..." && git push`. Na VPS, **um comando**:

```bash
cd /opt/sepol-host
./deploy/deploy.sh
```

Ele faz `git pull`, reconstrói e reinicia a API (as migrations rodam sozinhas), recompila o site e publica a nova
versão de forma atômica — os dados (volumes), o `.env`, o certificado e a config do Nginx são preservados. **Faça um
backup antes de atualizações que mexam no banco.**

Só o site mudou? Também vale o `deploy.sh` (o Docker reaproveita o cache e a API nem reinicia). Só mudou o `.env`?
`docker compose -f docker-compose.prod.yml up -d`. Só mudou a config do Nginx? `nginx -t && systemctl reload nginx`.

Para voltar a uma versão anterior, faça o `git revert` do commit problemático **no seu computador**, dê `git push` e
rode `./deploy/deploy.sh` na VPS. (As migrations já aplicadas no banco não são desfeitas — por isso o backup antes.)

---

## Já subiu a versão antiga (com Caddy)? Migre assim

A versão anterior deste guia usava um container Caddy nas portas 80/443, o que **conflita** com o Nginx. Os dados
(banco e uploads) ficam nos volumes e não são afetados.

```bash
cd /opt/sepol-host
./deploy/backup.sh /opt/backups                                   # por garantia
docker compose -f docker-compose.prod.yml stop web                # libera as portas 80/443
git pull
docker compose -f docker-compose.prod.yml up -d --build --remove-orphans   # remove o container "web" antigo
chmod +x deploy/*.sh && ./deploy/deploy.sh
```

Depois siga os passos 2 (só a parte de instalar Nginx/Certbot e o UFW), 7 e 8. Como o `docker-compose.prod.yml`
novo não tem mais o `web`, o `git pull` pode reclamar do arquivo se você o tiver editado na VPS: `git stash` antes.

---

## Levando os dados que você já tem (banco local → VPS)

Se já existem dados no seu Postgres local, faça **antes** de criar outros clientes:

1. No computador, exporte o banco: `docker exec sepol-db pg_dump -U sepol sepol_host > dados.sql` (ajuste usuário e nome do banco se forem outros).
2. Suba a VPS normalmente (passos 1–6). Depois pare a API (`docker compose -f docker-compose.prod.yml stop api`), limpe o banco novo
   (`docker compose -f docker-compose.prod.yml exec db sh -c 'psql -U "$POSTGRES_USER" "$POSTGRES_DB" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"'`),
   importe o `dados.sql` (mesmo comando da restauração do passo 10) e suba a API de novo (`up -d`). As migrations pendentes rodam sozinhas.
3. A migration `016_multi_tenant_owner` atribui todos os dados existentes ao **administrador mais antigo** — o
   usuário que já existia nesse banco. Confirme que você consegue entrar com ele.
4. Copie as fotos/anexos da pasta de uploads do seu computador para o volume `uploads` (mesmo comando de restauração das fotos, com um `.tar.gz` dela).

---

## Problemas comuns

| Sintoma | Causa provável e solução |
| ------- | ------------------------ |
| Site não abre / Certbot falha | O DNS ainda não aponta para a VPS, ou as portas 80/443 estão bloqueadas (UFW ou firewall do provedor). Teste `curl -I http://SEU-DOMINIO`. |
| Aparece "Welcome to nginx" | O site `default` ainda está ativo ou o `server_name` está errado: `rm /etc/nginx/sites-enabled/default`, confira o domínio no arquivo e `nginx -t && systemctl reload nginx`. |
| `403 Forbidden` no site | O Nginx não lê `/var/www/sepol-host`: `chmod -R a+rX /var/www/sepol-host` e confira se há `index.html` lá (rode o `deploy.sh`). |
| `502 Bad Gateway` em `/api` | A API ainda está subindo ou caiu. `docker compose -f docker-compose.prod.yml logs --tail=100 api` e `curl http://127.0.0.1:3333/api/health`. |
| `nginx: [emerg] bind() to 0.0.0.0:80 failed` | Outro processo usa a porta 80 (o container `web` da versão antiga com Caddy, ou o Apache). Veja a seção de migração e `ss -tlnp \| grep ':80'`. |
| `413 Request Entity Too Large` | Upload maior que `client_max_body_size` (10 MB no modelo). Aumente no arquivo do Nginx e recarregue. |
| Página em branco ao recarregar uma rota (ex.: `/hospedes`) | Falta o `try_files $uri /index.html;` no `location /` (SPA). Use o modelo de `deploy/nginx/sepol-host.conf`. |
| Site antigo aparece após atualizar | Cache do navegador: Ctrl+F5. O `index.html` é servido sem cache; se persistir, confirme que o `deploy.sh` terminou sem erro. |
| `api` reinicia sozinha; log mostra "Configuração insegura para produção" | O `.env` ainda tem valor de exemplo (`JWT_SECRET`, `ADMIN_PASSWORD`). Corrija e rode `up -d`. |
| `api` mostra "Variáveis de ambiente inválidas" | Falta uma variável obrigatória ou ela está no formato errado; o log diz qual. |
| Login funciona mas volta para a tela de login | Acessando por `http://` em vez de `https://` (o cookie de sessão só trafega em HTTPS), ou `DOMAIN` no `.env` diferente do endereço usado (CORS). |
| Muitos "tentativas de login" para todo mundo | A API não está enxergando o IP real: confirme os `proxy_set_header X-Forwarded-*` no `location /api/` do Nginx. |
| "Esqueci minha senha" não envia e-mail | `SMTP_*` vazio ou incorreto; veja `logs api` (o erro de envio aparece lá). |
| `permission denied` no `backup.sh`/`deploy.sh` | `chmod +x deploy/*.sh` |
| `git pull` reclama de alterações locais | Não edite arquivos do projeto na VPS; se editou, `git stash` e depois `git pull`. |

Comandos úteis (os do Docker, dentro de `/opt/sepol-host`):

- `docker compose -f docker-compose.prod.yml ps` — status dos serviços
- `docker compose -f docker-compose.prod.yml logs --tail=100 api` — últimos logs da API
- `docker compose -f docker-compose.prod.yml restart api` — reinicia a API
- `docker compose -f docker-compose.prod.yml down` — para tudo **sem** apagar os dados (nunca use `down -v`: apaga os volumes)
- `nginx -t && systemctl reload nginx` — valida e aplica a config do Nginx
- `tail -f /var/log/nginx/error.log` e `/var/log/nginx/access.log` — logs do Nginx
- `certbot certificates` — validade do certificado

## Segurança — resumo

- Só as portas 22 (SSH), 80 e 443 ficam abertas; a API é publicada apenas em `127.0.0.1:3333` e o banco (5432) nunca
  é publicado. (O Docker ignora o UFW para portas publicadas em `0.0.0.0` — por isso o `127.0.0.1:` no compose.)
- HTTPS obrigatório, com renovação automática e cabeçalhos de segurança (HSTS, nosniff, frame DENY) no Nginx.
- Login limitado a 10 tentativas / 15 min por IP; cadastro a 5 / hora por IP.
- Fotos de documento e anexos só são entregues ao dono do registro.
- Mantenha o servidor atualizado (`apt update && apt upgrade`), o `.env` fora do Git e os backups fora da VPS.
- Considere desativar o login SSH por senha (usar só chave), criar um usuário comum em vez de usar `root` e instalar o
  `fail2ban` (`apt install -y fail2ban`) para bloquear tentativas de força bruta no SSH.
