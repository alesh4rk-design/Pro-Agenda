export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly codigo: string,
    mensagem: string,
    public readonly detalhes?: unknown,
  ) {
    super(mensagem);
  }
}

export const MAX_BODY_BYTES = 32 * 1024;

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers },
  });
}

export function errorResponse(err: ApiError, requestId: string): Response {
  return json(
    { erro: { codigo: err.codigo, mensagem: err.message, detalhes: err.detalhes }, requestId },
    err.status,
  );
}

export async function readJson(request: Request): Promise<unknown> {
  const type = request.headers.get("Content-Type") ?? "";
  if (!type.toLowerCase().startsWith("application/json")) {
    throw new ApiError(415, "TIPO_INVALIDO", "Envie o corpo em JSON.");
  }
  const declared = Number(request.headers.get("Content-Length") ?? "0");
  if (declared > MAX_BODY_BYTES) throw new ApiError(413, "CORPO_GRANDE", "Requisição muito grande.");
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    throw new ApiError(413, "CORPO_GRANDE", "Requisição muito grande.");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(400, "JSON_INVALIDO", "Corpo da requisição inválido.");
  }
}

export function corsHeaders(request: Request, allowedOrigins: string): Record<string, string> {
  const origin = request.headers.get("Origin");
  const allowed = allowedOrigins.split(",").map((o) => o.trim()).filter(Boolean);
  const headers: Record<string, string> = { Vary: "Origin" };
  if (origin && allowed.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type, Idempotency-Key";
    headers["Access-Control-Expose-Headers"] = "X-Request-Id, Idempotent-Replay";
    headers["Access-Control-Max-Age"] = "600";
  }
  return headers;
}
