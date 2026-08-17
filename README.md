# Central do Inspetor

Sistema web pessoal de organização profissional para Inspetor de Treinamento em segurança patrimonial. HTML/CSS/JS puros, PWA, Firebase (Auth + Firestore).

## Como configurar

1. Crie um projeto gratuito em https://console.firebase.google.com
2. Ative **Authentication > E-mail/senha**.
3. Crie um banco **Firestore Database** (modo produção).
4. Em *Configurações do projeto > Seus apps*, crie um app Web e copie o `firebaseConfig`.
5. Cole os valores em `js/firebase.js` (substitua `SUA_API_KEY`, `SEU_PROJETO`, etc.).
6. Publique as regras de segurança de `firestore.rules` no Firestore (aba **Regras**).
7. Ative a persistência offline (já habilitada no código via `enableIndexedDbPersistence`).

## Como publicar no GitHub Pages

1. Faça commit/push desta pasta (`inspetor-treinamento/`) para o repositório.
2. Em **Settings > Pages**, aponte para a branch e a pasta `/inspetor-treinamento` (ou mova o conteúdo para a raiz de um repositório dedicado).
3. Acesse a URL gerada, crie sua conta pela tela de login e comece a cadastrar seus próprios dados (contratos, agenda, treinamentos etc.). Nenhum dado de exemplo é criado automaticamente — o sistema começa vazio, pronto para uso real.
4. No celular, abra a URL no navegador e use "Adicionar à tela inicial" para instalar como app (PWA).

## Estrutura

```
index.html
css/        estilos por módulo
js/         firebase.js, auth.js, db.js (CRUD genérico), router.js, ui.js, editor.js
            app.js (bootstrap) + um arquivo por módulo (dashboard, agenda, contratos,
            visitas, anotacoes, treinamentos, documentos, pendencias, busca)
manifest.json / service-worker.js   PWA
firestore.rules                     regras de segurança (dados isolados por usuário)
```

## Modelo de dados (Firestore)

```
users/{uid}/contratos/{id}
users/{uid}/agenda/{id}
users/{uid}/anotacoes/{id}
users/{uid}/treinamentos/{id}
users/{uid}/documentos/{id}
users/{uid}/pendencias/{id}
users/{uid}/visitas/{id}
```

## V1 — o que já funciona

- Login/cadastro por e-mail e senha, dados isolados por usuário.
- Dashboard com resumo, atalhos rápidos e próximas atividades.
- Agenda (dia/semana/mês/lista) com tipos, status e prioridade.
- Contratos com abas: Informações, Postos, Visitas (linha do tempo), Pendências, Documentos, Treinamentos.
- Anotações com editor rico simples, categorias, tags, busca e copiar texto.
- Biblioteca de treinamentos com favoritos, edição, exclusão, cópia e **Modo Apresentação** (slides por tópico, letras grandes).
- Documentos por categoria (Análise de Segurança, Manuais, Pasta do Posto etc.).
- Pendências com status, prioridade, prazos e alertas de atraso.
- Busca global entre todos os módulos.
- Modo claro/escuro (escuro padrão), mobile-first, navegação inferior no celular, botão de ação rápida (+).
- PWA instalável com cache do app shell para consulta offline.

## ✨ Melhorar textos com IA (opcional, gratuito)

Os editores de **Treinamentos** e **Anotações** têm um botão "✨ Melhorar com IA" que envia o texto escrito para o Google Gemini e sugere uma versão revisada — você decide se usa ou não.

A chave do Gemini **não fica no app** (nem no Firestore, nem no navegador de quem usa): ela mora só dentro de um pequeno proxy gratuito no Cloudflare Workers, que valida se a pessoa está logada antes de gastar a cota da IA. Veja o passo a passo em [`cloudflare-worker/README.md`](cloudflare-worker/README.md).

Depois de publicar o Worker, cole a URL dele em `js/ia-config.js` (`IA_WORKER_URL`) — a partir daí, qualquer conta que logar no sistema já usa a IA normalmente, sem precisar configurar nada.

## Próximos passos sugeridos (V2)

- Exportação de documentos/treinamentos para PDF.
- Sincronização offline completa de escrita (fila de operações pendentes).
- Upload de fotos nas visitas (Firebase Storage).
