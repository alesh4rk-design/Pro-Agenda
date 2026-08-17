# Proxy de IA (Cloudflare Workers) — gratuito, sem cartão de crédito

Esse Worker guarda sua chave do Gemini em segredo, longe do navegador de quem
usa o sistema. Todos que logarem no app usam a IA através dele.

## Passo a passo (uns 5 minutos, tudo pelo navegador)

1. Acesse **dash.cloudflare.com** e crie uma conta gratuita (só e-mail e senha, sem cartão).
2. No menu lateral, vá em **Workers e Pages** → **Create** → **Create Worker**.
3. Dê um nome (ex: `central-inspetor-ia`) → **Deploy** (ele já sobe um "Hello World").
4. Clique em **Edit code** (ou "Quick edit") para abrir o editor online.
5. Apague todo o conteúdo e cole o conteúdo do arquivo `worker.js` desta pasta.
6. Clique em **Deploy** / **Save and deploy**.
7. Volte para a página do Worker → aba **Settings** → **Variables and Secrets**:
   - Adicione uma variável **Secret** chamada `GEMINI_API_KEY` com o valor da sua chave gratuita do Gemini (a mesma de aistudio.google.com/apikey).
   - Adicione uma variável de texto (Plaintext) chamada `FIREBASE_WEB_API_KEY` com o valor do campo `apiKey` que está em `js/firebase.js` do sistema (não é secreta, é a mesma que já aparece no app).
   - Salve.
8. Copie a URL do Worker que aparece no topo da página (algo como `https://central-inspetor-ia.SEU-USUARIO.workers.dev`).
9. Cole essa URL em `js/ia-config.js`, na constante `IA_WORKER_URL`.
10. Publique essa alteração (commit/push) — pode me passar a URL que eu aplico e envio para você.

Pronto: o botão "✨ Melhorar com IA" no sistema passa a funcionar para qualquer
conta que logar, sem que ninguém veja a chave do Gemini em lugar nenhum.

## Por que isso é mais seguro

O app roda inteiramente no navegador (sem servidor próprio), então qualquer
valor que o JavaScript do app precise usar diretamente (uma chave de API, por
exemplo) pode ser inspecionado por quem souber abrir as ferramentas de
desenvolvedor do navegador. O Worker resolve isso: ele fica entre o app e o
Gemini, guarda a chave do lado de fora do navegador, e só aceita pedidos de
quem estiver de fato logado no sistema (valida o token do Firebase antes de
cada chamada).
