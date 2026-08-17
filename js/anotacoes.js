import { listarTudo, criar, atualizar, remover } from "./db.js";
import { abrirModal, fecharModal, confirmar, toast, formatarData, escaparHtml } from "./ui.js";
import { montarEditor, obterConteudoEditor } from "./editor.js";

const CATEGORIAS = ["Visita", "Treinamento", "Segurança", "Portaria", "CFTV", "Colaborador", "Implantação", "Documento", "Geral"];

export async function renderAnotacoes(view) {
  const [anotacoes, contratos] = await Promise.all([
    listarTudo("anotacoes", "criadoEm").catch(() => []),
    listarTudo("contratos", "nome").catch(() => []),
  ]);
  let termo = "";

  function desenhar() {
    const filtradas = anotacoes.filter((a) => {
      if (!termo) return true;
      const alvo = `${a.titulo} ${a.contratoNome || ""} ${a.categoria} ${a.tags || ""} ${a.texto || ""}`.toLowerCase();
      return alvo.includes(termo.toLowerCase());
    });
    view.innerHTML = `
      <div class="pagina-header">
        <div><h1>📝 Anotações</h1><p>Registros rápidos de campo.</p></div>
        <button class="btn btn-primary" id="btn-nova-anotacao">+ Nova anotação</button>
      </div>
      <div class="campo full" style="max-width:420px"><input id="busca-anotacoes" placeholder="Pesquisar por título, contrato, categoria..." value="${escaparHtml(termo)}"></div>
      ${filtradas.length ? `<div class="grid grid-cols-3">${filtradas.map(cardAnotacao).join("")}</div>` : `<div class="vazio-estado"><span class="icone">📝</span>Nenhuma anotação encontrada.</div>`}
    `;
    view.querySelector("#btn-nova-anotacao").onclick = () => abrirFormularioAnotacao(desenhar, contratos);
    view.querySelector("#busca-anotacoes").addEventListener("input", (e) => { termo = e.target.value; desenhar(); });
    view.querySelector("#busca-anotacoes").focus();
    view.querySelector("#busca-anotacoes").selectionStart = termo.length;
    view.querySelectorAll("[data-abrir-anotacao]").forEach((el) => {
      el.addEventListener("click", () => abrirFormularioAnotacao(desenhar, contratos, anotacoes.find((a) => a.id === el.dataset.abrirAnotacao)));
    });
  }
  desenhar();
}

function cardAnotacao(a) {
  const texto = (a.texto || "").replace(/<[^>]+>/g, " ");
  return `
    <div class="card card-clicavel anotacao-card" data-abrir-anotacao="${a.id}">
      <span class="badge badge-info">${a.categoria}</span>
      <div class="titulo" style="margin-top:8px">${escaparHtml(a.titulo)}</div>
      <div class="texto-preview">${escaparHtml(texto).slice(0, 140)}</div>
      <small>${a.contratoNome || "Sem contrato"} · ${formatarData(a.criadoEm?.slice(0, 10))}</small>
    </div>
  `;
}

export function abrirFormularioAnotacao(aoSalvar, contratosParam, anotacaoEditar) {
  (async () => {
    const contratos = contratosParam || await listarTudo("contratos", "nome").catch(() => []);
    const a = anotacaoEditar || {};
    const overlay = abrirModal({
      titulo: anotacaoEditar ? "Editar anotação" : "Nova anotação",
      tamanho: "grande",
      corpoHtml: `
        <form id="form-anotacao">
          <div class="form-grid">
            <div class="campo full"><label>Título</label><input name="titulo" required value="${escaparHtml(a.titulo || "")}"></div>
            <div class="campo"><label>Contrato</label>
              <select name="contratoId">
                <option value="">Sem contrato</option>
                ${contratos.map((c) => `<option value="${c.id}" ${a.contratoId === c.id ? "selected" : ""}>${escaparHtml(c.nome)}</option>`).join("")}
              </select>
            </div>
            <div class="campo"><label>Categoria</label>
              <select name="categoria">${CATEGORIAS.map((c) => `<option ${a.categoria === c ? "selected" : ""}>${c}</option>`).join("")}</select>
            </div>
            <div class="campo full"><label>Tags (separadas por vírgula)</label><input name="tags" value="${escaparHtml(a.tags || "")}"></div>
          </div>
          <div class="campo full"><label>Texto</label></div>
          <div id="editor-anotacao"></div>
          <div class="modal-footer" style="margin-top:16px">
            ${anotacaoEditar ? '<button type="button" class="btn btn-secundario" id="btn-copiar-texto">📋 Copiar texto</button><button type="button" class="btn btn-perigo" id="btn-excluir-anotacao">Excluir</button>' : ""}
            <button type="button" class="btn btn-ghost" data-fechar>Cancelar</button>
            <button type="submit" class="btn btn-primary">Salvar</button>
          </div>
        </form>
      `,
      aoMontar: (ov) => {
        montarEditor(ov.querySelector("#editor-anotacao"), a.texto || "");
        const form = ov.querySelector("#form-anotacao");
        form.addEventListener("submit", async (e) => {
          e.preventDefault();
          const fd = new FormData(form);
          const dados = Object.fromEntries(fd.entries());
          dados.contratoNome = contratos.find((c) => c.id === dados.contratoId)?.nome || "";
          dados.texto = obterConteudoEditor(ov.querySelector("#editor-anotacao"));
          try {
            if (anotacaoEditar) await atualizar("anotacoes", anotacaoEditar.id, dados);
            else await criar("anotacoes", dados);
            toast("Anotação salva.", "sucesso");
            fecharModal();
            aoSalvar?.();
          } catch (err) { toast(err.message, "erro"); }
        });
        ov.querySelector("#btn-copiar-texto")?.addEventListener("click", async () => {
          const texto = ov.querySelector("#editor-anotacao .editor-conteudo").innerText;
          await navigator.clipboard.writeText(texto);
          toast("Texto copiado.", "sucesso");
        });
        ov.querySelector("#btn-excluir-anotacao")?.addEventListener("click", async () => {
          if (await confirmar("Excluir esta anotação?")) {
            await remover("anotacoes", anotacaoEditar.id);
            fecharModal();
            aoSalvar?.();
          }
        });
      }
    });
    return overlay;
  })();
}
