# Etapa 2 — Empresas, contratos e postos

## O que foi implementado

**Regras de negócio (backend, `apps/worker/src/routes/cadastros.ts`)**

| Rota | Quem pode | Observações |
|---|---|---|
| `POST /v1/companies` | admin geral | CNPJ opcional, validado (dígitos verificadores) e **único**; padrão: retenção de fotos de 7 dias e admin da empresa podendo gerir contratos e postos |
| `PATCH /v1/companies/:id` | admin geral | editar, **bloquear**, **desativar** e reativar; restringir o que o admin da empresa pode fazer |
| `POST /v1/contracts` | admin geral; admin da empresa (se a empresa permitir) | só na própria empresa; empresa precisa estar ativa; vigência com fim opcional (indeterminado) |
| `PATCH /v1/contracts/:id` | idem | editar, **suspender**, **encerrar**, reativar; vigência validada contra o que já está gravado |
| `POST /v1/posts` | admin geral; admin da empresa (se a empresa permitir) | a empresa é **herdada do contrato** (nunca enviada pelo aparelho); contrato encerrado não recebe postos |
| `PATCH /v1/posts/:id` | idem | editar, suspender, encerrar, reativar |

Comum a todas:
- **Nada é apagado.** Bloquear/desativar/suspender/encerrar preserva o histórico.
- Mudança para status não ativo **exige motivo**, que fica na auditoria.
- Empresa/contrato de um contrato ou posto **não pode ser trocado** (campos recusados pela validação).
- Recurso de outra empresa responde **404** (não revela que existe).
- Auditoria no mesmo commit, só com os campos alterados (antes/depois).
- Criações exigem `Idempotency-Key` (duplo toque não duplica).
- Bloquear uma empresa corta na hora o acesso de todos os usuários e postos dela (backend e regras já conferem o status da empresa a cada acesso).

**Posto**: nome, endereço, coordenadas (manual ou "usar minha localização" com a precisão informada),
fuso (padrão `America/Sao_Paulo`), dias de operação, horário de funcionamento (24 h ou início/fim,
inclusive atravessando a meia-noite), **regra de virada de dia** (data de início do turno ou data
civil), instruções para a equipe.

**Situação operacional** (`operationalState`, em `@rondas/shared`): combina empresa, contrato,
vigência e posto. A situação mais restritiva prevalece (empresa bloqueada → encerrado → suspenso → fora da
vigência → operando). Aparece nos cards de postos e será usada para decidir a geração de rondas (Etapa 4).

**Telas**: Empresas (admin geral), Contratos, Postos (com filtro por contrato), integração com
Acessos ("Criar administrador da empresa" logo após cadastrar a empresa). No celular, a barra
inferior mostra até 4 atalhos e o restante fica em **Mais**. Listas paginadas sob demanda (sem escuta
em tempo real, para economizar leituras).

## Testes

| Suíte | Resultado |
|---|---|
| Validações (CNPJ, vigência, datas inexistentes, fuso, coordenadas, horários, dias, situação operacional) | 13 novos, 37 no total ✔ |
| API: permissões, isolamento entre empresas, motivo obrigatório, CNPJ único, idempotência, empresa herdada do contrato, contrato encerrado, bloqueio cortando o acesso | 23 novos, 68 no total ✔ |
| Regras do Firestore: listas das telas (admin geral × admin da empresa × posto) | 3 novos, 21 no total ✔ |
| Integração Worker × emuladores: empresa → contrato → posto → edição → bloqueio, com auditoria | 1 novo, 7 no total ✔ |
| Navegador (390 px): cadastro completo, CNPJ inválido, vigência inválida, horário noturno, suspensão, bloqueio, auditoria, admin da empresa sem acesso a Empresas e sem ver posto de outra empresa ao trocar a URL; nenhuma tela transborda em 360 px | ✔ |

## Roteiro de teste manual

1. Entre como `admin@demo.local` → **Empresas** → **+ Nova empresa** → informe um CNPJ errado (recusado) e depois um válido → **Criar administrador da empresa** (abre Acessos já na empresa nova).
2. **Contratos** → **+ Novo contrato** → tente fim de vigência antes do início (bloqueado) → salve.
3. No contrato → **Postos** → **+ Novo posto** → desmarque Dom/Sáb, desmarque 24 horas, 18:00–08:00 (aviso de que atravessa a meia-noite) → salve. O card mostra "Operando · Segunda a sexta · 18:00–08:00".
4. **Suspender** o posto → pede motivo → status "Suspenso".
5. **Empresas** → **Bloquear** → pede motivo. Na **Auditoria** aparecem `empresa.criar`, `contrato.criar`, `posto.criar`, `posto.status.suspenso` e `empresa.status.bloqueada`.
6. Entre como `empresa@demo.local` → o menu não tem Empresas; abrir `/postos?empresa=<outra>` continua mostrando só os postos da própria empresa.

## Limitações conhecidas

- A unicidade do CNPJ é verificada por consulta antes de gravar; dois cadastros simultâneos do mesmo CNPJ
  poderiam passar (cenário improvável, já que só o admin geral cadastra empresas).
- Coordenadas são digitadas ou obtidas do aparelho; a escolha visual no mapa entra na Etapa 7 (mapa operacional).
- Contatos operacionais por posto (central, supervisor, Polícia Militar 190) entram com o módulo de ocorrências.
