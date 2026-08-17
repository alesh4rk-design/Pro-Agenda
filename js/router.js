const rotas = {};
const view = document.getElementById("view");

export function registrarRota(nome, handler) {
  rotas[nome] = handler;
}

export function navegar(hash) {
  window.location.hash = hash;
}

export async function processarRota() {
  const hash = window.location.hash.replace("#/", "") || "inicio";
  const [nomeRota, ...resto] = hash.split("/");
  const handler = rotas[nomeRota] || rotas["inicio"];

  document.querySelectorAll("[data-rota]").forEach((el) => {
    el.classList.toggle("ativo", el.dataset.rota === nomeRota);
  });

  document.getElementById("sidebar")?.classList.remove("aberta");

  view.innerHTML = `<div class="vazio-estado">Carregando…</div>`;
  try {
    await handler(view, resto);
  } catch (err) {
    console.error(err);
    view.innerHTML = `<div class="vazio-estado"><span class="icone">⚠️</span>Não foi possível carregar esta tela.<br><small>${err.message || ""}</small></div>`;
  }
}

window.addEventListener("hashchange", processarRota);
