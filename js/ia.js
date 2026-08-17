// Integração com Google Gemini (plano gratuito) para melhorar textos de treinamentos e anotações.
// A chave de API fica salva no Firestore, no espaço privado do usuário (users/{uid}/config/preferencias),
// protegida pelas mesmas regras que restringem os dados só à própria conta.
import { db, doc, getDoc, setDoc } from "./firebase.js";
import { getUsuario } from "./auth.js";

const MODELO = "gemini-2.0-flash";
const CHAVE_STORAGE_LEGADA = "inspetor-gemini-key";

function refPreferencias() {
  const user = getUsuario();
  if (!user) throw new Error("Usuário não autenticado.");
  return doc(db, "users", user.uid, "config", "preferencias");
}

export async function getChaveIA() {
  const snap = await getDoc(refPreferencias());
  const chaveFirestore = snap.exists() ? snap.data().chaveGemini || "" : "";
  if (chaveFirestore) return chaveFirestore;

  // Migração de instalações antigas que salvavam a chave só no navegador.
  const chaveLegada = localStorage.getItem(CHAVE_STORAGE_LEGADA);
  if (chaveLegada) {
    await salvarChaveIA(chaveLegada);
    localStorage.removeItem(CHAVE_STORAGE_LEGADA);
    return chaveLegada;
  }
  return "";
}

export async function salvarChaveIA(chave) {
  await setDoc(refPreferencias(), { chaveGemini: chave ? chave.trim() : "" }, { merge: true });
}

export async function melhorarTexto(textoOriginal, instrucao = "") {
  const chave = await getChaveIA();
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
