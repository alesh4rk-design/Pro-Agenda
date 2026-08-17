// Melhoria de textos com IA, via proxy no Cloudflare Workers (cloudflare-worker/worker.js).
// A chave do Gemini fica só no Worker — nunca chega ao navegador de quem usa o sistema.
import { getTokenAtual } from "./auth.js";
import { IA_WORKER_URL } from "./ia-config.js";

export async function melhorarTexto(textoOriginal, instrucao = "") {
  if (!IA_WORKER_URL) {
    const erro = new Error("A IA ainda não foi configurada neste sistema (falta publicar o Worker e colar a URL em js/ia-config.js).");
    erro.semConfiguracao = true;
    throw erro;
  }
  if (!textoOriginal || !textoOriginal.trim()) {
    throw new Error("Escreva algum texto antes de pedir a melhoria.");
  }

  const idToken = await getTokenAtual();
  if (!idToken) throw new Error("Sua sessão expirou. Faça login novamente.");

  const resposta = await fetch(IA_WORKER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken, texto: textoOriginal, instrucao }),
  });

  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) {
    throw new Error(dados.error || "Não foi possível falar com a IA agora.");
  }
  if (!dados.texto || !dados.texto.trim()) {
    throw new Error("A IA não retornou nenhum texto.");
  }
  return dados.texto.trim();
}
