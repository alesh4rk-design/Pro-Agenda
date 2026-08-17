// Integração com Google Gemini (plano gratuito) para melhorar textos de treinamentos e anotações.
// A chave de API fica salva apenas no navegador do usuário (localStorage), nunca no Firestore.
const CHAVE_STORAGE = "inspetor-gemini-key";
const MODELO = "gemini-2.0-flash";

export function getChaveIA() {
  return localStorage.getItem(CHAVE_STORAGE) || "";
}

export function salvarChaveIA(chave) {
  if (chave) localStorage.setItem(CHAVE_STORAGE, chave.trim());
  else localStorage.removeItem(CHAVE_STORAGE);
}

export async function melhorarTexto(textoOriginal, instrucao = "") {
  const chave = getChaveIA();
  if (!chave) {
    const erro = new Error("Nenhuma chave de IA configurada. Adicione sua chave gratuita do Google Gemini em Configurações.");
    erro.semChave = true;
    throw erro;
  }
  if (!textoOriginal || !textoOriginal.trim()) {
    throw new Error("Escreva algum texto antes de pedir a melhoria.");
  }

  const prompt = `Você é um assistente de um Inspetor de Treinamento de uma empresa de segurança patrimonial.
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

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent?key=${encodeURIComponent(chave)}`;
  const resposta = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4 },
    }),
  });

  if (!resposta.ok) {
    if (resposta.status === 400 || resposta.status === 403) {
      throw new Error("Chave de IA inválida ou sem permissão. Verifique em Configurações.");
    }
    if (resposta.status === 429) {
      throw new Error("Limite gratuito da IA atingido no momento. Tente novamente em instantes.");
    }
    throw new Error("Não foi possível falar com a IA agora. Tente novamente.");
  }

  const dados = await resposta.json();
  const texto = dados?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";
  if (!texto.trim()) throw new Error("A IA não retornou nenhum texto.");
  return texto.trim();
}
