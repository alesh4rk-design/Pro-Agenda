# Arquitetura — Sistema de Rondas Patrimoniais

Documento da primeira entrega. Cobre: arquitetura, coleções do Firestore, modelo
de permissões, fluxo de autenticação, modelo de dados, estratégia de geração de
rondas e plano de implementação.

---

## 1. Arquitetura proposta

```
 Celular Android (PWA instalável)            Cloudflare                          Google / Firebase
┌──────────────────────────────┐      ┌───────────────────────────┐      ┌──────────────────────────┐
│ React + TypeScript (Vite)    │      │ Pages: arquivos estáticos │      │ Firebase Authentication  │
│ - login / sessão (Auth SDK)  │─────▶│                           │      │  (contas, senha, claims) │
│ - leituras do Firestore      │      │ Worker "rondas-api"       │─────▶│ Cloud Firestore          │
│   (somente leitura, regras)  │─────▶│ - verifica ID token       │      │  (dados + regras)        │
│ - fila offline (IndexedDB)*  │      │ - RBAC + escopo           │      └──────────────────────────┘
│ - câmera / QR / GPS*         │      │ - TODAS as escritas       │
└──────────────────────────────┘      │ - auditoria atômica       │      ┌──────────────────────────┐
                                      │ - cron: rondas, status,   │─────▶│ Cloudflare R2 (fotos)*   │
                                      │   alertas, retenção*      │      └──────────────────────────┘
                                      └───────────────────────────┘                   * etapas futuras
```

Decisões principais:

| Decisão | Motivo |
|---|---|
| **Cliente só lê; toda escrita passa pelo Worker** | Regras críticas (QR, horário do servidor, permissões, auditoria, idempotência) ficam em um único lugar confiável. As regras do Firestore negam qualquer escrita de cliente. |
| **Leitura direta do Firestore pelo cliente** | Evita uma invocação do Worker por tela (cota de 100 mil req/dia), permite cache offline e tempo real. Isolamento garantido pelas regras (testadas). |
| **Worker fala com Firestore/Auth via REST** | O Admin SDK do Firebase não roda no runtime dos Workers. A conta de serviço assina um JWT (RS256 via WebCrypto) e o token OAuth é reaproveitado em memória. |
| **`users/{uid}` é a fonte da verdade; claims são cache** | Bloqueio e troca de escopo valem imediatamente (regras e backend leem o documento). Claims divergentes do documento ⇒ acesso negado até renovar o token. |
| **Fotos no R2, não no Firebase Storage** | O Firebase Storage passou a exigir o plano Blaze para novos buckets; o R2 tem cota gratuita e não cobra tráfego de saída. |
| **Coleções de topo com `companyId/contractId/postId` desnormalizados** | Regras e consultas filtram por escopo sem leituras extras; o admin geral consulta entre empresas sem `collectionGroup`. |
| **Monorepo com pacote `@rondas/shared`** | Tipos, validação (zod) e a matriz de permissões são o MESMO código no Worker e no frontend. |

### Serviços e limites gratuitos (verificados em out/2026 — confirme antes de publicar)

| Serviço | Cota gratuita relevante | O que consome | Risco ao crescer |
|---|---|---|---|
| Cloud Firestore (Spark) | 50 mil leituras/dia, 20 mil escritas/dia, 20 mil exclusões/dia, 1 GiB | Cada leitura de QR = ~2–3 escritas (scan + ronda + auditoria); cada consulta autorizada pelas regras = +1–2 leituras (`users/{uid}`, `companies/{cid}`) | **Maior gargalo.** Ao exceder, o serviço é interrompido até o reset (Spark) ou cobrado (Blaze). |
| Cloudflare Workers (Free) | 100 mil req/dia, **10 ms de CPU por invocação**, cron triggers limitados por conta | Escritas, uploads, rotinas agendadas | CPU de 10 ms limita rotinas pesadas → processamento em lotes com cursor; plano pago (US$ 5/mês) sobe para 30 s. |
| Cloudflare R2 | 10 GB-mês, 1 mi operações classe A, 10 mi classe B, sem custo de saída | Fotos (~50–100 KB) | 10 GB ≈ 100–200 mil fotos retidas simultaneamente. Ativar o R2 pode exigir meio de pagamento cadastrado. |
| Cloudflare Pages | Builds mensais limitados, tráfego estático ilimitado | Publicação do PWA | Baixo. |
| Firebase Authentication | E-mail/senha sem custo no Spark (limites mudam se o projeto for migrado para Identity Platform) | Logins, e-mails de redefinição (com limite diário de envio) | Envio de e-mails em massa no cadastro inicial. |

**Estimativa honesta de capacidade no plano gratuito do Firestore** (cenário da simulação:
30 rondas/dia × 10 pontos por posto): ~300 leituras de QR/dia/posto ⇒ ~700–900 escritas/dia/posto
contando rondas, status e auditoria ⇒ **cerca de 20 postos** antes de esbarrar em 20 mil escritas/dia.
Acima disso, migrar o Firebase para o Blaze (pago por uso, centavos por 100 mil operações). A Etapa 8
implementa contadores de consumo (`usage/{data}`) e alertas ao atingir 70%/90% da cota.

---

## 2. Coleções do Firestore

| Coleção | Conteúdo | Quem lê (regras) | Quem escreve |
|---|---|---|---|
| `config/publico` | nome do sistema | qualquer um (tela de login) | Worker (admin geral) |
| `config/{outros}` | parâmetros globais | admin geral | Worker |
| `companies/{id}` | empresa, status, permissões do admin da empresa, retenção | admin geral; membros ativos da empresa | Worker |
| `contracts/{id}` | contrato (`companyId`) | admin geral; admin da empresa; supervisor vinculado ao contrato | Worker |
| `posts/{id}` | posto (`companyId`, `contractId`, fuso, regra de virada) | admin geral; admin da empresa; supervisor/vigilante vinculado | Worker |
| `users/{uid}` | perfil, escopo, status | o próprio; admin geral; admin da empresa; supervisor (só vigilantes) | Worker |
| `checkpoints/{id}` | ponto de ronda (sem o segredo do QR) | escopo do posto | Worker |
| `checkpointSecrets/{id}` | hash do token do QR | **ninguém** (só backend) | Worker |
| `checklists/{id}` + `/versions/{n}` | checklist e versões imutáveis | admins; escopo do posto | Worker |
| `schedules/{id}` + `/versions/{n}` | programação versionada por vigência | escopo do posto | Worker |
| `rounds/{postId_yyyyMMddHHmm}` | ronda prevista (ID determinístico) | escopo do posto | Worker (cron e execução) |
| `scans/{uuid}` | leitura de QR (UUID gerado no aparelho) | admins; supervisor do posto; vigilante: só as próprias | Worker |
| `photos/{id}` | metadados da foto (arquivo no R2) | admins; supervisor do posto; autor | Worker |
| `justifications/{id}` | justificativas (não apagam a falha) | escopo do posto | Worker |
| `incidents/{id}` | ocorrências | escopo do posto | Worker |
| `alerts/{id}` | alertas com chave de deduplicação | admins; supervisor do posto | Worker (cron) |
| `auditLogs/{id}` | auditoria imutável | admin geral | Worker (no mesmo commit da alteração) |
| `idempotency/{uid_key}` | respostas de requisições já processadas | ninguém | Worker |
| `usage/{data}` | contadores de consumo | admin geral | Worker |

Tipos completos: [`packages/shared/src/model.ts`](../packages/shared/src/model.ts).
Regras: [`firestore.rules`](../firestore.rules). Índices: [`firestore.indexes.json`](../firestore.indexes.json).

---

## 3. Modelo de permissões

Cada decisão combina **permissão do perfil** e **escopo do recurso**
([`packages/shared/src/permissions.ts`](../packages/shared/src/permissions.ts)):

```
can(actor, permissão, escopo?) = hasPermission(actor, permissão) && canAccessScope(actor, escopo)
```

**Escopo**

| Perfil | Acessa |
|---|---|
| admin_geral | todas as empresas |
| admin_empresa | somente a própria empresa (`cid`) |
| supervisor / fiscal | própria empresa **e** (posto em `postIds` **ou** contrato em `contractIds`) |
| vigilante | própria empresa **e** posto em `postIds` |

Conta com status ≠ `ativo` ou empresa ≠ `ativa` ⇒ nenhuma permissão.

**Permissões por perfil** (resumo)

| Permissão | geral | empresa | supervisor | vigilante |
|---|:-:|:-:|:-:|:-:|
| sistema.configurar, empresa.gerir, auditoria.ver, retencao.gerir | ✔ | | | |
| contrato.gerir, posto.gerir | ✔ | ✔ se a empresa permitir | | |
| usuario.gerir, ponto.gerir, checklist.gerir, programacao.gerir, contatos.gerir, alerta.configurar | ✔ | ✔ | | |
| ronda.acompanhar, ronda.justificar, relatorio.ver, mapa.ver, ocorrencia.gerir | ✔ | ✔ | ✔ | |
| inspecao.registrar | ✔ | | ✔ | |
| ronda.executar, ocorrencia.registrar, ronda.ver_proprias | ✔ | | | ✔ |

**Cadastro de usuários (sem escalonamento de privilégio)**: admin geral cria qualquer perfil;
admin da empresa cria apenas supervisor/fiscal e vigilante na própria empresa; ninguém altera o
próprio perfil/status; troca de empresa não é permitida (cria-se outro usuário, preservando o histórico).

**Três camadas de defesa**: (1) Worker valida tudo antes de escrever; (2) regras do Firestore
isolam leituras e negam escritas; (3) a interface esconde o que não se aplica — apenas conveniência.

---

## 4. Fluxo de autenticação

```
1. Admin cadastra usuário  ──▶ Worker: valida permissão/escopo ─▶ cria conta no Auth (sem senha)
                                 ─▶ define claims {role, cid} ─▶ commit atômico: users/{uid} + auditoria + idempotência
                                 (falhou o commit? apaga a conta criada — sem contas órfãs)
2. App envia e-mail "definir senha" (sendPasswordResetEmail) ──▶ usuário cria a própria senha
3. Login (Firebase Auth, e-mail/senha) ─▶ ID token (1 h) com claims
4. App chama GET /v1/me ─▶ Worker verifica assinatura (JWKS Google), emissor, público, validade
                         ─▶ lê users/{uid}: existe? ativo? claims == documento? empresa ativa?
                         ─▶ devolve perfil + permissões efetivas
5. Leituras do Firestore: regras checam claims E users/{uid} (status, role, companyId)
6. Bloqueio: Worker grava status ⇒ acesso negado imediatamente (regras e backend), desativa a conta
   no Auth (refresh falha) e revoga sessões.
7. Troca de perfil: novas claims; token antigo recebe CLAIMS_DESATUALIZADAS; o app renova o token
   (getIdToken(true)) e repete a chamada automaticamente.
8. Recuperação de senha: tela própria; não revela se o e-mail existe.
```

O primeiro administrador geral é criado por `scripts/bootstrap-admin.mjs`, executado localmente
com a conta de serviço — não existe rota pública de "auto-promoção".

---

## 5. Modelo de dados: empresas, contratos, postos, pontos e rondas previstas

Resumo (definições completas em `model.ts`):

- **Company**: nome, CNPJ (opcional), responsáveis, status (`ativa|bloqueada|desativada`),
  `permissoesAdmin {gerirContratos, gerirPostos}`, `retencaoFotosDias` (padrão 7).
- **Contract**: `companyId`, cliente, vigência, status (`ativo|suspenso|encerrado`), retenção própria opcional.
- **Post**: `companyId`, `contractId`, endereço, `geo`, `timezone` (padrão `America/Sao_Paulo`),
  dias de operação, horário de funcionamento, **`shiftDateRule`** (`inicio_turno` | `data_civil`).
- **Checkpoint**: escopo completo, código legível, `geo`, `raioMetros`, `geoPolicy`
  (`bloquear|excecao_justificada|analise`), obrigatoriedade, exige foto, checklist, `qrVersion`.
  O conteúdo do QR é um token aleatório de 128 bits; o banco guarda só o hash em
  `checkpointSecrets` (inacessível a clientes). Digitar o código legível **não** valida passagem.
- **ScheduleVersion**: modelo (A–D), dias, feriados/exceções, turnos com `quantidade`,
  `intervaloMin` e `distribuicao` **independentes**, janela (antecedência, tolerância, máximo),
  pontos obrigatórios, vigência. Versões nunca são editadas: uma alteração cria nova versão com
  `vigenciaInicio` futura.
- **PlannedRound**: ID determinístico `${postId}_${yyyyMMddHHmm UTC}`, data operacional, turno,
  `scheduledAt`, `windowStart/End`, pontos obrigatórios e validados, status, `justificada`
  (separado do status), início/conclusão reais, executor.

### Limitações registradas do QR estático

Um QR impresso pode ser fotografado e reutilizado longe do ponto. Mitigações previstas: leitura
apenas autenticada e individual, horário do servidor, GPS com raio e precisão registrados,
sequência/tempo mínimo entre pontos, detecção de leituras impossíveis (dois pontos distantes em
segundos), rotação de QR (`qrVersion`) e evolução futura para NFC ou QR dinâmico em display.

---

## 6. Estratégia de geração automática de rondas (Etapa 4)

1. **Gerador puro** (`@rondas/shared`, testável): recebe a versão da programação, o posto (fuso
   e regra de virada) e um intervalo de datas; devolve as rondas previstas. Não acessa banco.
2. **Validação antes de salvar** (mesma função, usada na prévia): detecta conflitos e **não gera
   horários inconsistentes** — devolve erros com alternativas explícitas.
3. **Cron no Worker** (ex.: a cada hora): para cada posto ativo, gera as rondas das próximas 48 h
   com `create` + precondição "não existe" ⇒ **idempotente** (rodar de novo não duplica; reiniciar
   não perde rondas, pois o horizonte é recalculado a cada execução). Processa em lotes com cursor
   para caber no limite de CPU.
4. **Cron de status** (a cada 5 min): `prevista → disponível` no início da janela; `atrasada` após
   horário + tolerância; ao fim da janela: `incompleta` (parcial) ou `não realizada` (nenhum ponto).
   Nunca marca "não realizada" com a janela aberta.
5. **Alterações futuras**: nova versão com vigência futura; rondas já geradas de datas passadas não
   mudam; rondas futuras ainda `prevista` da versão antiga são canceladas com auditoria.
6. **Fuso e meia-noite**: horários civis convertidos para UTC com o fuso do posto (API `Intl`);
   turno com `fim <= inicio` atravessa a meia-noite; a data operacional segue `shiftDateRule`.

### Simulação obrigatória (resultado esperado do validador)

Entrada: modelo turnos · diurno 6 rondas · noturno 24 rondas · diurno 08:00–18:00 · intervalo de
referência 60 min · segunda a sexta.

- **Período noturno não informado** ⇒ o sistema pede a definição (não presume). Se o administrador
  confirmar o complemento 18:00–08:00 (840 min):
- **Noturno — conflito**: 24 rondas a cada 60 min ocupam 23 h (1.380 min) > 14 h do turno.
  Cabem no máximo 14 rondas a cada 60 min (18:00…07:00); uma 15ª às 08:00 coincidiria com a
  primeira ronda diurna e é apontada como sobreposição. O sistema **bloqueia o salvamento** e
  oferece: (a) 14 rondas a cada 60 min; (b) 24 rondas distribuídas uniformemente (a cada 35 min,
  18:00…07:25); (c) horários manuais.
- **Diurno — escolha explícita**: 6 rondas a cada 60 min cabem (08:00–13:00), mas deixam 5 h sem
  ronda; distribuição uniforme daria a cada 100 min (08:00, 09:40, 11:20, 13:00, 14:40, 16:20). O
  administrador escolhe; nada é inferido em silêncio.
- **Segunda a sexta com turno que vira o dia**: com `inicio_turno`, o turno de sexta 18:00 vai até
  sábado 08:00 e pertence à sexta; segunda 00:00–08:00 **não tem rondas** (seria o turno de domingo).
  A prévia exibe esse aviso.

---

## 7. Plano de implementação

| Etapa | Entrega | Status |
|---|---|---|
| 1 | Arquitetura, modelo de dados, autenticação, RBAC, regras, auditoria, idempotência, PWA base, telas de login/recuperação/usuários/auditoria/configuração | **Concluída** — ver [ETAPA-1.md](ETAPA-1.md) |
| 2 | CRUD de empresas, contratos e postos (com bloqueio/desativação em cascata lógica) | Próxima |
| 3 | Pontos de ronda, QR (token + hash, impressão), checklists versionados | |
| 4 | Gerador de programação (modelos A–D), prévia com conflitos, cron idempotente, virada de dia | |
| 5 | App do vigilante: leitor de QR, GPS com política, checklist, fotos comprimidas → R2, fila offline | |
| 6 | Cron de status, atrasos, não execução, justificativas | |
| 7 | Relatórios (PDF/CSV), índice bruto/ajustado, mapa (Leaflet + OpenStreetMap) e calor, alertas | |
| 8 | Retenção automática de fotos, contadores de consumo, rate limit global, backup/exportação, testes de segurança | |
