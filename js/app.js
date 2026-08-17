import { aoMudarAuth, entrar, criarConta, sair, getUsuario } from "./auth.js";
import { registrarRota, processarRota, navegar } from "./router.js";
import { toast } from "./ui.js";

import { renderInicio } from "./dashboard.js";
import { renderAgenda, abrirFormularioVisita } from "./agenda.js";
import { renderContratos, renderContratoDetalhe } from "./contratos.js";
import { renderAnotacoes, abrirFormularioAnotacao } from "./anotacoes.js";
import { renderTreinamentos, abrirFormularioTreinamento } from "./treinamentos.js";
import { renderDocumentos, abrirFormularioDocumento } from "./documentos.js";
import { renderPendencias, abrirFormularioPendencia } from "./pendencias.js";
import { buscarGlobal } from "./busca.js";
import { getChaveIA, salvarChaveIA } from "./ia.js";
import { mostrarResumoEntrada } from "./notificacoes.js";

/* ===== Tema ===== */
const btnTema = document.getElementById("btn-tema");
function aplicarTema(tema) {
  document.documentElement.dataset.theme = tema;
  localStorage.setItem("inspetor-tema", tema);
  btnTema.textContent = tema === "dark" ? "🌙" : "☀️";
}
aplicarTema(localStorage.getItem("inspetor-tema") || "dark");
btnTema.addEventListener("click", () => {
  aplicarTema(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
});

/* ===== Rotas ===== */
registrarRota("inicio", renderInicio);
registrarRota("agenda", renderAgenda);
registrarRota("contratos", (view, params) => params[0] ? renderContratoDetalhe(view, params[0]) : renderContratos(view));
registrarRota("anotacoes", renderAnotacoes);
registrarRota("treinamentos", renderTreinamentos);
registrarRota("documentos", renderDocumentos);
registrarRota("pendencias", renderPendencias);
registrarRota("configuracoes", renderConfiguracoes);
registrarRota("mais", renderMais);

function renderConfiguracoes(view) {
  const user = getUsuario();
  view.innerHTML = `
    <div class="pagina-header"><div><h1>⚙️ Configurações</h1><p>Preferências pessoais da sua central.</p></div></div>
    <div class="grid grid-cols-2">
      <div class="card">
        <h3>Conta</h3>
        <p>${user?.email || ""}</p>
        <button class="btn btn-perigo btn-sm" id="cfg-logout">Sair da conta</button>
      </div>
      <div class="card">
        <h3>Aparência</h3>
        <p>Alterne entre modo claro e escuro pelo ícone no topo da tela.</p>
      </div>
      <div class="card">
        <h3>Dados</h3>
        <p>Seus dados ficam salvos no Firestore, vinculados exclusivamente à sua conta.</p>
      </div>
      <div class="card">
        <h3>✨ Melhorar textos com IA</h3>
        <p>Cole aqui sua chave gratuita do Google Gemini para habilitar o botão "Melhorar com IA" nos editores de Treinamentos e Anotações. A chave fica salva só neste navegador, nunca é enviada ao Firestore.</p>
        <div class="campo full">
          <input id="cfg-chave-ia" type="password" placeholder="Cole sua chave da API do Gemini" value="${getChaveIA()}">
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" id="cfg-salvar-ia">Salvar chave</button>
          <button class="btn btn-ghost btn-sm" id="cfg-remover-ia">Remover</button>
        </div>
        <p style="margin-top:10px;font-size:12px">Como obter: acesse <strong>aistudio.google.com/apikey</strong>, faça login com sua conta Google e clique em "Create API key". É gratuito, sem cartão de crédito, com cota diária generosa.</p>
      </div>
      <div class="card">
        <h3>Sobre</h3>
        <p>Central do Inspetor v1.0 — organização pessoal de treinamentos e segurança patrimonial.</p>
      </div>
    </div>
  `;
  view.querySelector("#cfg-logout").onclick = async () => { await sair(); };
  view.querySelector("#cfg-salvar-ia").onclick = () => {
    salvarChaveIA(view.querySelector("#cfg-chave-ia").value);
    toast("Chave de IA salva neste navegador.", "sucesso");
  };
  view.querySelector("#cfg-remover-ia").onclick = () => {
    salvarChaveIA("");
    view.querySelector("#cfg-chave-ia").value = "";
    toast("Chave de IA removida.", "sucesso");
  };
}

function renderMais(view) {
  view.innerHTML = `
    <div class="pagina-header"><h1>⋯ Mais</h1></div>
    <div class="lista">
      <a class="item-lista" href="#/anotacoes"><div class="meta"><strong>📝 Anotações</strong></div></a>
      <a class="item-lista" href="#/treinamentos"><div class="meta"><strong>📚 Treinamentos</strong></div></a>
      <a class="item-lista" href="#/documentos"><div class="meta"><strong>📄 Documentos</strong></div></a>
      <a class="item-lista" href="#/configuracoes"><div class="meta"><strong>⚙️ Configurações</strong></div></a>
    </div>
  `;
}

/* ===== Sidebar mobile ===== */
document.getElementById("btn-menu-mobile").addEventListener("click", () => {
  document.getElementById("sidebar").classList.toggle("aberta");
});

/* ===== Logout ===== */
document.getElementById("btn-logout").addEventListener("click", async () => {
  await sair();
});

/* ===== FAB ===== */
const fab = document.getElementById("fab");
const fabMenu = document.getElementById("fab-menu");
const fabOverlay = document.getElementById("fab-overlay");

function alternarFab(abrir) {
  fabMenu.hidden = !abrir;
  fabOverlay.hidden = !abrir;
  fab.textContent = abrir ? "✕" : "➕";
}
fab.addEventListener("click", () => alternarFab(fabMenu.hidden));
fabOverlay.addEventListener("click", () => alternarFab(false));
fabMenu.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-acao]");
  if (!btn) return;
  alternarFab(false);
  const acoes = {
    "nova-visita": abrirFormularioVisita,
    "nova-anotacao": abrirFormularioAnotacao,
    "nova-pendencia": abrirFormularioPendencia,
    "novo-treinamento": abrirFormularioTreinamento,
    "novo-documento": abrirFormularioDocumento,
  };
  acoes[btn.dataset.acao]?.(() => processarRota());
});

/* ===== Busca global ===== */
const inputBusca = document.getElementById("input-busca-global");
const resultadosBusca = document.getElementById("resultados-busca-global");
let debounceBusca;
inputBusca.addEventListener("input", () => {
  clearTimeout(debounceBusca);
  const termo = inputBusca.value.trim();
  if (!termo) { resultadosBusca.hidden = true; return; }
  debounceBusca = setTimeout(async () => {
    const resultados = await buscarGlobal(termo);
    renderizarResultadosBusca(resultados);
  }, 250);
});
document.addEventListener("click", (e) => {
  if (!e.target.closest(".busca-global")) resultadosBusca.hidden = true;
});
function renderizarResultadosBusca(resultados) {
  if (!resultados.length) {
    resultadosBusca.innerHTML = `<div class="vazio">Nenhum resultado encontrado.</div>`;
  } else {
    resultadosBusca.innerHTML = resultados.map((r) => `
      <div class="item-busca" data-rota="${r.rota}">
        <strong>${r.titulo}</strong>
        <small>${r.tipo}${r.subtitulo ? " · " + r.subtitulo : ""}</small>
      </div>
    `).join("");
  }
  resultadosBusca.hidden = false;
  resultadosBusca.querySelectorAll("[data-rota]").forEach((el) => {
    el.addEventListener("click", () => {
      navegar(el.dataset.rota);
      resultadosBusca.hidden = true;
      inputBusca.value = "";
    });
  });
}

/* ===== Login ===== */
const telaLogin = document.getElementById("tela-login");
const appEl = document.getElementById("app");
const formLogin = document.getElementById("form-login");
const loginErro = document.getElementById("login-erro");
let modoCriarConta = false;

document.getElementById("btn-criar-conta").addEventListener("click", () => {
  modoCriarConta = !modoCriarConta;
  document.getElementById("btn-criar-conta").textContent = modoCriarConta ? "Já tenho conta" : "Criar conta";
  formLogin.querySelector('button[type="submit"]').textContent = modoCriarConta ? "Criar conta" : "Entrar";
});

formLogin.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginErro.hidden = true;
  const email = document.getElementById("login-email").value.trim();
  const senha = document.getElementById("login-senha").value;
  try {
    if (modoCriarConta) await criarConta(email, senha);
    else await entrar(email, senha);
  } catch (err) {
    loginErro.textContent = traduzErroAuth(err.code) || "Não foi possível entrar. Verifique os dados.";
    loginErro.hidden = false;
  }
});

function traduzErroAuth(codigo) {
  const mapa = {
    "auth/invalid-email": "E-mail inválido.",
    "auth/user-not-found": "Usuário não encontrado.",
    "auth/wrong-password": "Senha incorreta.",
    "auth/invalid-credential": "E-mail ou senha incorretos.",
    "auth/email-already-in-use": "Este e-mail já está cadastrado.",
    "auth/weak-password": "A senha deve ter ao menos 6 caracteres.",
  };
  return mapa[codigo];
}

aoMudarAuth((user) => {
  if (user) {
    telaLogin.hidden = true;
    appEl.hidden = false;
    document.getElementById("usuario-email").textContent = user.email;
    processarRota();
    mostrarResumoEntrada();
  } else {
    telaLogin.hidden = false;
    appEl.hidden = true;
  }
});

/* ===== Service worker ===== */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
}
