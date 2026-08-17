import { listarTudo, criar, atualizar, remover } from "./db.js";
import { abrirModal, fecharModal, confirmar, toast, formatarData, escaparHtml } from "./ui.js";

export async function listarVisitasDoContrato(contratoId) {
  const todas = await listarTudo("visitas", "data").catch(() => []);
  return todas.filter((v) => v.contratoId === contratoId);
}

export function renderTimelineVisitas(visitas) {
  if (!visitas.length) return `<div class="vazio-estado"><span class="icone">🕘</span>Nenhuma visita registrada ainda.</div>`;
  return `<div class="timeline">${visitas.map((v) => `
    <div class="timeline-item" data-editar-visita="${v.id}" style="cursor:pointer">
      <strong>${formatarData(v.data)} ${v.horario ? "· " + v.horario : ""}</strong>
      <p style="margin:4px 0 0">${escaparHtml(v.objetivo || "")}</p>
      ${v.atividades ? `<small>${escaparHtml(v.atividades)}</small>` : ""}
    </div>
  `).join("")}</div>`;
}

export function abrirFormularioVisitaHistorico(contrato, aoSalvar, visitaEditar) {
  const v = visitaEditar || {};
  abrirModal({
    titulo: visitaEditar ? "Editar visita" : `Registrar visita — ${contrato.nome}`,
    tamanho: "grande",
    corpoHtml: `
      <form id="form-visita">
        <div class="form-grid">
          <div class="campo"><label>Data</label><input type="date" name="data" required value="${v.data || new Date().toISOString().slice(0,10)}"></div>
          <div class="campo"><label>Horário</label><input type="time" name="horario" value="${v.horario || ""}"></div>
          <div class="campo full"><label>Objetivo</label><input name="objetivo" value="${escaparHtml(v.objetivo || "")}"></div>
          <div class="campo full"><label>Atividades realizadas</label><textarea name="atividades">${escaparHtml(v.atividades || "")}</textarea></div>
          <div class="campo full"><label>Anotações</label><textarea name="anotacoes">${escaparHtml(v.anotacoes || "")}</textarea></div>
          <div class="campo full"><label>Pendências identificadas</label><textarea name="pendenciasIdentificadas">${escaparHtml(v.pendenciasIdentificadas || "")}</textarea></div>
          <div class="campo full"><label>Treinamentos realizados</label><input name="treinamentosRealizados" value="${escaparHtml(v.treinamentosRealizados || "")}"></div>
          <div class="campo full"><label>Documentos produzidos</label><input name="documentosProduzidos" value="${escaparHtml(v.documentosProduzidos || "")}"></div>
        </div>
        <div class="modal-footer">
          ${visitaEditar ? '<button type="button" class="btn btn-perigo" id="btn-excluir-visita">Excluir</button>' : ""}
          <button type="button" class="btn btn-ghost" data-fechar>Cancelar</button>
          <button type="submit" class="btn btn-primary">Salvar</button>
        </div>
      </form>
    `,
    aoMontar: (overlay) => {
      overlay.querySelector("#form-visita").addEventListener("submit", async (e) => {
        e.preventDefault();
        const dados = Object.fromEntries(new FormData(e.target).entries());
        dados.contratoId = contrato.id;
        dados.contratoNome = contrato.nome;
        try {
          if (visitaEditar) await atualizar("visitas", visitaEditar.id, dados);
          else await criar("visitas", dados);
          toast("Visita registrada.", "sucesso");
          fecharModal();
          aoSalvar?.();
        } catch (err) { toast(err.message, "erro"); }
      });
      overlay.querySelector("#btn-excluir-visita")?.addEventListener("click", async () => {
        if (await confirmar("Excluir este registro de visita?")) {
          await remover("visitas", visitaEditar.id);
          fecharModal();
          aoSalvar?.();
        }
      });
    }
  });
}
