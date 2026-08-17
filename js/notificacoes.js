// Aviso de resumo ao entrar no sistema: visitas de hoje + pendências atrasadas/vencendo hoje.
import { listarTudo } from "./db.js";

const FLAG_SESSAO = "inspetor-notificado-sessao";

export async function mostrarResumoEntrada() {
  if (sessionStorage.getItem(FLAG_SESSAO)) return;
  sessionStorage.setItem(FLAG_SESSAO, "1");

  const hoje = new Date().toISOString().slice(0, 10);
  const [agenda, pendencias] = await Promise.all([
    listarTudo("agenda", "data").catch(() => []),
    listarTudo("pendencias", "prazo").catch(() => []),
  ]);

  const visitasHoje = agenda.filter((e) => e.data === hoje && e.status !== "Cancelado")
    .sort((a, b) => (a.horario || "").localeCompare(b.horario || ""));
  const atrasadas = pendencias.filter((p) => p.status !== "Concluída" && p.prazo && p.prazo < hoje);
  const vencemHoje = pendencias.filter((p) => p.status !== "Concluída" && p.prazo === hoje);

  if (!visitasHoje.length && !atrasadas.length && !vencemHoje.length) return;

  const linhas = [];
  if (visitasHoje.length) {
    linhas.push(`<strong>📅 ${visitasHoje.length} visita${visitasHoje.length > 1 ? "s" : ""} hoje:</strong> ${visitasHoje.map((e) => `${e.horario || "—"} ${e.contratoNome || e.titulo || e.tipo}`).join(" · ")}`);
  }
  if (vencemHoje.length) {
    linhas.push(`<strong>🟡 ${vencemHoje.length} pendência${vencemHoje.length > 1 ? "s" : ""} vence${vencemHoje.length > 1 ? "m" : ""} hoje.</strong>`);
  }
  if (atrasadas.length) {
    linhas.push(`<strong style="color:var(--perigo)">🔴 ${atrasadas.length} pendência${atrasadas.length > 1 ? "s" : ""} atrasada${atrasadas.length > 1 ? "s" : ""}.</strong>`);
  }

  const banner = document.createElement("div");
  banner.className = "notificacao-entrada";
  banner.innerHTML = `
    <div class="notificacao-conteudo">${linhas.join("<br>")}</div>
    <button class="icon-btn" aria-label="Fechar">✕</button>
  `;
  banner.querySelector("button").addEventListener("click", () => banner.remove());
  document.body.appendChild(banner);
  setTimeout(() => banner.remove(), 12000);
}
