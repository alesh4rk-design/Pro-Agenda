import { type User, onAuthStateChanged, signOut } from "firebase/auth";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";
import type { Permission, Role, SupervisorFuncao } from "@rondas/shared";
import { ApiRequestError, api, errorMessage } from "../lib/api";
import { auth } from "../lib/firebase";

export interface Me {
  uid: string;
  nome: string;
  email: string;
  login: string | null;
  role: Role;
  funcao: SupervisorFuncao | null;
  companyId: string | null;
  postIds: string[];
  contractIds: string[];
  permissions: Permission[];
  assignableRoles: Role[];
}

type State =
  | { status: "carregando" }
  | { status: "anonimo" }
  | { status: "autenticado"; user: User; me: Me }
  /** Logado no Firebase, mas o backend negou acesso (bloqueado, sem perfil, offline…). */
  | { status: "negado"; user: User; motivo: string; codigo: string };

interface AuthCtx {
  state: State;
  reload: () => Promise<void>;
  logout: () => Promise<void>;
  can: (p: Permission) => boolean;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: "carregando" });

  const load = useCallback(async (user: User | null) => {
    if (!user) return setState({ status: "anonimo" });
    try {
      const me = await api<Me>("/v1/me");
      setState({ status: "autenticado", user, me });
    } catch (err) {
      const codigo = err instanceof ApiRequestError ? err.codigo : "ERRO";
      setState({ status: "negado", user, motivo: errorMessage(err), codigo });
    }
  }, []);

  useEffect(() => onAuthStateChanged(auth, (u) => void load(u)), [load]);

  const value: AuthCtx = {
    state,
    reload: () => load(auth.currentUser),
    logout: () => signOut(auth),
    can: (p) => state.status === "autenticado" && state.me.permissions.includes(p),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth fora do AuthProvider");
  return c;
}

/** Atalho para telas que só existem para usuários autenticados. */
export function useMe(): Me {
  const { state } = useAuth();
  if (state.status !== "autenticado") throw new Error("Usuário não autenticado");
  return state.me;
}
