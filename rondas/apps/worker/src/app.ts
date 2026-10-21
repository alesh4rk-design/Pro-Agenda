import { bearerToken, loadActor } from "./auth.js";
import type { Ctx, Deps } from "./context.js";
import { ApiError, corsHeaders, errorResponse, json } from "./http.js";
import { allow } from "./rateLimit.js";
import { putSystemConfig } from "./routes/config.js";
import { getMe } from "./routes/me.js";
import { createUser, resetPostoPassword, updateUser } from "./routes/users.js";

type Handler = (ctx: Ctx) => Promise<Response>;
interface Route {
  method: string;
  pattern: RegExp;
  keys: string[];
  handler: Handler;
}

function route(method: string, path: string, handler: Handler): Route {
  const keys: string[] = [];
  const pattern = new RegExp(
    "^" + path.replace(/:([a-zA-Z]+)/g, (_, k: string) => (keys.push(k), "([A-Za-z0-9_-]{1,128})")) + "$",
  );
  return { method, pattern, keys, handler };
}

const ROUTES: Route[] = [
  route("GET", "/v1/me", getMe),
  route("PUT", "/v1/config/sistema", putSystemConfig),
  route("POST", "/v1/users", createUser),
  route("PATCH", "/v1/users/:uid", updateUser),
  route("POST", "/v1/users/:uid/senha", resetPostoPassword),
];

/** Limites por usuário/minuto (por isolate). */
const READ_LIMIT = 120;
const WRITE_LIMIT = 30;

export function createApp(deps: Deps, opts: { allowedOrigins: string; environment: string }) {
  return async function handle(request: Request): Promise<Response> {
    const requestId = deps.newId();
    const cors = corsHeaders(request, opts.allowedOrigins);
    const withHeaders = (res: Response) => {
      const out = new Response(res.body, res);
      for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);
      out.headers.set("X-Request-Id", requestId);
      out.headers.set("X-Content-Type-Options", "nosniff");
      return out;
    };

    if (request.method === "OPTIONS") return withHeaders(new Response(null, { status: 204 }));

    const url = new URL(request.url);
    try {
      if (request.method === "GET" && url.pathname === "/v1/health") {
        return withHeaders(json({ ok: true, ambiente: opts.environment }));
      }

      const candidates = ROUTES.filter((r) => r.pattern.test(url.pathname));
      if (candidates.length === 0) throw new ApiError(404, "ROTA_INEXISTENTE", "Rota não encontrada.");
      const r = candidates.find((c) => c.method === request.method);
      if (!r) throw new ApiError(405, "METODO_NAO_PERMITIDO", "Método não permitido.");

      const token = await deps.verifyToken(bearerToken(request));
      const isWrite = request.method !== "GET";
      if (!allow(`${token.uid}:${isWrite ? "w" : "r"}`, isWrite ? WRITE_LIMIT : READ_LIMIT, 60_000)) {
        throw new ApiError(429, "LIMITE_EXCEDIDO", "Muitas requisições. Aguarde um minuto.");
      }
      const actor = await loadActor(deps.db, token);

      const match = r.pattern.exec(url.pathname)!;
      const params = Object.fromEntries(r.keys.map((k, i) => [k, match[i + 1]!]));
      return withHeaders(await r.handler({ deps, request, requestId, actor, params }));
    } catch (err) {
      if (err instanceof ApiError) return withHeaders(errorResponse(err, requestId));
      console.error(JSON.stringify({ requestId, erro: String(err), stack: (err as Error)?.stack }));
      return withHeaders(
        errorResponse(new ApiError(500, "ERRO_INTERNO", "Erro interno. Tente novamente em instantes."), requestId),
      );
    }
  };
}
