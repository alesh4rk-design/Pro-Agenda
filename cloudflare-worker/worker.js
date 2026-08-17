// Proxy da IA (Google Gemini) para o sistema Central do Inspetor.
// Roda no Cloudflare Workers (plano gratuito). A chave do Gemini fica guardada
// como "secret" aqui dentro — nunca chega ao navegador de quem usa o sistema.
//
// Requer duas variáveis configuradas no Worker (Settings > Variables and Secrets):
//   GEMINI_API_KEY        (secret)  — sua chave gratuita do Google AI Studio
//   FIREBASE_WEB_API_KEY  (texto)   — a mesma "apiKey" do firebaseConfig do app
//
// Só aceita chamadas de quem estiver de fato logado no sistema (valida o
// token do Firebase Authentication antes de gastar cota da IA).

const MODELO = "gemini-2.0-flash";

export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "POST") return responder({ error: "Método não permitido." }, 405, cors);

    let corpo;
    try {
      corpo = await request.json();
    } catch {
      return responder({ error: "Requisição inválida." }, 400, cors);
    }

    const { idToken, texto, instrucao } = corpo || {};
    if (!idToken) return responder({ error: "Não autenticado." }, 401, cors);
    if (!texto || !texto.trim()) return responder({ error: "Texto vazio." }, 400, cors);

    const autenticado = await validarLogin(idToken, env.FIREBASE_WEB_API_KEY);
    if (!autenticado) return responder({ error: "Sessão inválida. Faça login novamente." }, 401, cors);

    const prompt = montarPrompt(texto, instrucao);

    const respostaIA = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent?key=${env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.4 },
        }),
      }
    );

    if (!respostaIA.ok) {
      const msg = respostaIA.status === 429
        ? "Limite gratuito da IA atingido no momento. Tente novamente em instantes."
        : "Não foi possível falar com a IA agora.";
      return responder({ error: msg }, 502, cors);
    }

    const dados = await respostaIA.json();
    const melhorado = dados?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";
    if (!melhorado.trim()) return responder({ error: "A IA não retornou nenhum texto." }, 502, cors);

    return responder({ texto: melhorado.trim() }, 200, cors);
  },
};

async function validarLogin(idToken, firebaseWebApiKey) {
  try {
    const resposta = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseWebApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      }
    );
    return resposta.ok;
  } catch {
    return false;
  }
}

function montarPrompt(textoOriginal, instrucao) {
  return `Você é um assistente de um Inspetor de Treinamento de uma empresa de segurança patrimonial.
Melhore o texto abaixo, usado em material de treinamento/anotação de campo. Regras:
- Mantenha o sentido original e todas as informações técnicas; não invente procedimentos novos.
- Corrija gramática, ortografia e clareza.
- Deixe objetivo, profissional e fácil de ler por colaboradores de portaria/segurança.
- Preserve listas e tópicos quando existirem.
- Responda em texto simples (sem markdown, sem comentários extras), pronto para colar no lugar do original.
${instrucao ? `- Instrução adicional do usuário: ${instrucao}` : ""}

Texto original:
"""
${textoOriginal}
"""`;
}

function responder(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
