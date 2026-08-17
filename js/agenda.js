import { listarTudo, criar, atualizar, remover } from "./db.js";
import { abrirModal, fecharModal, confirmar, toast, formatarData, escaparHtml } from "./ui.js";

const TIPOS = ["Inspeção", "Treinamento", "Implantação", "Análise de segurança", "Reunião", "Acompanhamento", "Visita técnica", "Outro"];
const STATUS = ["Agendado", "Em andamento", "Realizado", "Cancelado"];
const PRIORIDADES = ["Baixa", "Média", "Alta", "Urgente"];

let visaoAtual = "lista";
let dataRef = new Date();

export async function renderAgenda(view) {
  const [eventos, contratos] = await Promise.all([
    listarTudo("agenda", "data").catch(() => []),
    listarTudo("contratos", "nome").catch(() => []),
  ]);

  view.innerHTML = `
    <div class="pagina-header">
      <div><h1>📅 Agenda</h1><p>Visitas, treinamentos e compromissos.</p></div>
      <button class="btn btn-primary" id="btn-novo-evento">+ Novo evento</button>
    </div>
    <div class="agenda-toolbar">
      <div class="agenda-views">
        <button data-v="dia">Hoje</button>
        <button data-v="semana">Semana</button>
        <button data-v="mes">Mês</button>
        <button data-v="lista">Lista</button>
      </div>
    </div>
    <div id="agenda-corpo"></div>
  `;

  view.querySelector("#btn-novo-evento").onclick = () => abrirFormularioVisita(() => renderAgenda(view), contratos);
  view.querySelectorAll(".agenda-views button").forEach((b) => {
    b.classList.toggle("ativa", b.dataset.v === visaoAtual);
    b.onclick = () => { visaoAtual = b.dataset.v; renderAgenda(view); };
  });

  const corpo = view.querySelector("#agenda-corpo");
  const hoje = new Date().toISOString().slice(0, 10);
  const ordenados = [...eventos].sort((a, b) => (a.data + (a.horario || "")).localeCompare(b.data + (b.horario || "")));

  if (visaoAtual === "lista") {
    corpo.innerHTML = renderListaEventos(ordenados, contratos);
  } else if (visaoAtual === "dia") {
    corpo.innerHTML = renderListaEventos(ordenados.filter((e) => e.data === hoje), contratos, "Nenhum evento hoje.");
  } else if (visaoAtual === "semana") {
    const inicio = new Date(); inicio.setDate(inicio.getDate() - inicio.getDay());
    const fim = new Date(inicio); fim.setDate(fim.getDate() + 6);
    const iIso = inicio.toISOString().slice(0, 10), fIso = fim.toISOString().slice(0, 10);
    corpo.innerHTML = renderListaEventos(ordenados.filter((e) => e.data >= iIso && e.data <= fIso), contratos, "Nenhum evento esta semana.");
  } else if (visaoAtual === "mes") {
    corpo.innerHTML = renderMes(ordenados, dataRef);
  }

  corpo.querySelectorAll("[data-editar]").forEach((el) => {
    el.addEventListener("click", () => {
      const ev = eventos.find((e) => e.id === el.dataset.editar);
      abrirFormularioVisita(() => renderAgenda(view), contratos, ev);
    });
  });
}

function renderListaEventos(lista, contratos, msgVazio = "Nenhum evento encontrado.") {
  if (!lista.length) return `<div class="vazio-estado"><span class="icone">📅</span>${msgVazio}</div>`;
  return `<div class="dia-lista">${lista.map((e) => `
    <div class="evento-item prioridade-${(e.prioridade || "baixa").toLowerCase()}" data-editar="${e.id}">
      <div class="hora">${e.horario || "—"}</div>
      <div class="meta" style="flex:1">
        <strong>${escaparHtml(e.titulo || e.tipo)}</strong>
        <small>${formatarData(e.data)} · ${e.contratoNome || "Sem contrato"} · ${e.tipo}</small>
      </div>
      <span class="badge ${badgeStatus(e.status)}">${e.status}</span>
    </div>
  `).join("")}</div>`;
}

function badgeStatus(s) {
  return { "Realizado": "badge-sucesso", "Cancelado": "badge-perigo", "Em andamento": "badge-alerta" }[s] || "badge-info";
}

function renderMes(eventos, ref) {
  const ano = ref.getFullYear(), mes = ref.getMonth();
  const primeiroDia = new Date(ano, mes, 1);
  const inicioGrade = new Date(primeiroDia); inicioGrade.setDate(1 - primeiroDia.getDay());
  const hojeIso = new Date().toISOString().slice(0, 10);
  const dias = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(inicioGrade); d.setDate(inicioGrade.getDate() + i);
    dias.push(d);
  }
  const cabecalho = ["D", "S", "T", "Q", "Q", "S", "S"].map((d) => `<div class="mes-dia-cabecalho">${d}</div>`).join("");
  const celulas = dias.map((d) => {
    const iso = d.toISOString().slice(0, 10);
    const doMes = d.getMonth() === mes;
    const evsDia = eventos.filter((e) => e.data === iso);
    return `<div class="mes-dia ${doMes ? "" : "fora"} ${iso === hojeIso ? "hoje" : ""} ${evsDia.length ? "tem-evento" : ""}">
      <div class="num">${d.getDate()}</div>
      ${evsDia.slice(0, 3).map((e) => `<div class="evento-chip" data-editar="${e.id}">${escaparHtml(e.titulo || e.tipo)}</div>`).join("")}
    </div>`;
  }).join("");
  return `<div class="mes-grid">${cabecalho}${celulas}</div>`;
}

export function abrirFormularioVisita(aoSalvar, contratosParam, eventoEditar) {
  (async () => {
    const contratos = contratosParam || await listarTudo("contratos", "nome").catch(() => []);
    const ev = eventoEditar || {};
    abrirModal({
      titulo: eventoEditar ? "Editar evento" : "Novo evento na agenda",
      tamanho: "grande",
      corpoHtml: `
        <form id="form-evento">
          <div class="form-grid">
            <div class="campo full"><label>Título</label><input name="titulo" required value="${escaparHtml(ev.titulo || "")}"></div>
            <div class="campo">
              <label>Contrato</label>
              <select name="contratoId">
                <option value="">Sem contrato</option>
                ${contratos.map((c) => `<option value="${c.id}" ${ev.contratoId === c.id ? "selected" : ""}>${escaparHtml(c.nome)}</option>`).join("")}
              </select>
            </div>
            <div class="campo"><label>Tipo de atividade</label>
              <select name="tipo">${TIPOS.map((t) => `<option ${ev.tipo === t ? "selected" : ""}>${t}</option>`).join("")}</select>
            </div>
            <div class="campo"><label>Data</label><input type="date" name="data" required value="${ev.data || new Date().toISOString().slice(0, 10)}"></div>
            <div class="campo"><label>Horário</label><input type="time" name="horario" value="${ev.horario || ""}"></div>
            <div class="campo full"><label>Endereço</label><input name="endereco" value="${escaparHtml(ev.endereco || "")}"></div>
            <div class="campo"><label>Status</label>
              <select name="status">${STATUS.map((s) => `<option ${ev.status === s ? "selected" : ""}>${s}</option>`).join("")}</select>
            </div>
            <div class="campo"><label>Prioridade</label>
              <select name="prioridade">${PRIORIDADES.map((p) => `<option ${ev.prioridade === p ? "selected" : ""}>${p}</option>`).join("")}</select>
            </div>
            <div class="campo full"><label>Objetivo</label><textarea name="objetivo">${escaparHtml(ev.objetivo || "")}</textarea></div>
            <div class="campo full"><label>Observações</label><textarea name="observacoes">${escaparHtml(ev.observacoes || "")}</textarea></div>
          </div>
          <div class="modal-footer">
            ${eventoEditar ? '<button type="button" class="btn btn-perigo" id="btn-excluir-evento">Excluir</button>' : ""}
            <button type="button" class="btn btn-ghost" data-fechar>Cancelar</button>
            <button type="submit" class="btn btn-primary">Salvar</button>
          </div>
        </form>
      `,
      aoMontar: (overlay) => {
        const form = overlay.querySelector("#form-evento");
        form.addEventListener("submit", async (e) => {
          e.preventDefault();
          const fd = new FormData(form);
          const contratoId = fd.get("contratoId");
          const contratoNome = contratos.find((c) => c.id === contratoId)?.nome || "";
          const dados = Object.fromEntries(fd.entries());
          dados.contratoNome = contratoNome;
          try {
            if (eventoEditar) await atualizar("agenda", eventoEditar.id, dados);
            else await criar("agenda", dados);
            toast("Evento salvo com sucesso.", "sucesso");
            fecharModal();
            aoSalvar?.();
          } catch (err) {
            toast(err.message, "erro");
          }
        });
        overlay.querySelector("#btn-excluir-evento")?.addEventListener("click", async () => {
          if (await confirmar("Excluir este evento da agenda?")) {
            await remover("agenda", eventoEditar.id);
            toast("Evento excluído.", "sucesso");
            fecharModal();
            aoSalvar?.();
          }
        });
      }
    });
  })();
}
