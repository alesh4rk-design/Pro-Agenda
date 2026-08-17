import { listarTudo, criar, atualizar, remover } from "./db.js";
import { abrirModal, fecharModal, confirmar, toast, formatarData, escaparHtml } from "./ui.js";

const PRIORIDADES = ["Baixa", "Média", "Alta", "Urgente"];
const STATUS = ["Aberta", "Em andamento", "Concluída"];

export async function renderPendencias(view) {
  const [pendencias, contratos] = await Promise.all([
    listarTudo("pendencias", "prazo").catch(() => []),
    listarTudo("contratos", "nome").catch(() => []),
  ]);
  const hoje = new Date().toISOString().slice(0, 10);
  let filtro = "todas";

  function desenhar() {
    const hojeCount = pendencias.filter((p) => p.prazo === hoje && p.status !== "Concluída").length;
    const proximas = pendencias.filter((p) => p.status !== "Concluída" && p.prazo && p.prazo > hoje && p.prazo <= addDias(hoje, 3)).length;
    const atrasadas = pendencias.filter((p) => p.status !== "Concluída" && p.prazo && p.prazo < hoje).length;
    const concluidas = pendencias.filter((p) => p.status === "Concluída").length;

    let lista = pendencias;
    if (filtro === "hoje") lista = pendencias.filter((p) => p.prazo === hoje && p.status !== "Concluída");
    if (filtro === "proximas") lista = pendencias.filter((p) => p.status !== "Concluída" && p.prazo > hoje && p.prazo <= addDias(hoje, 3));
    if (filtro === "atrasadas") lista = pendencias.filter((p) => p.status !== "Concluída" && p.prazo && p.prazo < hoje);
    if (filtro === "concluidas") lista = pendencias.filter((p) => p.status === "Concluída");

    view.innerHTML = `
      <div class="pagina-header">
        <div><h1>⚠️ Pendências</h1><p>Tarefas e ações de acompanhamento.</p></div>
        <button class="btn btn-primary" id="btn-nova-pendencia">+ Nova pendência</button>
      </div>
      <div class="pendencias-resumo">
        <div class="card dash-stat card-clicavel" data-f="hoje"><span class="valor">${hojeCount}</span><span class="rotulo">Hoje</span></div>
        <div class="card dash-stat card-clicavel" data-f="proximas"><span class="valor">${proximas}</span><span class="rotulo">Próx. vencimento</span></div>
        <div class="card dash-stat alerta card-clicavel" data-f="atrasadas"><span class="valor">${atrasadas}</span><span class="rotulo">Atrasadas</span></div>
        <div class="card dash-stat card-clicavel" data-f="concluidas"><span class="valor">${concluidas}</span><span class="rotulo">Concluídas</span></div>
      </div>
      <div class="tabs">
        <button data-f="todas" class="${filtro === "todas" ? "ativa" : ""}">Todas</button>
        <button data-f="hoje" class="${filtro === "hoje" ? "ativa" : ""}">Hoje</button>
        <button data-f="proximas" class="${filtro === "proximas" ? "ativa" : ""}">Próximas</button>
        <button data-f="atrasadas" class="${filtro === "atrasadas" ? "ativa" : ""}">Atrasadas</button>
        <button data-f="concluidas" class="${filtro === "concluidas" ? "ativa" : ""}">Concluídas</button>
      </div>
      ${lista.length ? `<div class="lista">${lista.map(itemPendencia).join("")}</div>` : `<div class="vazio-estado"><span class="icone">⚠️</span>Nenhuma pendência nesta visão.</div>`}
    `;
    view.querySelector("#btn-nova-pendencia").onclick = () => abrirFormularioPendencia(desenhar, contratos);
    view.querySelectorAll("[data-f]").forEach((b) => b.onclick = () => { filtro = b.dataset.f; desenhar(); });
    view.querySelectorAll("[data-abrir-pend]").forEach((el) => el.addEventListener("click", () => abrirFormularioPendencia(desenhar, contratos, pendencias.find((p) => p.id === el.dataset.abrirPend))));
  }
  desenhar();
}

function addDias(iso, dias) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

function itemPendencia(p) {
  const hoje = new Date().toISOString().slice(0, 10);
  const atrasada = p.status !== "Concluída" && p.prazo && p.prazo < hoje;
  const iconeStatus = { "Aberta": "🔴", "Em andamento": "🟡", "Concluída": "🟢" }[p.status] || "🔴";
  return `
    <div class="item-lista pendencia-item status-${(p.status || "aberta").toLowerCase().replace(" ", "-")}" data-abrir-pend="${p.id}">
      <div class="meta">
        <strong>${iconeStatus} ${escaparHtml(p.titulo)}</strong>
        <small>${p.contratoNome || "Sem contrato"} · Prioridade ${p.prioridade || "—"} · <span class="prazo ${atrasada ? "atrasado" : ""}">${p.prazo ? "Prazo " + formatarData(p.prazo) : "Sem prazo"}</span></small>
      </div>
      <span class="badge">${p.status}</span>
    </div>
  `;
}

export function abrirFormularioPendencia(aoSalvar, contratosParam, pendenciaEditar) {
  (async () => {
    const contratos = contratosParam || await listarTudo("contratos", "nome").catch(() => []);
    const p = pendenciaEditar || {};
    abrirModal({
      titulo: pendenciaEditar ? "Editar pendência" : "Nova pendência",
      tamanho: "grande",
      corpoHtml: `
        <form id="form-pendencia">
          <div class="form-grid">
            <div class="campo full"><label>Título</label><input name="titulo" required value="${escaparHtml(p.titulo || "")}"></div>
            <div class="campo full"><label>Descrição</label><textarea name="descricao">${escaparHtml(p.descricao || "")}</textarea></div>
            <div class="campo"><label>Contrato</label>
              <select name="contratoId">
                <option value="">Sem contrato</option>
                ${contratos.map((c) => `<option value="${c.id}" ${p.contratoId === c.id ? "selected" : ""}>${escaparHtml(c.nome)}</option>`).join("")}
              </select>
            </div>
            <div class="campo"><label>Responsável</label><input name="responsavel" value="${escaparHtml(p.responsavel || "")}"></div>
            <div class="campo"><label>Prazo</label><input type="date" name="prazo" value="${p.prazo || ""}"></div>
            <div class="campo"><label>Prioridade</label>
              <select name="prioridade">${PRIORIDADES.map((x) => `<option ${p.prioridade === x ? "selected" : ""}>${x}</option>`).join("")}</select>
            </div>
            <div class="campo"><label>Status</label>
              <select name="status">${STATUS.map((s) => `<option ${p.status === s ? "selected" : ""}>${s}</option>`).join("")}</select>
            </div>
          </div>
          <div class="modal-footer">
            ${pendenciaEditar ? '<button type="button" class="btn btn-perigo" id="btn-excluir-pend">Excluir</button>' : ""}
            <button type="button" class="btn btn-ghost" data-fechar>Cancelar</button>
            <button type="submit" class="btn btn-primary">Salvar</button>
          </div>
        </form>
      `,
      aoMontar: (ov) => {
        ov.querySelector("#form-pendencia").addEventListener("submit", async (e) => {
          e.preventDefault();
          const dados = Object.fromEntries(new FormData(e.target).entries());
          dados.contratoNome = contratos.find((c) => c.id === dados.contratoId)?.nome || "";
          try {
            if (pendenciaEditar) await atualizar("pendencias", pendenciaEditar.id, dados);
            else await criar("pendencias", dados);
            toast("Pendência salva.", "sucesso");
            fecharModal();
            aoSalvar?.();
          } catch (err) { toast(err.message, "erro"); }
        });
        ov.querySelector("#btn-excluir-pend")?.addEventListener("click", async () => {
          if (await confirmar("Excluir esta pendência?")) {
            await remover("pendencias", pendenciaEditar.id);
            fecharModal();
            aoSalvar?.();
          }
        });
      }
    });
  })();
}
