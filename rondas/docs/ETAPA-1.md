# Etapa 1 — Arquitetura, banco, autenticação e controle de acesso

## O que foi implementado

**Pacote compartilhado (`packages/shared`)**
- Perfis, status e claims (`roles.ts`).
- Matriz de permissões + escopo por empresa/contrato/posto + regras anti‑escalonamento (`permissions.ts`).
- Validação de entrada com zod: campos desconhecidos recusados, IDs restritos a `[A-Za-z0-9_-]`, e‑mail normalizado (`schemas.ts`).
- Modelo de dados de todas as etapas (`model.ts`).

**Backend (`apps/worker`, Cloudflare Worker)**
- Verificação do ID token do Firebase (assinatura RS256 via JWKS do Google, emissor, público, validade).
- Montagem do usuário a partir de `users/{uid}` + empresa; nega conta inativa, empresa inativa e claims divergentes.
- Perfis: administrador geral, administrador da empresa, supervisor/fiscal e **acesso do posto**
  (login + senha definidos pelo administrador da empresa, um por posto). Vigilantes não têm login nem
  cadastro: as rondas ficam registradas em nome do acesso do posto.
- Rotas:
  - `GET /v1/health`
  - `GET /v1/me` — perfil, permissões efetivas, perfis atribuíveis.
  - `PUT /v1/config/sistema` — nome do sistema (admin geral).
  - `POST /v1/users` — cadastro: conta no Auth + claims + perfil + auditoria + idempotência, com compensação se o commit falhar.
  - `PATCH /v1/users/:uid` — nome, perfil, função, vínculos, status (bloqueio desativa a conta e revoga sessões).
  - `POST /v1/users/:uid/senha` — nova senha do acesso do posto (encerra sessões; auditoria sem a senha).
- Auditoria gravada no **mesmo commit** da alteração (somente campos alterados, antes/depois, motivo).
- `Idempotency-Key` obrigatória em criações; repetição devolve a mesma resposta.
- Limite de corpo (32 KB), exigência de JSON, CORS por lista de origens, limite de taxa por usuário (best effort por isolate), erros padronizados com `requestId`.
- Guarda contra uso dos emuladores (tokens sem assinatura) fora de `ENVIRONMENT=development`.

**Regras do Firestore (`firestore.rules`)**
- Nenhuma escrita de cliente. Leituras isoladas por empresa e por posto/contrato. Claims conferidas contra `users/{uid}`. Coleções internas (`checkpointSecrets`, `idempotency`, `usage`) inacessíveis.

**Frontend (`apps/web`, React + TypeScript + PWA)**
- Telas: Login (login do posto ou e-mail), Recuperação de senha, Painel (por perfil), Acessos (lista paginada; criação de acesso do posto com login sugerido a partir do nome do posto; nova senha; bloqueio/reativação), Auditoria (admin geral), Configurações do sistema (nome).
- Nome do sistema configurável (com cache local para abrir offline).
- Indicador online/offline e aviso de que alterações não são enviadas sem conexão.
- Menu mostra só telas implementadas e permitidas; guarda de rota (conveniência — segurança está no backend).
- Renovação automática do token quando o backend responde `CLAIMS_DESATUALIZADAS`.
- PWA instalável (manifesto, ícones, service worker com atualização sob confirmação).

**Scripts**
- `scripts/bootstrap-admin.mjs` — primeiro administrador geral em projeto real.
- `scripts/seed-emulator.mjs` — dados fictícios (marcados `demo: true` / "(DEMO)") no emulador.
- `scripts/remove-demo.mjs` — remove todos os dados de demonstração.

## Testes executados

| Suíte | Comando | Resultado |
|---|---|---|
| Permissões e validação (unitário) | `npm test` (packages/shared) | 24 testes ✔ |
| API do Worker com dublês (unitário) | `npm test` (apps/worker) | 45 testes ✔ |
| Regras do Firestore no emulador | `npm run test:rules` | 18 testes ✔ (verificado por mutação: enfraquecer as regras faz os testes falharem) |
| Worker real × emuladores Auth + Firestore | `npm run test:integration` | 6 testes ✔ |
| Navegador (Playwright, 390×844) contra Worker local + emuladores | manual, roteiro abaixo | ✔ |

Cobertura dos testes obrigatórios da seção 22 que pertencem a esta etapa:

- **Isolamento entre empresas** — regras (IDs de outra empresa, consultas sem filtro, `cid` forjado) e Worker (cadastro/edição em outra empresa, vínculo com posto alheio, usuário de outra empresa responde 404).
- **Acesso por perfil** — matriz de permissões, rotas proibidas para supervisor e acesso do posto, escopo de posto/contrato nas regras.
- **Permissões administrativas** — admin da empresa não cria/edita administradores, ninguém altera o próprio perfil/status, clientes não escrevem nada.
- **Recuperação de senha** — e-mail: fluxo completo no emulador (código, redefinição, novo login). Acesso do posto: redefinição pelo administrador; a senha antiga deixa de funcionar e as sessões são encerradas.
- **Duplicação de requisições** — mesma `Idempotency-Key` não cria segundo usuário nem segunda auditoria.
- **Falha e retomada de conexão** — interface indica offline; operação não é enviada nem dada como concluída.

Os demais testes da seção 22 (QR, GPS, rondas, fotos, relatórios, limites) pertencem às etapas 3–8.

## Roteiro de teste manual (local)

```bash
cd rondas
npm install
cp apps/worker/.dev.vars.example apps/worker/.dev.vars
cp apps/web/.env.example apps/web/.env.local   # e descomente o bloco de emuladores

npm run emulators            # terminal 1 (requer Java 11+)
npm run seed:emulator        # terminal 2, uma vez
npm run dev:worker           # terminal 2 → http://127.0.0.1:8787
npm run dev:web              # terminal 3 → http://localhost:5173
```

Usuários de demonstração (senha `demo-123456`): `admin@demo.local`, `empresa@demo.local`,
`supervisor@demo.local`, `outra@demo.local` e os acessos de posto `portaria-demo` e `garagem-demo`
(digite só o login).

1. Entre com senha errada → "E-mail ou senha incorretos."
2. Entre como `admin@demo.local` → painel com Usuários, Auditoria e Sistema.
3. Sistema → altere o nome → título e tela de login mudam; Auditoria registra `sistema.configurar`.
4. Saia e entre como `empresa@demo.local` (administrador da empresa cliente) → Acessos → **+ Novo acesso** → tipo "Acesso do posto" → escolha o posto (nome e login são sugeridos) → defina a senha → "Acesso criado".
5. No card de `garagem-demo` → **Nova senha** → salve. A senha antiga deixa de funcionar.
6. Bloqueie um acesso → status "bloqueado"; Auditoria (como admin geral) registra `usuario.status.bloqueado` com o motivo.
7. Saia e entre digitando só `portaria-demo` e a senha → painel do posto; acessar `/usuarios` volta ao painel.
8. O admin da empresa só vê acessos da própria empresa e só pode criar "Supervisor / fiscal" e "Acesso do posto".
9. Desligue a rede (DevTools → Offline) → faixa "Sem conexão".

## Limitações conhecidas (registradas, não escondidas)

- **Verificação de token em produção** (JWKS do Google) e **token OAuth da conta de serviço** só podem ser testados com um projeto Firebase real; nos testes automáticos foram exercitados o verificador do emulador e os clientes REST contra os emuladores.
- Limite de taxa é por isolate do Worker (não global). Limite global: Etapa 8 (binding de Rate Limiting).
- O e‑mail de "definir senha" usa o modelo padrão de redefinição do Firebase; personalize o texto em Authentication → Modelos.
- O acesso do posto usa e-mail sintético `login@postos.invalid`. O emulador do Auth aceita esse formato (testado); confirme no primeiro acesso em produção. Se o Firebase recusar, basta trocar `POSTO_LOGIN_DOMAIN` por um subdomínio seu sem caixa de e-mail.
- Login é único em todo o sistema (entre todas as empresas). Se dois clientes quiserem `portaria`, o segundo recebe "login já em uso". Sugestão: prefixar com a sigla da empresa.
- Bundle do frontend ~300 KB gzip (SDK do Firebase); otimização (code splitting) na Etapa 8.
- `idempotency/*` tem `expiresAt`; configure a política de TTL do Firestore nesse campo (ou a limpeza da Etapa 8).
