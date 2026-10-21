import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMe } from "../auth/AuthProvider";
import { db } from "../lib/firebase";

export interface CompanyOption {
  id: string;
  nome: string;
  status: string;
}

/**
 * Empresa em foco na tela. Admin geral escolhe (fica na URL: ?empresa=…);
 * demais perfis ficam presos à própria empresa — o backend e as regras garantem isso.
 */
export function useCompanyScope() {
  const me = useMe();
  const isGeral = me.role === "admin_geral";
  const [params, setParams] = useSearchParams();
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [loaded, setLoaded] = useState(false);
  const fromUrl = params.get("empresa");
  const companyId = isGeral ? (fromUrl ?? companies[0]?.id ?? "") : (me.companyId ?? "");

  useEffect(() => {
    if (!isGeral) return;
    getDocs(query(collection(db, "companies"), orderBy("nome"), limit(200)))
      .then((s) => setCompanies(s.docs.map((d) => ({ id: d.id, nome: (d.data().nome as string) ?? d.id, status: d.data().status as string }))))
      .catch(() => setCompanies([]))
      .finally(() => setLoaded(true));
  }, [isGeral]);

  const setCompanyId = (id: string) =>
    setParams((p) => {
      const n = new URLSearchParams(p);
      n.set("empresa", id);
      return n;
    });

  return { isGeral, companyId, setCompanyId, companies, loaded };
}

export function CompanyPicker({
  scope,
  extraOptions = [],
}: {
  scope: ReturnType<typeof useCompanyScope>;
  extraOptions?: { value: string; label: string }[];
}) {
  if (!scope.isGeral) return null;
  return (
    <label>
      Empresa
      <select value={scope.companyId} onChange={(e) => scope.setCompanyId(e.target.value)}>
        {!scope.loaded && <option value={scope.companyId}>Carregando…</option>}
        {scope.loaded && scope.companies.length === 0 && <option value="">Nenhuma empresa cadastrada</option>}
        {scope.companies.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nome}
            {c.status !== "ativa" ? ` (${c.status})` : ""}
          </option>
        ))}
        {extraOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
