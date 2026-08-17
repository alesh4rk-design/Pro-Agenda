import { listarTudo, criar, atualizar, remover } from "./db.js";
import { abrirModal, fecharModal, confirmar, toast, formatarData, escaparHtml } from "./ui.js";
import { montarEditor, obterConteudoEditor } from "./editor.js";

const CATEGORIAS = ["Controle de acesso", "Portaria", "CFTV", "Segurança", "Atendimento", "Procedimentos", "Emergência", "Comunicação", "Postura profissional", "Implantação", "Outros"];

export async function renderTreinamentos(view) {
  const treinamentos = await listarTudo("treinamentos", "criadoEm").catch(() => []);
  let termo = "";

  function desenhar() {
    const filtrados = treinamentos.filter((t) => !termo || `${t.titulo} ${t.categoria} ${t.tags || ""}`.toLowerCase().includes(termo.toLowerCase()));
    const ordenados = [...filtrados].sort((a, b) => (b.favorito ? 1 : 0) - (a.favorito ? 1 : 0));
    view.innerHTML = `
      <div class="pagina-header">
        <div><h1>📚 Treinamentos</h1><p>Sua biblioteca pessoal de conteúdos.</p></div>
        <button class="btn btn-primary" id="btn-novo-treinamento">+ Novo treinamento</button>
      </div>
      <div class="campo full" style="max-width:420px"><input id="busca-treinamentos" placeholder="🔎 Pesquisar treinamentos..." value="${escaparHtml(termo)}"></div>
      ${ordenados.length ? `<div class="grid grid-cols-3">${ordenados.map(cardTreinamento).join("")}</div>` : `<div class="vazio-estado"><span class="icone">📚</span>Nenhum treinamento cadastrado ainda.</div>`}
    `;
    view.querySelector("#btn-novo-treinamento").onclick = () => abrirFormularioTreinamento(desenhar);
    const inputBusca = view.querySelector("#busca-treinamentos");
    inputBusca.addEventListener("input", (e) => { termo = e.target.value; desenhar(); });
    view.querySelectorAll("[data-ver]").forEach((el) => el.addEventListener("click", () => abrirVisualizacao(treinamentos.find((t) => t.id === el.dataset.ver), desenhar)));
    view.querySelectorAll("[data-editar]").forEach((el) => el.addEventListener("click", (e) => { e.stopPropagation(); abrirFormularioTreinamento(desenhar, treinamentos.find((t) => t.id === el.dataset.editar)); }));
    view.querySelectorAll("[data-apresentar]").forEach((el) => el.addEventListener("click", (e) => { e.stopPropagation(); abrirApresentacao(treinamentos.find((t) => t.id === el.dataset.apresentar)); }));
    view.querySelectorAll("[data-favoritar]").forEach((el) => el.addEventListener("click", async (e) => {
      e.stopPropagation();
      const t = treinamentos.find((x) => x.id === el.dataset.favoritar);
      await atualizar("treinamentos", t.id, { favorito: !t.favorito });
      t.favorito = !t.favorito;
      desenhar();
    }));
  }
  desenhar();
}

function cardTreinamento(t) {
  return `
    <div class="card card-clicavel treinamento-card" data-ver="${t.id}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <span class="badge badge-info">${t.categoria}</span>
        <button class="fav" data-favoritar="${t.id}" title="Favoritar">${t.favorito ? "⭐" : "☆"}</button>
      </div>
      <div class="titulo" style="margin-top:8px">${escaparHtml(t.titulo)}</div>
      <p style="font-size:12.5px">${escaparHtml(t.objetivo || "").slice(0, 100)}</p>
      <div class="rodape">
        <small>${formatarData(t.criadoEm?.slice(0, 10))}</small>
        <div style="display:flex;gap:6px">
          <button class="btn btn-ghost btn-sm" data-apresentar="${t.id}">▶ Apresentar</button>
          <button class="btn btn-ghost btn-sm" data-editar="${t.id}">✏️</button>
        </div>
      </div>
    </div>
  `;
}

function abrirVisualizacao(t, aoMudar) {
  abrirModal({
    titulo: t.titulo,
    tamanho: "grande",
    corpoHtml: `
      <span class="badge badge-info">${t.categoria}</span>
      <p style="margin-top:12px"><strong>Objetivo:</strong> ${escaparHtml(t.objetivo || "—")}</p>
      <p><strong>Público-alvo:</strong> ${escaparHtml(t.publicoAlvo || "—")}</p>
      <div class="editor-conteudo" style="border:1px solid var(--borda);border-radius:10px">${t.conteudo || ""}</div>
      <p style="margin-top:10px"><strong>Tags:</strong> ${escaparHtml(t.tags || "—")}</p>
      <div class="modal-footer">
        <button class="btn btn-perigo" id="btn-excluir-view">🗑️ Excluir</button>
        <button class="btn btn-secundario" id="btn-copiar-view">📋 Copiar texto</button>
        <button class="btn btn-primary" id="btn-apresentar-view">▶ Modo apresentação</button>
      </div>
    `,
    aoMontar: (ov) => {
      ov.querySelector("#btn-apresentar-view").onclick = () => { fecharModal(); abrirApresentacao(t); };
      ov.querySelector("#btn-copiar-view").onclick = async () => {
        await navigator.clipboard.writeText(ov.querySelector(".editor-conteudo").innerText);
        toast("Texto copiado.", "sucesso");
      };
      ov.querySelector("#btn-excluir-view").onclick = async () => {
        if (await confirmar("Excluir este treinamento?")) {
          await remover("treinamentos", t.id);
          fecharModal();
          aoMudar?.();
        }
      };
    }
  });
}

function abrirApresentacao(t) {
  const div = document.createElement("div");
  div.innerHTML = t.conteudo || "<p></p>";
  const blocos = Array.from(div.children);
  const slides = [];
  let atual = null;
  blocos.forEach((el) => {
    if (el.tagName === "H3" || !atual) { atual = { titulo: el.tagName === "H3" ? el.textContent : "", html: el.tagName === "H3" ? "" : el.outerHTML }; slides.push(atual); }
    else atual.html += el.outerHTML;
  });
  if (!slides.length) slides.push({ titulo: t.titulo, html: t.conteudo || "" });

  let indice = 0;
  const el = document.createElement("div");
  el.className = "apresentacao";
  document.body.appendChild(el);

  function desenhar() {
    const s = slides[indice];
    el.innerHTML = `
      <div class="apresentacao-topo">
        <strong>${escaparHtml(t.titulo)}</strong>
        <button class="icon-btn" id="btn-fechar-apresentacao">✕</button>
      </div>
      <div class="apresentacao-corpo">
        <div class="conteudo-slide">${s.titulo ? `<h3>${escaparHtml(s.titulo)}</h3>` : ""}${s.html}</div>
      </div>
      <div class="apresentacao-rodape">
        <button class="btn btn-secundario" id="btn-anterior" ${indice === 0 ? "disabled" : ""}>← Anterior</button>
        <span style="align-self:center;font-size:13px;color:var(--texto-fraco)">${indice + 1} / ${slides.length}</span>
        <button class="btn btn-primary" id="btn-proximo" ${indice === slides.length - 1 ? "disabled" : ""}>Próximo →</button>
      </div>
    `;
    el.querySelector("#btn-fechar-apresentacao").onclick = () => el.remove();
    el.querySelector("#btn-anterior").onclick = () => { indice--; desenhar(); };
    el.querySelector("#btn-proximo").onclick = () => { indice++; desenhar(); };
  }
  desenhar();
}

async function sugestoesDeCategorias() {
  const treinamentos = await listarTudo("treinamentos", "criadoEm").catch(() => []);
  const usadas = treinamentos.map((t) => t.categoria).filter(Boolean);
  return [...new Set([...CATEGORIAS, ...usadas])];
}

export async function abrirFormularioTreinamento(aoSalvar, treinamentoEditar) {
  const t = treinamentoEditar || {};
  const categorias = await sugestoesDeCategorias();
  const overlay = abrirModal({
    titulo: treinamentoEditar ? "Editar treinamento" : "Novo treinamento",
    tamanho: "grande",
    corpoHtml: `
      <form id="form-treinamento">
        <div class="form-grid">
          <div class="campo full"><label>Título</label><input name="titulo" required value="${escaparHtml(t.titulo || "")}"></div>
          <div class="campo"><label>Categoria (digite para criar uma nova, se precisar)</label>
            <input name="categoria" list="lista-categorias" required value="${escaparHtml(t.categoria || "")}">
            <datalist id="lista-categorias">${categorias.map((c) => `<option value="${escaparHtml(c)}">`).join("")}</datalist>
          </div>
          <div class="campo"><label>Público-alvo</label><input name="publicoAlvo" value="${escaparHtml(t.publicoAlvo || "")}"></div>
          <div class="campo full"><label>Objetivo</label><input name="objetivo" value="${escaparHtml(t.objetivo || "")}"></div>
          <div class="campo full"><label>Contratos em que foi utilizado</label><input name="contratos" value="${escaparHtml(t.contratos || "")}" placeholder="separe por vírgula"></div>
          <div class="campo full"><label>Tags</label><input name="tags" value="${escaparHtml(t.tags || "")}"></div>
        </div>
        <label style="font-size:13px;color:var(--texto-suave)">Conteúdo</label>
        <div id="editor-treinamento" style="margin-top:6px"></div>
        <div class="campo full" style="margin-top:14px"><label>Observações</label><textarea name="observacoes">${escaparHtml(t.observacoes || "")}</textarea></div>
        <div class="modal-footer">
          ${treinamentoEditar ? '<button type="button" class="btn btn-perigo" id="btn-excluir-treinamento">Excluir</button>' : ""}
          <button type="button" class="btn btn-ghost" data-fechar>Cancelar</button>
          <button type="submit" class="btn btn-primary">Salvar</button>
        </div>
      </form>
    `,
    aoMontar: (ov) => {
      montarEditor(ov.querySelector("#editor-treinamento"), t.conteudo || "<h3>Novo tópico</h3><p></p>");
      ov.querySelector("#form-treinamento").addEventListener("submit", async (e) => {
        e.preventDefault();
        const dados = Object.fromEntries(new FormData(e.target).entries());
        dados.conteudo = obterConteudoEditor(ov.querySelector("#editor-treinamento"));
        try {
          if (treinamentoEditar) await atualizar("treinamentos", treinamentoEditar.id, dados);
          else await criar("treinamentos", { ...dados, favorito: false });
          toast("Treinamento salvo.", "sucesso");
          fecharModal();
          aoSalvar?.();
        } catch (err) { toast(err.message, "erro"); }
      });
      ov.querySelector("#btn-excluir-treinamento")?.addEventListener("click", async () => {
        if (await confirmar("Excluir este treinamento?")) {
          await remover("treinamentos", treinamentoEditar.id);
          fecharModal();
          aoSalvar?.();
        }
      });
    }
  });
  return overlay;
}
