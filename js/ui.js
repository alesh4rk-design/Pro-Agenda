const modalRoot = document.getElementById("modal-root");
const toastRoot = document.getElementById("toast-root");

export function toast(msg, tipo = "info") {
  const el = document.createElement("div");
  el.className = `toast ${tipo}`;
  el.textContent = msg;
  toastRoot.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

export function abrirModal({ titulo, corpoHtml, aoMontar, tamanho }) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal-box" style="${tamanho === "grande" ? "max-width:820px" : ""}">
      <div class="modal-header">
        <h3>${titulo}</h3>
        <button class="icon-btn" data-fechar>✕</button>
      </div>
      <div class="modal-corpo">${corpoHtml}</div>
    </div>
  `;
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) fecharModal();
  });
  overlay.querySelector("[data-fechar]").addEventListener("click", fecharModal);
  modalRoot.appendChild(overlay);
  document.body.style.overflow = "hidden";
  if (aoMontar) aoMontar(overlay);
  return overlay;
}

export function fecharModal() {
  modalRoot.innerHTML = "";
  document.body.style.overflow = "";
}

export function confirmar(mensagem) {
  return new Promise((resolve) => {
    abrirModal({
      titulo: "Confirmar ação",
      corpoHtml: `
        <p>${mensagem}</p>
        <div class="modal-footer">
          <button class="btn btn-ghost" data-cancelar>Cancelar</button>
          <button class="btn btn-perigo" data-confirmar>Confirmar</button>
        </div>
      `,
      aoMontar: (overlay) => {
        overlay.querySelector("[data-cancelar]").onclick = () => { fecharModal(); resolve(false); };
        overlay.querySelector("[data-confirmar]").onclick = () => { fecharModal(); resolve(true); };
      }
    });
  });
}

export function formatarData(iso) {
  if (!iso) return "—";
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  return d.toLocaleDateString("pt-BR");
}

export function escaparHtml(texto = "") {
  const div = document.createElement("div");
  div.textContent = texto;
  return div.innerHTML;
}
