import { auth } from "./firebase";

const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    public codigo: string,
    message: string,
    public detalhes?: { campo: string; mensagem: string }[],
  ) {
    super(message);
  }
}

interface Options {
  method?: string;
  body?: unknown;
  /** Para operações que criam registros: mesma chave em reenvios = sem duplicação. */
  idempotencyKey?: string;
}

/**
 * Chamada autenticada ao Worker. Se o backend informar que as permissões
 * mudaram (CLAIMS_DESATUALIZADAS), renova o token uma vez e repete.
 */
export async function api<T>(path: string, opts: Options = {}, retried = false): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new ApiRequestError(401, "NAO_AUTENTICADO", "Faça login para continuar.");
  if (!navigator.onLine) {
    throw new ApiRequestError(0, "OFFLINE", "Sem conexão. A operação não foi enviada ao servidor.");
  }
  const token = await user.getIdToken(retried);
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: opts.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(opts.idempotencyKey ? { "Idempotency-Key": opts.idempotencyKey } : {}),
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  } catch {
    throw new ApiRequestError(0, "REDE", "Falha de conexão com o servidor. Verifique a internet e tente novamente.");
  }
  const data = await res.json().catch(() => null);
  if (res.ok) return data as T;
  const erro = data?.erro ?? {};
  if (erro.codigo === "CLAIMS_DESATUALIZADAS" && !retried) return api<T>(path, opts, true);
  throw new ApiRequestError(res.status, erro.codigo ?? "ERRO", erro.mensagem ?? "Erro inesperado.", erro.detalhes);
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiRequestError) {
    const extra = err.detalhes?.map((d) => d.mensagem).join("; ");
    return extra ? `${err.message} ${extra}` : err.message;
  }
  return "Erro inesperado. Tente novamente.";
}
