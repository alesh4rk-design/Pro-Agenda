// Editor de texto simples e confortável para uso no celular, baseado em contenteditable.
import { melhorarTexto } from "./ia.js";
import { abrirModal, fecharModal, toast, escaparHtml } from "./ui.js";

const BOTOES = [
  { cmd: "bold", label: "𝐁", titulo: "Negrito" },
  { cmd: "italic", label: "𝐼", titulo: "Itálico" },
  { cmd: "formatBlock", arg: "H3", label: "T", titulo: "Título" },
  { cmd: "insertUnorderedList", label: "•—", titulo: "Lista" },
  { cmd: "checklist", label: "☑", titulo: "Checklist" },
  { cmd: "formatBlock", arg: "P", label: "¶", titulo: "Parágrafo" },
];

export function montarEditor(container, conteudoInicial = "") {
  container.innerHTML = `
    <div class="editor-toolbar">
      ${BOTOES.map((b) => `<button type="button" data-cmd="${b.cmd}" data-arg="${b.arg || ""}" title="${b.titulo}">${b.label}</button>`).join("")}
      <button type="button" class="btn-ia" data-ia title="Melhorar texto com IA">✨ Melhorar com IA</button>
    </div>
    <div class="editor-conteudo" contenteditable="true">${conteudoInicial || "<p></p>"}</div>
  `;
  const area = container.querySelector(".editor-conteudo");
  container.querySelectorAll(".editor-toolbar button[data-cmd]").forEach((btn) => {
    btn.addEventListener("mousedown", (e) => e.preventDefault());
    btn.addEventListener("click", () => {
      area.focus();
      if (btn.dataset.cmd === "checklist") {
        document.execCommand("insertHTML", false, "☐ ");
      } else {
        document.execCommand(btn.dataset.cmd, false, btn.dataset.arg || undefined);
      }
    });
  });

  container.querySelector("[data-ia]").addEventListener("mousedown", (e) => e.preventDefault());
  container.querySelector("[data-ia]").addEventListener("click", () => abrirMelhoriaIA(area));
}

export function obterConteudoEditor(container) {
  return container.querySelector(".editor-conteudo").innerHTML;
}

function abrirMelhoriaIA(area) {
  const textoAtual = area.innerText.trim();
  if (!textoAtual) {
    toast("Escreva algo no texto antes de pedir a melhoria da IA.", "erro");
    return;
  }

  abrirModal({
    titulo: "✨ Melhorar texto com IA",
    corpoHtml: `
      <div class="campo full">
        <label>Alguma instrução extra? (opcional)</label>
        <input id="ia-instrucao" placeholder="Ex: deixar mais resumido, focar em CFTV...">
      </div>
      <div id="ia-resultado"></div>
      <div class="modal-footer">
        <button type="button" class="btn btn-ghost" data-fechar>Fechar</button>
        <button type="button" class="btn btn-primary" id="btn-ia-gerar">Gerar sugestão</button>
      </div>
    `,
    aoMontar: (overlay) => {
      const resultado = overlay.querySelector("#ia-resultado");
      overlay.querySelector("#btn-ia-gerar").addEventListener("click", async () => {
        const botao = overlay.querySelector("#btn-ia-gerar");
        const instrucao = overlay.querySelector("#ia-instrucao").value.trim();
        botao.disabled = true;
        botao.textContent = "Gerando...";
        resultado.innerHTML = "";
        try {
          const melhorado = await melhorarTexto(textoAtual, instrucao);
          resultado.innerHTML = `
            <div class="campo full">
              <label>Sugestão da IA</label>
              <textarea id="ia-texto-sugerido" style="min-height:220px">${escaparHtml(melhorado)}</textarea>
            </div>
            <div class="modal-footer" style="margin-top:0">
              <button type="button" class="btn btn-secundario" id="btn-ia-usar">Usar este texto</button>
            </div>
          `;
          overlay.querySelector("#btn-ia-usar").addEventListener("click", () => {
            const textoFinal = overlay.querySelector("#ia-texto-sugerido").value;
            area.innerHTML = textoFinal.split(/\n{2,}/).map((par) => `<p>${escaparHtml(par).replace(/\n/g, "<br>")}</p>`).join("");
            fecharModal();
            toast("Texto atualizado com a sugestão da IA.", "sucesso");
          });
        } catch (err) {
          resultado.innerHTML = `<p style="color:var(--perigo)">${escaparHtml(err.message)}</p>`;
        } finally {
          botao.disabled = false;
          botao.textContent = "Gerar sugestão";
        }
      });
    }
  });
}
