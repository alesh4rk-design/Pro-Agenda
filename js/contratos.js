import { listarTudo, criar, atualizar, remover, buscarPorId } from "./db.js";
import { abrirModal, fecharModal, confirmar, toast, formatarData, escaparHtml } from "./ui.js";
import { navegar } from "./router.js";
import { listarVisitasDoContrato, renderTimelineVisitas, abrirFormularioVisitaHistorico } from "./visitas.js";

export async function renderContratos(view) {
  const contratos = await listarTudo("contratos", "nome").catch(() => []);
  view.innerHTML = `
    <div class="pagina-header">
      <div><h1>🏢 Contratos</h1><p>Postos e condomínios sob sua responsabilidade.</p></div>
      <button class="btn btn-primary" id="btn-novo-contrato">+ Novo contrato</button>
    </div>
    ${contratos.length ? `<div class="grid grid-cols-3">${contratos.map(cardContrato).join("")}</div>` :
      `<div class="vazio-estado"><span class="icone">🏢</span>Nenhum contrato cadastrado ainda.<br><button class="btn btn-primary" style="margin-top:14px" id="btn-novo-contrato-2">+ Cadastrar contrato</button></div>`}
  `;
  view.querySelector("#btn-novo-contrato").onclick = () => abrirFormularioContrato(() => renderContratos(view));
  view.querySelector("#btn-novo-contrato-2")?.addEventListener("click", () => abrirFormularioContrato(() => renderContratos(view)));
  view.querySelectorAll("[data-contrato]").forEach((el) => {
    el.addEventListener("click", () => navegar(`contratos/${el.dataset.contrato}`));
  });
}

function cardContrato(c) {
  return `
    <div class="card card-clicavel contrato-card" data-contrato="${c.id}">
      <div class="nome">${escaparHtml(c.nome)}</div>
      <div class="endereco">${escaparHtml(c.endereco || "Endereço não informado")}</div>
      <div class="linha-info"><span>Postos</span><strong>${c.qtdPostos || 0}</strong></div>
      <div class="linha-info"><span>Colaboradores</span><strong>${c.qtdColaboradores || 0}</strong></div>
      <div class="linha-info"><span>Próxima visita</span><strong>${c.proximaVisita ? formatarData(c.proximaVisita) : "—"}</strong></div>
    </div>
  `;
}

const ABAS = ["Informações", "Postos", "Visitas", "Pendências", "Documentos", "Treinamentos"];

export async function renderContratoDetalhe(view, id) {
  const contrato = await buscarPorId("contratos", id);
  if (!contrato) { view.innerHTML = `<div class="vazio-estado">Contrato não encontrado.</div>`; return; }

  let abaAtiva = "Informações";

  async function desenhar() {
    view.innerHTML = `
      <button class="btn btn-ghost btn-sm" id="btn-voltar" style="margin-bottom:12px">← Contratos</button>
      <div class="contrato-detalhe-header">
        <div><h1>${escaparHtml(contrato.nome)}</h1><p>${escaparHtml(contrato.endereco || "")}</p></div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-secundario btn-sm" id="btn-editar-contrato">Editar</button>
          <button class="btn btn-perigo btn-sm" id="btn-excluir-contrato">Excluir</button>
        </div>
      </div>
      <div class="tabs">${ABAS.map((a) => `<button data-aba="${a}" class="${a === abaAtiva ? "ativa" : ""}">${a}</button>`).join("")}</div>
      <div id="aba-corpo"></div>
    `;
    view.querySelector("#btn-voltar").onclick = () => navegar("contratos");
    view.querySelector("#btn-editar-contrato").onclick = () => abrirFormularioContrato(desenhar, contrato);
    view.querySelector("#btn-excluir-contrato").onclick = async () => {
      if (await confirmar(`Excluir o contrato "${contrato.nome}"? Esta ação não pode ser desfeita.`)) {
        await remover("contratos", contrato.id);
        toast("Contrato excluído.", "sucesso");
        navegar("contratos");
      }
    };
    view.querySelectorAll("[data-aba]").forEach((b) => b.onclick = () => { abaAtiva = b.dataset.aba; desenhar(); });
    await desenharAba();
  }

  async function desenharAba() {
    const corpo = view.querySelector("#aba-corpo");
    if (abaAtiva === "Informações") {
      const contatos = contrato.contatos || [];
      corpo.innerHTML = `
        <div class="grid grid-cols-2">
          <div class="card"><h3>Dados gerais</h3>
            ${linha("Telefone geral", contrato.telefone)}
            ${linha("E-mail geral", contrato.email)}
          </div>
          <div class="card"><h3>Operação</h3>
            ${linha("Qtd. de postos", contrato.qtdPostos)}
            ${linha("Qtd. de colaboradores", contrato.qtdColaboradores)}
            ${linha("Implantação", contrato.dataImplantacao ? formatarData(contrato.dataImplantacao) : "—")}
            ${linha("Última visita", contrato.ultimaVisita ? formatarData(contrato.ultimaVisita) : "—")}
            ${linha("Próxima visita", contrato.proximaVisita ? formatarData(contrato.proximaVisita) : "—")}
          </div>
          <div class="card" style="grid-column:1/-1">
            <div class="card-header"><h3>Contatos</h3><button class="btn btn-primary btn-sm" id="btn-add-contato">+ Adicionar contato</button></div>
            <p style="font-size:12px;margin-top:-6px">Cadastre livremente os cargos envolvidos no contrato (síndico, zelador, concierge, supervisor orgânico, etc.).</p>
            <div class="postos-lista">
              ${contatos.length ? contatos.map((ct, i) => `
                <div class="posto-item">
                  <span><span class="badge badge-info">${escaparHtml(ct.cargo)}</span> &nbsp;${escaparHtml(ct.nome || "")}${ct.telefone ? " · " + escaparHtml(ct.telefone) : ""}</span>
                  <div style="display:flex;gap:6px">
                    <button class="btn btn-ghost btn-sm" data-editar-contato="${i}">Editar</button>
                    <button class="btn btn-ghost btn-sm" data-remover-contato="${i}">Remover</button>
                  </div>
                </div>
              `).join("") : `<div class="vazio-estado">Nenhum contato cadastrado.</div>`}
            </div>
          </div>
          <div class="card full" style="grid-column:1/-1"><h3>Observações</h3><p>${escaparHtml(contrato.observacoes || "Nenhuma observação.")}</p></div>
        </div>
      `;
      corpo.querySelector("#btn-add-contato").onclick = () => abrirFormularioContato(contrato, contatos, desenharAba);
      corpo.querySelectorAll("[data-editar-contato]").forEach((b) => b.onclick = () => abrirFormularioContato(contrato, contatos, desenharAba, Number(b.dataset.editarContato)));
      corpo.querySelectorAll("[data-remover-contato]").forEach((b) => b.onclick = async () => {
        const novos = contatos.filter((_, i) => i !== Number(b.dataset.removerContato));
        await atualizar("contratos", contrato.id, { contatos: novos });
        contrato.contatos = novos;
        desenharAba();
      });
    } else if (abaAtiva === "Postos") {
      const postos = contrato.postos || [];
      corpo.innerHTML = `
        <div class="card-header"><h3>Postos do contrato</h3><button class="btn btn-primary btn-sm" id="btn-add-posto">+ Adicionar posto</button></div>
        <div class="postos-lista">
          ${postos.length ? postos.map((p, i) => `
            <div class="posto-item"><span>${escaparHtml(p)}</span><button class="btn btn-ghost btn-sm" data-remover-posto="${i}">Remover</button></div>
          `).join("") : `<div class="vazio-estado">Nenhum posto cadastrado.</div>`}
        </div>
      `;
      corpo.querySelector("#btn-add-posto").onclick = async () => {
        const nome = prompt("Nome do posto (ex: Portaria principal, CFTV, Ronda...)");
        if (!nome) return;
        const novos = [...postos, nome];
        await atualizar("contratos", contrato.id, { postos: novos });
        contrato.postos = novos;
        desenharAba();
      };
      corpo.querySelectorAll("[data-remover-posto]").forEach((b) => b.onclick = async () => {
        const novos = postos.filter((_, i) => i !== Number(b.dataset.removerPosto));
        await atualizar("contratos", contrato.id, { postos: novos });
        contrato.postos = novos;
        desenharAba();
      });
    } else if (abaAtiva === "Visitas") {
      const visitas = await listarVisitasDoContrato(contrato.id);
      corpo.innerHTML = `
        <div class="card-header"><h3>Histórico de visitas</h3><button class="btn btn-primary btn-sm" id="btn-add-visita">+ Registrar visita</button></div>
        <div class="card">${renderTimelineVisitas(visitas)}</div>
      `;
      corpo.querySelector("#btn-add-visita").onclick = () => abrirFormularioVisitaHistorico(contrato, desenharAba);
      corpo.querySelectorAll("[data-editar-visita]").forEach((el) => {
        el.onclick = () => abrirFormularioVisitaHistorico(contrato, desenharAba, visitas.find((v) => v.id === el.dataset.editarVisita));
      });
    } else if (abaAtiva === "Pendências") {
      const pendencias = (await listarTudo("pendencias", "prazo").catch(() => [])).filter((p) => p.contratoId === contrato.id);
      corpo.innerHTML = listaSimples(pendencias, (p) => `${escaparHtml(p.titulo)}`, (p) => `${p.status} · prazo ${p.prazo ? formatarData(p.prazo) : "—"}`, "Nenhuma pendência para este contrato.");
    } else if (abaAtiva === "Documentos") {
      const documentos = (await listarTudo("documentos", "criadoEm").catch(() => [])).filter((d) => d.contratoId === contrato.id);
      corpo.innerHTML = listaSimples(documentos, (d) => escaparHtml(d.nome), (d) => `${d.categoria} · ${formatarData(d.data)}`, "Nenhum documento vinculado.");
    } else if (abaAtiva === "Treinamentos") {
      const treinamentos = (await listarTudo("treinamentos", "criadoEm").catch(() => [])).filter((t) => (t.contratos || "").includes(contrato.nome));
      corpo.innerHTML = listaSimples(treinamentos, (t) => escaparHtml(t.titulo), (t) => t.categoria, "Nenhum treinamento vinculado a este contrato ainda.");
    }
  }

  await desenhar();
}

function linha(rotulo, valor) {
  return `<div class="linha-info"><span>${rotulo}</span><strong>${escaparHtml(String(valor ?? "—")) || "—"}</strong></div>`;
}

function listaSimples(itens, titulo, sub, vazio) {
  if (!itens.length) return `<div class="vazio-estado">${vazio}</div>`;
  return `<div class="lista">${itens.map((i) => `
    <div class="item-lista"><div class="meta"><strong>${titulo(i)}</strong><small>${sub(i)}</small></div></div>
  `).join("")}</div>`;
}

async function sugestoesDeCargos() {
  const contratos = await listarTudo("contratos", "nome").catch(() => []);
  const cargos = contratos.flatMap((c) => (c.contatos || []).map((ct) => ct.cargo)).filter(Boolean);
  return [...new Set(cargos)];
}

async function abrirFormularioContato(contrato, contatos, aoSalvar, indiceEditar) {
  const ct = indiceEditar != null ? contatos[indiceEditar] : {};
  const sugestoes = await sugestoesDeCargos();
  abrirModal({
    titulo: indiceEditar != null ? "Editar contato" : "Novo contato",
    corpoHtml: `
      <form id="form-contato">
        <div class="campo full">
          <label>Cargo (digite livremente: síndico, zelador, concierge, supervisor orgânico...)</label>
          <input name="cargo" list="lista-cargos" required value="${escaparHtml(ct.cargo || "")}">
          <datalist id="lista-cargos">${sugestoes.map((s) => `<option value="${escaparHtml(s)}">`).join("")}</datalist>
        </div>
        <div class="campo full"><label>Nome</label><input name="nome" value="${escaparHtml(ct.nome || "")}"></div>
        <div class="campo full"><label>Telefone</label><input name="telefone" value="${escaparHtml(ct.telefone || "")}"></div>
        <div class="modal-footer">
          <button type="button" class="btn btn-ghost" data-fechar>Cancelar</button>
          <button type="submit" class="btn btn-primary">Salvar</button>
        </div>
      </form>
    `,
    aoMontar: (overlay) => {
      overlay.querySelector("#form-contato").addEventListener("submit", async (e) => {
        e.preventDefault();
        const dados = Object.fromEntries(new FormData(e.target).entries());
        const novos = [...contatos];
        if (indiceEditar != null) novos[indiceEditar] = dados;
        else novos.push(dados);
        await atualizar("contratos", contrato.id, { contatos: novos });
        contrato.contatos = novos;
        toast("Contato salvo.", "sucesso");
        fecharModal();
        aoSalvar?.();
      });
    }
  });
}

export function abrirFormularioContrato(aoSalvar, contratoEditar) {
  const c = contratoEditar || {};
  abrirModal({
    titulo: contratoEditar ? "Editar contrato" : "Novo contrato",
    tamanho: "grande",
    corpoHtml: `
      <form id="form-contrato">
        <div class="form-grid">
          <div class="campo full"><label>Nome do condomínio/empresa</label><input name="nome" required value="${escaparHtml(c.nome || "")}"></div>
          <div class="campo full"><label>Endereço</label><input name="endereco" value="${escaparHtml(c.endereco || "")}"></div>
          <div class="campo"><label>Telefone geral</label><input name="telefone" value="${escaparHtml(c.telefone || "")}"></div>
          <div class="campo"><label>E-mail geral</label><input type="email" name="email" value="${escaparHtml(c.email || "")}"></div>
          <div class="campo"><label>Qtd. de postos</label><input type="number" min="0" name="qtdPostos" value="${c.qtdPostos ?? ""}"></div>
          <div class="campo"><label>Qtd. de colaboradores</label><input type="number" min="0" name="qtdColaboradores" value="${c.qtdColaboradores ?? ""}"></div>
          <div class="campo"><label>Data da implantação</label><input type="date" name="dataImplantacao" value="${c.dataImplantacao || ""}"></div>
          <div class="campo"><label>Última visita</label><input type="date" name="ultimaVisita" value="${c.ultimaVisita || ""}"></div>
          <div class="campo"><label>Próxima visita</label><input type="date" name="proximaVisita" value="${c.proximaVisita || ""}"></div>
          <div class="campo full"><label>Observações</label><textarea name="observacoes">${escaparHtml(c.observacoes || "")}</textarea></div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-ghost" data-fechar>Cancelar</button>
          <button type="submit" class="btn btn-primary">Salvar</button>
        </div>
      </form>
    `,
    aoMontar: (overlay) => {
      overlay.querySelector("#form-contrato").addEventListener("submit", async (e) => {
        e.preventDefault();
        const dados = Object.fromEntries(new FormData(e.target).entries());
        dados.qtdPostos = Number(dados.qtdPostos) || 0;
        dados.qtdColaboradores = Number(dados.qtdColaboradores) || 0;
        if (!contratoEditar) { dados.postos = []; dados.contatos = []; }
        try {
          if (contratoEditar) await atualizar("contratos", contratoEditar.id, dados);
          else await criar("contratos", dados);
          toast("Contrato salvo.", "sucesso");
          fecharModal();
          aoSalvar?.();
        } catch (err) { toast(err.message, "erro"); }
      });
    }
  });
}
