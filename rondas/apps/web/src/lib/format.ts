/** "2026-03-01" → "01/03/2026" (sem conversão de fuso: é uma data civil). */
export function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

export const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function formatDias(dias: number[]): string {
  if (dias.length === 7) return "Todos os dias";
  if (dias.join() === "1,2,3,4,5") return "Segunda a sexta";
  return dias.map((d) => DIAS_SEMANA[d]).join(", ");
}

/** Data de hoje (YYYY-MM-DD) no fuso informado. */
export function todayIn(timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
