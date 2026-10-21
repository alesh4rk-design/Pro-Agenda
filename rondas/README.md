# Rondas Patrimoniais

Sistema de gestão de rondas patrimoniais para empresas de segurança privada.
PWA (React + TypeScript) em Cloudflare Pages, API em Cloudflare Workers,
autenticação no Firebase Authentication, dados no Cloud Firestore e fotos no Cloudflare R2.

> Projeto independente do app "Central do Inspetor" na raiz deste repositório.

- Arquitetura, coleções, permissões, fluxo de autenticação, modelo de dados e plano: [docs/ARQUITETURA.md](docs/ARQUITETURA.md)
- O que a Etapa 1 entrega e como foi testada: [docs/ETAPA-1.md](docs/ETAPA-1.md)

## Estrutura

```
rondas/
├── packages/shared/   tipos, permissões (RBAC + escopo), validação — usado por web e worker
├── apps/worker/       API (Cloudflare Worker): auth, usuários, auditoria, idempotência
├── apps/web/          PWA React (Vite)
├── tests/rules/       testes das regras do Firestore (emulador)
├── scripts/           bootstrap do admin geral, dados de demonstração, remoção da demo
├── firestore.rules    regras de segurança
└── firestore.indexes.json
```

## Como os acessos funcionam

O administrador geral cadastra as empresas clientes. O **administrador de cada empresa** cria
**um acesso por posto** (login + senha) e o entrega à equipe do posto. Vigilantes não têm login nem
cadastro: as rondas ficam registradas em nome do posto. Supervisores e fiscais podem ter acesso por e-mail.
Detalhes em [docs/ARQUITETURA.md](docs/ARQUITETURA.md#0-modelo-de-uso-e-de-acessos).

## Requisitos

- Node.js 20+ (testado com 22)
- Java 11+ (somente para os emuladores do Firebase)

## Rodar localmente (sem contas, com emuladores)

```bash
npm install
cp apps/worker/.dev.vars.example apps/worker/.dev.vars
cp apps/web/.env.example apps/web/.env.local     # descomente o bloco "emuladores"

npm run emulators          # terminal 1
npm run seed:emulator      # terminal 2 (uma vez; dados fictícios)
npm run dev:worker         # terminal 2
npm run dev:web            # terminal 3 → http://localhost:5173
```

Usuários de demonstração: ver [docs/ETAPA-1.md](docs/ETAPA-1.md). Para apagar a demo: `node scripts/remove-demo.mjs`.

## Testes

```bash
npm test                   # unitários (shared + worker)
npm run typecheck
npm run test:rules         # regras do Firestore (sobe o emulador)
npm run test:integration   # Worker real contra emuladores de Auth e Firestore
```

## Variáveis de ambiente

**Frontend** (`apps/web/.env.local`; em produção, variáveis do projeto no Cloudflare Pages)

| Variável | Descrição |
|---|---|
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID` | Config do app Web do Firebase (não são segredos) |
| `VITE_API_URL` | URL do Worker, sem barra final |
| `VITE_USE_EMULATORS` | `true` apenas em desenvolvimento |

**Worker** (`wrangler.toml` → `[vars]`; segredos com `wrangler secret put`)

| Variável | Tipo | Descrição |
|---|---|---|
| `ENVIRONMENT` | var | `production` ou `development` |
| `FIREBASE_PROJECT_ID` | var | ID do projeto Firebase |
| `ALLOWED_ORIGINS` | var | Origens do PWA, separadas por vírgula |
| `GOOGLE_CLIENT_EMAIL` | **secret** | E-mail da conta de serviço |
| `GOOGLE_PRIVATE_KEY` | **secret** | Chave privada PEM da conta de serviço |
| `FIRESTORE_EMULATOR_HOST`, `FIREBASE_AUTH_EMULATOR_HOST` | dev | Somente com `ENVIRONMENT=development` (recusados em produção) |

## Publicar (produção)

1. **Firebase** (plano Spark gratuito):
   1. Crie o projeto em console.firebase.google.com.
   2. Authentication → Método de login → ative **E-mail/senha**. Em Modelos, ajuste o idioma para português.
   3. Firestore Database → criar (modo produção, região `southamerica-east1` recomendada).
   4. Configurações do projeto → Seus apps → app **Web** → copie a config para as variáveis `VITE_FIREBASE_*`.
   5. Configurações → Contas de serviço → **Gerar nova chave privada** (arquivo JSON; guarde fora do repositório).
   6. Publique regras e índices:
      ```bash
      cp .firebaserc.example .firebaserc   # informe o ID do projeto
      npx firebase login
      npx firebase deploy --only firestore:rules,firestore:indexes
      ```
   7. (Recomendado) Firestore → TTL: política no campo `expiresAt` da coleção `idempotency`.
2. **Worker**:
   ```bash
   cd apps/worker
   # edite wrangler.toml: FIREBASE_PROJECT_ID e ALLOWED_ORIGINS
   npx wrangler login
   npx wrangler secret put GOOGLE_CLIENT_EMAIL     # client_email do JSON
   npx wrangler secret put GOOGLE_PRIVATE_KEY      # private_key do JSON (com as quebras \n)
   npx wrangler deploy
   ```
3. **Frontend (Cloudflare Pages)**: conecte o repositório, diretório raiz `rondas`,
   comando de build `npm run build`, diretório de saída `apps/web/dist`, e defina as variáveis `VITE_*`.
   Adicione a URL do Pages em `ALLOWED_ORIGINS` e em Firebase Authentication → Domínios autorizados.
4. **Primeiro administrador geral** (uma única vez, na sua máquina):
   ```bash
   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
   node scripts/bootstrap-admin.mjs --project SEU-PROJETO --email voce@empresa.com --nome "Seu Nome"
   ```
   Abra o link impresso para definir a senha e entre no app.
5. **Instalar no Android**: abra a URL no Chrome → menu → "Instalar app" / "Adicionar à tela inicial".

## Segurança — resumo

- Clientes **nunca** escrevem no Firestore; todas as alterações passam pelo Worker, que valida
  perfil, escopo e dados, e grava auditoria no mesmo commit.
- Regras isolam leituras por empresa e por posto; o perfil gravado (`users/{uid}`) prevalece sobre as claims.
- Nenhuma credencial privilegiada no frontend. A `apiKey` do Firebase Web é pública por design.
- Coleta mínima de dados pessoais (LGPD): nome, e-mail, telefone e matrícula opcionais; sem CPF.
