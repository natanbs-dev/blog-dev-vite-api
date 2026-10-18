# blog-dev-vite-api

API de contas e comentários do [barbosa.md](https://github.com/natanbs-dev/blog-dev-vite): login, confirmação de e-mail, recuperação de senha, perfil e comentários nos artigos.

**Stack:** Node 24, TypeScript, Hono, Drizzle ORM, PostgreSQL, Zod, argon2id, Nodemailer.
**Custo:** zero. A API roda num notebook em casa, publicada pelo Tailscale Funnel; o blog fica no Cloudflare Pages e repassa `/api` para cá.

```
navegador ──> barbosa-md.pages.dev (Cloudflare Pages)
                 ├─ blog estático
                 └─ functions/api/[[path]].ts ── proxy ──> https://arch.<tailnet>.ts.net (Tailscale Funnel)
                                                              └─> API :8787 ─> Postgres (só localhost)
```

Blog e API no mesmo endereço: o cookie de sessão é de primeira parte e funciona em todos os navegadores.

## Rodar em desenvolvimento

```bash
cp .env.example .env              # gere o PROXY_SECRET: openssl rand -hex 32
docker compose up -d              # Postgres 18 + Mailpit
npm install
npm run db:migrate:dev
npm run dev                       # http://127.0.0.1:8787
```

- **E-mails:** não saem de verdade. Veja em http://localhost:8025 (Mailpit).
- **Blog:** no `blog-dev-vite`, crie `.env.local` com `API_PROXY_SECRET` igual ao `PROXY_SECRET` daqui e rode `npm run dev`. O Vite repassa `/api` com o segredo.
- **`SITE_URL`:** no `.env` tem de ser o endereço do Vite (ex.: `http://localhost:5173`). A API recusa escritas vindas de outra origem.
- **Sem `docker compose`:** no Arch, `sudo pacman -S docker-compose`. Ou suba os containers à mão:

  ```bash
  docker run -d --name barbosa-dev-db -e POSTGRES_USER=barbosa -e POSTGRES_PASSWORD=barbosa \
    -e POSTGRES_DB=barbosa -p 127.0.0.1:5432:5432 postgres:18-alpine
  docker run -d --name barbosa-dev-mail -p 127.0.0.1:1025:1025 -p 127.0.0.1:8025:8025 axllent/mailpit:v1.27
  ```

## Testes

```bash
npm test          # Vitest + Testcontainers: sobe um Postgres real descartável
npm run typecheck
npm run lint
```

Os testes de integração precisam do Docker rodando.

**Erro `docker-credential-desktop`:** o `~/.docker/config.json` aponta para o helper de credenciais do Docker Desktop, que não está instalado. Ou remova a linha `"credsStore": "desktop"`, ou rode com uma configuração vazia:

```bash
mkdir -p /tmp/dockercfg && echo '{}' > /tmp/dockercfg/config.json
DOCKER_CONFIG=/tmp/dockercfg npm test
```

## Rotas (todas sob `/api`)

| Método | Rota | O que faz |
|---|---|---|
| POST | `/auth/register` | Cria a conta, abre a sessão e manda o e-mail de confirmação |
| POST | `/auth/verify` | Confirma o e-mail (`{ token }`) |
| POST | `/auth/verify/resend` | Reenvia a confirmação |
| POST | `/auth/login` / `/auth/logout` | Abre e fecha a sessão |
| POST | `/auth/forgot` | Manda o link de nova senha; responde igual exista ou não a conta |
| POST | `/auth/reset` | Nova senha com o token; encerra todas as sessões |
| GET / PATCH / DELETE | `/me` | Ver, editar e excluir a própria conta (excluir pede a senha) |
| POST | `/me/password` | Troca a senha; encerra as outras sessões |
| GET | `/users/:username` | Perfil público e últimos comentários |
| GET | `/posts/:slug/comments?cursor=` | Comentários de um artigo, 20 por página |
| POST | `/posts/:slug/comments` | Comenta ou responde (`{ body, parentId? }`); exige e-mail confirmado |
| PATCH / DELETE | `/comments/:id` | Autor edita em até 15 min ou apaga; admin apaga |
| POST / DELETE | `/admin/users/:username/ban` | Admin bane (`{ deleteComments }`) ou desbane |
| GET | `/health` | Verificação de vida (testa o banco) |

**Erros:** sempre `{ error, message, fields? }`, com `fields` trazendo a mensagem de cada campo inválido.

## Segurança

| Tema | Como está |
|---|---|
| Senhas | Hash argon2id (parâmetros OWASP). O login responde igual para e-mail inexistente e senha errada, com o mesmo tempo de resposta. |
| Sessão | Token aleatório de 32 bytes num cookie `HttpOnly; Secure; SameSite=Lax; Path=/api`, válido por 30 dias. O banco guarda só o SHA-256 do token. Cada login gera um token novo. |
| CSRF | Toda escrita exige `Origin` igual ao `SITE_URL`. |
| Proxy | Sem o cabeçalho `X-Proxy-Secret` correto, a API responde 403. Quem achar a URL do `ts.net` não consegue usar a API direto. |
| Links de e-mail | Tokens de uso único, guardados como hash. Confirmação vale 24 h; nova senha, 30 min. Ficam depois do `#` da URL, então nem chegam aos logs do servidor. |
| Limites | Login: 5/min por IP e 10/h por e-mail. Cadastro: 3/h. Esqueci a senha: 3/h. Comentários: 10 a cada 10 min. Corpo da requisição: máx. 16 KB. |
| Comentários | Texto puro, até 2000 caracteres. O React escapa tudo na hora de mostrar. |
| LGPD | Excluir a conta apaga dados pessoais e sessões; os comentários ficam sem autor. |

## Produção no notebook Arch

### 1. Programas e banco

```bash
sudo pacman -S postgresql nodejs-lts-krypton npm tailscale rsync
sudo -iu postgres initdb -D /var/lib/postgres/data
sudo systemctl enable --now postgresql
sudo -iu postgres psql -c "create user barbosa password 'TROQUE_A_SENHA_DO_BANCO'"
sudo -iu postgres createdb -O barbosa barbosa
```

O Postgres do Arch já escuta só em `localhost`. Com 4 GB de RAM, os padrões bastam.

### 2. Usuário, pasta e configuração

```bash
sudo useradd --system --no-create-home --shell /usr/bin/nologin barbosa-api
sudo mkdir -p /opt/barbosa-api && sudo chown "$USER" /opt/barbosa-api
sudo install -m 600 -o root deploy/barbosa-api.env.example /etc/barbosa-api.env
sudo nano /etc/barbosa-api.env          # senha do banco, PROXY_SECRET, Brevo
```

### 3. Primeiro deploy

1. No notebook de desenvolvimento, rode `./deploy/deploy.sh arch`. Ele compila e envia os arquivos por `rsync`. Na primeira vez o restart falha, porque o serviço ainda não existe; é esperado.
2. No Arch:

   ```bash
   sudo cp /opt/barbosa-api/deploy/barbosa-api.service /etc/systemd/system/
   sudo systemctl daemon-reload && sudo systemctl enable --now barbosa-api
   curl -s -H "x-proxy-secret: <PROXY_SECRET>" localhost:8787/api/health   # {"ok":true}
   ```

Nos deploys seguintes basta `./deploy/deploy.sh`. As migrações rodam sozinhas a cada partida, pelo `ExecStartPre`.

Para ter um admin (que pode apagar comentários e banir), crie a conta pelo site e rode no Arch:

```bash
cd /opt/barbosa-api && sudo node --env-file=/etc/barbosa-api.env dist/scripts/promote.js seu@email.com
```

### 4. Publicar com Tailscale Funnel

1. `sudo systemctl enable --now tailscaled && sudo tailscale up`.
2. No painel da Tailscale, ative **HTTPS certificates** e o atributo **funnel** na política do tailnet.
3. `sudo tailscale funnel --bg 8787`. O comando mostra a URL pública, algo como `https://arch.tail1234.ts.net`.

### 5. Notebook sempre ligado

Em `/etc/systemd/logind.conf`, defina `HandleLidSwitch=ignore` e `HandleLidSwitchExternalPower=ignore`; depois `sudo systemctl restart systemd-logind`. Desative também a suspensão automática do ambiente gráfico, se houver.

### 6. Backup diário

```bash
sudo install -d -o postgres -m 700 /var/backups/barbosa
sudo cp /opt/barbosa-api/deploy/barbosa-backup.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now barbosa-backup.timer
```

O timer guarda 7 dias em `/var/backups/barbosa`. Para ter uma cópia fora do Arch, puxe para o notebook principal de vez em quando:

```bash
rsync -az arch:/var/backups/barbosa/ ~/backups/barbosa/
```

Para restaurar: `pg_restore -c -d barbosa arquivo.dump`.

### 7. E-mail (Brevo, grátis: 300/dia)

1. Crie a conta em brevo.com.
2. Em **Senders**, adicione e verifique o e-mail remetente.
3. Em **SMTP & API → SMTP**, copie o login e gere uma chave SMTP.
4. Coloque `SMTP_USER`, `SMTP_PASS` e `MAIL_FROM` em `/etc/barbosa-api.env` e rode `sudo systemctl restart barbosa-api`.

**Spam:** sem domínio próprio, os e-mails podem cair no spam. O texto das telas já avisa o leitor para conferir lá.

### 8. Cloudflare Pages (no repositório do blog)

1. Em dash.cloudflare.com → **Workers & Pages → Create → Pages → Connect to Git**, escolha o `blog-dev-vite`.
2. Build: `npm run build`. Saída: `dist`.
3. Em **Settings → Variables and Secrets**, defina:
   - `API_ORIGIN` = a URL do Funnel;
   - `PROXY_SECRET` = o mesmo valor do Arch, como Secret.
4. A pasta `functions/` do blog vira o proxy `/api/*` automaticamente.
5. **Nome do projeto:** se `barbosa-md` estiver ocupado, ajuste `url` em `src/lib/site.ts`, o `SITE_URL` do Arch e a página em `.github/pages-redirect/`.

Teste: `curl https://barbosa-md.pages.dev/api/health` deve responder `{"ok":true}`.

## Operação

| Tarefa | Comando |
|---|---|
| Logs ao vivo | `journalctl -u barbosa-api -f` |
| Estado e memória | `systemctl status barbosa-api` e `free -h` |
| Reiniciar | `sudo systemctl restart barbosa-api` |
| Funnel | `tailscale funnel status` |
