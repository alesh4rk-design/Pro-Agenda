import { listarTudo } from "./db.js";
import { formatarData } from "./ui.js";
import { abrirFormularioVisita } from "./agenda.js";
import { abrirFormularioAnotacao } from "./anotacoes.js";
import { abrirFormularioPendencia } from "./pendencias.js";
import { abrirFormularioTreinamento } from "./treinamentos.js";
import { abrirFormularioDocumento } from "./documentos.js";
import { processarRota } from "./router.js";

export async function renderInicio(view) {
  const [agenda, contratos, pendencias, treinamentos, documentos] = await Promise.all([
    listarTudo("agenda", "data").catch(() => []),
    listarTudo("contratos", "nome").catch(() => []),
    listarTudo("pendencias", "prazo").catch(() => []),
    listarTudo("treinamentos", "criadoEm").catch(() => []),
    listarTudo("documentos", "criadoEm").catch(() => []),
  ]);

  const hoje = new Date().toISOString().slice(0, 10);
  const futuros = agenda.filter((e) => e.data >= hoje && e.status !== "Cancelado").sort((a, b) => (a.data + a.horario).localeCompare(b.data + b.horario));
  const proxima = futuros[0];

  const abertas = pendencias.filter((p) => p.status !== "Concluída");
  const atrasadas = pendencias.filter((p) => p.status !== "Concluída" && p.prazo && p.prazo < hoje);

  view.innerHTML = `
    <div class="pagina-header">
      <div>
        <h1>Olá 👋</h1>
        <p>${new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}</p>
      </div>
    </div>

    <div class="dash-resumo">
      <div class="card dash-stat destaque">
        <span class="rotulo">Próxima visita</span>
        <span class="valor" style="font-size:16px">${proxima ? `${formatarData(proxima.data)} · ${proxima.horario || ""}` : "Nenhuma"}</span>
      </div>
      <div class="card dash-stat"><span class="valor">${contratos.length}</span><span class="rotulo">Contratos</span></div>
      <div class="card dash-stat"><span class="valor">${futuros.length}</span><span class="rotulo">Visitas agendadas</span></div>
      <div class="card dash-stat ${atrasadas.length ? "alerta" : ""}"><span class="valor">${abertas.length}</span><span class="rotulo">Pendências abertas</span></div>
      <div class="card dash-stat alerta"><span class="valor">${atrasadas.length}</span><span class="rotulo">Pendências atrasadas</span></div>
      <div class="card dash-stat"><span class="valor">${treinamentos.length}</span><span class="rotulo">Treinamentos</span></div>
      <div class="card dash-stat"><span class="valor">${documentos.length}</span><span class="rotulo">Documentos</span></div>
      <div class="card dash-stat"><span class="valor">${contratos.length}</span><span class="rotulo">Postos acompanhados</span></div>
    </div>

    <h3>Ações rápidas</h3>
    <div class="dash-atalhos">
      <div class="dash-atalho" data-acao="visita"><span class="icone">📅</span>Nova visita</div>
      <div class="dash-atalho" data-acao="anotacao"><span class="icone">📝</span>Nova anotação</div>
      <div class="dash-atalho" data-acao="pendencia"><span class="icone">⚠️</span>Nova pendência</div>
      <div class="dash-atalho" data-acao="treinamento"><span class="icone">📚</span>Novo treinamento</div>
      <div class="dash-atalho" data-acao="documento"><span class="icone">📄</span>Novo documento</div>
    </div>

    <div class="card">
      <div class="card-header"><h3>Próximas atividades</h3></div>
      ${futuros.length ? `
        <div class="lista">
          ${futuros.slice(0, 6).map((e) => `
            <div class="item-lista">
              <div class="meta">
                <strong>${e.titulo || e.tipo}</strong>
                <small>${formatarData(e.data)} · ${e.horario || "—"} · ${e.contratoNome || "Sem contrato"} · ${e.tipo}</small>
              </div>
              <span class="badge ${e.status === "Realizado" ? "badge-sucesso" : "badge-info"}">${e.status}</span>
            </div>
          `).join("")}
        </div>
      ` : `<div class="vazio-estado"><span class="icone">📅</span>Nenhuma atividade agendada.</div>`}
    </div>
  `;

  const acoes = {
    visita: abrirFormularioVisita,
    anotacao: abrirFormularioAnotacao,
    pendencia: abrirFormularioPendencia,
    treinamento: abrirFormularioTreinamento,
    documento: abrirFormularioDocumento,
  };
  view.querySelectorAll(".dash-atalho").forEach((el) => {
    el.addEventListener("click", () => acoes[el.dataset.acao](() => processarRota()));
  });
}
