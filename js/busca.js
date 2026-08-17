import { listarTudo } from "./db.js";

export async function buscarGlobal(termo) {
  const t = termo.toLowerCase();
  const [contratos, anotacoes, treinamentos, documentos, pendencias, agenda] = await Promise.all([
    listarTudo("contratos", "nome").catch(() => []),
    listarTudo("anotacoes", "criadoEm").catch(() => []),
    listarTudo("treinamentos", "criadoEm").catch(() => []),
    listarTudo("documentos", "criadoEm").catch(() => []),
    listarTudo("pendencias", "prazo").catch(() => []),
    listarTudo("agenda", "data").catch(() => []),
  ]);

  const resultados = [];

  contratos.filter((c) => `${c.nome} ${c.endereco || ""}`.toLowerCase().includes(t))
    .forEach((c) => resultados.push({ tipo: "Contrato", titulo: c.nome, subtitulo: c.endereco, rota: `contratos/${c.id}` }));

  anotacoes.filter((a) => `${a.titulo} ${a.texto || ""} ${a.tags || ""}`.toLowerCase().includes(t))
    .forEach((a) => resultados.push({ tipo: "Anotação", titulo: a.titulo, subtitulo: a.categoria, rota: "anotacoes" }));

  treinamentos.filter((tr) => `${tr.titulo} ${tr.conteudo || ""} ${tr.tags || ""}`.toLowerCase().includes(t))
    .forEach((tr) => resultados.push({ tipo: "Treinamento", titulo: tr.titulo, subtitulo: tr.categoria, rota: "treinamentos" }));

  documentos.filter((d) => `${d.nome} ${d.conteudo || ""}`.toLowerCase().includes(t))
    .forEach((d) => resultados.push({ tipo: "Documento", titulo: d.nome, subtitulo: d.categoria, rota: "documentos" }));

  pendencias.filter((p) => `${p.titulo} ${p.descricao || ""}`.toLowerCase().includes(t))
    .forEach((p) => resultados.push({ tipo: "Pendência", titulo: p.titulo, subtitulo: p.status, rota: "pendencias" }));

  agenda.filter((e) => `${e.titulo || ""} ${e.tipo || ""} ${e.contratoNome || ""}`.toLowerCase().includes(t))
    .forEach((e) => resultados.push({ tipo: "Agenda", titulo: e.titulo || e.tipo, subtitulo: e.contratoNome, rota: "agenda" }));

  return resultados.slice(0, 30);
}
