import { listarTudo, criar, atualizar, remover } from "./db.js";
import { abrirModal, fecharModal, confirmar, toast, formatarData, escaparHtml } from "./ui.js";

const CATEGORIAS = ["Análise de Segurança", "Manual de Normas e Procedimentos", "Pasta do Posto", "Relatório de Visita", "Checklist", "Treinamento", "Outros"];
const STATUS = ["Rascunho", "Válido", "Revisar", "Arquivado"];
const ICONES = { "Análise de Segurança": "🛡️", "Manual de Normas e Procedimentos": "📘", "Pasta do Posto": "🗂️", "Relatório de Visita": "📝", "Checklist": "✅", "Treinamento": "📚", "Outros": "📄" };

export async function renderDocumentos(view) {
  const [documentos, contratos] = await Promise.all([
    listarTudo("documentos", "criadoEm").catch(() => []),
    listarTudo("contratos", "nome").catch(() => []),
  ]);
  let categoriaFiltro = "";

  function desenhar() {
    const filtrados = documentos.filter((d) => !categoriaFiltro || d.categoria === categoriaFiltro);
    view.innerHTML = `
      <div class="pagina-header">
        <div><h1>📄 Documentos</h1><p>Análises, manuais e relatórios organizados.</p></div>
        <button class="btn btn-primary" id="btn-novo-documento">+ Novo documento</button>
      </div>
      <div class="tabs">
        <button data-cat="" class="${!categoriaFiltro ? "ativa" : ""}">Todos</button>
        ${CATEGORIAS.map((c) => `<button data-cat="${c}" class="${categoriaFiltro === c ? "ativa" : ""}">${c}</button>`).join("")}
      </div>
      ${filtrados.length ? `<div class="grid grid-cols-3">${filtrados.map(cardDocumento).join("")}</div>` : `<div class="vazio-estado"><span class="icone">📄</span>Nenhum documento nesta categoria.</div>`}
    `;
    view.querySelector("#btn-novo-documento").onclick = () => abrirFormularioDocumento(desenhar, contratos);
    view.querySelectorAll("[data-cat]").forEach((b) => b.onclick = () => { categoriaFiltro = b.dataset.cat; desenhar(); });
    view.querySelectorAll("[data-abrir-doc]").forEach((el) => el.addEventListener("click", () => abrirFormularioDocumento(desenhar, contratos, documentos.find((d) => d.id === el.dataset.abrirDoc))));
  }
  desenhar();
}

function cardDocumento(d) {
  return `
    <div class="card card-clicavel documento-card" data-abrir-doc="${d.id}">
      <span class="icone-cat">${ICONES[d.categoria] || "📄"}</span>
      <div class="nome">${escaparHtml(d.nome)}</div>
      <small>${d.contratoNome || "Sem contrato"} · ${formatarData(d.data)}</small>
      <div style="margin-top:8px"><span class="badge badge-info">${d.status || "—"}</span></div>
    </div>
  `;
}

export function abrirFormularioDocumento(aoSalvar, contratosParam, documentoEditar) {
  (async () => {
    const contratos = contratosParam || await listarTudo("contratos", "nome").catch(() => []);
    const d = documentoEditar || {};
    abrirModal({
      titulo: documentoEditar ? "Editar documento" : "Novo documento",
      tamanho: "grande",
      corpoHtml: `
        <form id="form-documento">
          <div class="form-grid">
            <div class="campo full"><label>Nome</label><input name="nome" required value="${escaparHtml(d.nome || "")}"></div>
            <div class="campo"><label>Contrato</label>
              <select name="contratoId">
                <option value="">Sem contrato</option>
                ${contratos.map((c) => `<option value="${c.id}" ${d.contratoId === c.id ? "selected" : ""}>${escaparHtml(c.nome)}</option>`).join("")}
              </select>
            </div>
            <div class="campo"><label>Categoria</label>
              <select name="categoria">${CATEGORIAS.map((c) => `<option ${d.categoria === c ? "selected" : ""}>${c}</option>`).join("")}</select>
            </div>
            <div class="campo"><label>Data</label><input type="date" name="data" value="${d.data || new Date().toISOString().slice(0,10)}"></div>
            <div class="campo"><label>Status</label>
              <select name="status">${STATUS.map((s) => `<option ${d.status === s ? "selected" : ""}>${s}</option>`).join("")}</select>
            </div>
            <div class="campo full"><label>Arquivo (link, quando aplicável)</label><input name="arquivoUrl" value="${escaparHtml(d.arquivoUrl || "")}" placeholder="Link do Google Drive, etc."></div>
            <div class="campo full"><label>Conteúdo / resumo</label><textarea name="conteudo">${escaparHtml(d.conteudo || "")}</textarea></div>
            <div class="campo full"><label>Observações</label><textarea name="observacoes">${escaparHtml(d.observacoes || "")}</textarea></div>
          </div>
          <div class="modal-footer">
            ${documentoEditar ? '<button type="button" class="btn btn-perigo" id="btn-excluir-doc">Excluir</button>' : ""}
            <button type="button" class="btn btn-ghost" data-fechar>Cancelar</button>
            <button type="submit" class="btn btn-primary">Salvar</button>
          </div>
        </form>
      `,
      aoMontar: (ov) => {
        ov.querySelector("#form-documento").addEventListener("submit", async (e) => {
          e.preventDefault();
          const dados = Object.fromEntries(new FormData(e.target).entries());
          dados.contratoNome = contratos.find((c) => c.id === dados.contratoId)?.nome || "";
          try {
            if (documentoEditar) await atualizar("documentos", documentoEditar.id, dados);
            else await criar("documentos", dados);
            toast("Documento salvo.", "sucesso");
            fecharModal();
            aoSalvar?.();
          } catch (err) { toast(err.message, "erro"); }
        });
        ov.querySelector("#btn-excluir-doc")?.addEventListener("click", async () => {
          if (await confirmar("Excluir este documento?")) {
            await remover("documentos", documentoEditar.id);
            fecharModal();
            aoSalvar?.();
          }
        });
      }
    });
  })();
}
