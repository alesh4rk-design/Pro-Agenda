const OK = new Set(["ativa", "ativo", "operando"]);

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return <span className={`badge ${OK.has(status) ? "badge-ok" : "badge-danger"}`}>{label ?? status}</span>;
}

/**
 * Pergunta o motivo de uma mudança de status. Retorna null se cancelado.
 * O motivo é obrigatório para bloquear/suspender/encerrar (fica na auditoria).
 */
export function askMotivo(acao: string, nome: string, obrigatorio: boolean): string | null {
  for (;;) {
    const m = window.prompt(`Motivo para ${acao} “${nome}”${obrigatorio ? " (obrigatório)" : " (opcional)"}:`);
    if (m === null) return null;
    if (m.trim() || !obrigatorio) return m.trim();
  }
}
