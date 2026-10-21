/**
 * Cliente mínimo da API REST do Firestore (v1), usado pelo Worker com a conta de
 * serviço. O Admin SDK não roda no runtime dos Workers, por isso o REST.
 *
 * O backend ignora as regras de segurança (acesso administrativo); por isso toda
 * rota valida permissões ANTES de chamar este cliente.
 */

export type DocData = Record<string, unknown>;

export type Write =
  /** Cria; falha com PreconditionFailed se já existir (base da idempotência). */
  | { op: "create"; path: string; data: DocData }
  /** Cria ou substitui. */
  | { op: "set"; path: string; data: DocData }
  /** Altera só os campos informados; falha se o documento não existir. */
  | { op: "update"; path: string; data: DocData }
  | { op: "delete"; path: string };

export interface QueryFilter {
  field: string;
  op: "EQUAL" | "ARRAY_CONTAINS" | "IN" | "LESS_THAN" | "GREATER_THAN_OR_EQUAL";
  value: unknown;
}

export interface FirestoreClient {
  getDoc(path: string): Promise<DocData | null>;
  /** Escritas atômicas: todas ou nenhuma. */
  commit(writes: Write[]): Promise<void>;
  query(collection: string, filters: QueryFilter[], limit: number): Promise<{ id: string; data: DocData }[]>;
}

export class PreconditionFailed extends Error {}

// ------------------------------------------------------------- codificação

type Value =
  | { nullValue: null }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { timestampValue: string }
  | { stringValue: string }
  | { arrayValue: { values?: Value[] } }
  | { mapValue: { fields?: Record<string, Value> } };

export function encodeValue(v: unknown): Value {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "string") return { stringValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encodeValue) } };
  if (typeof v === "object") return { mapValue: { fields: encodeFields(v as DocData) } };
  throw new Error(`Tipo não suportado: ${typeof v}`);
}

export function encodeFields(data: DocData): Record<string, Value> {
  const out: Record<string, Value> = {};
  for (const [k, v] of Object.entries(data)) if (v !== undefined) out[k] = encodeValue(v);
  return out;
}

export function decodeValue(v: Value): unknown {
  if ("nullValue" in v) return null;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("timestampValue" in v) return new Date(v.timestampValue);
  if ("stringValue" in v) return v.stringValue;
  if ("arrayValue" in v) return (v.arrayValue.values ?? []).map(decodeValue);
  if ("mapValue" in v) return decodeFields(v.mapValue.fields ?? {});
  return null;
}

export function decodeFields(fields: Record<string, Value>): DocData {
  const out: DocData = {};
  for (const [k, v] of Object.entries(fields)) out[k] = decodeValue(v);
  return out;
}

// ------------------------------------------------------------- cliente REST

export interface RestOptions {
  projectId: string;
  /** "127.0.0.1:8080" para o emulador; ausente em produção. */
  emulatorHost?: string;
  getToken: () => Promise<string>;
}

const SAFE_PATH = /^[A-Za-z0-9_-]+(\/[A-Za-z0-9_-]+)*$/;

export function createRestFirestore(opts: RestOptions): FirestoreClient {
  const base = opts.emulatorHost
    ? `http://${opts.emulatorHost}/v1`
    : "https://firestore.googleapis.com/v1";
  const dbName = `projects/${opts.projectId}/databases/(default)`;
  const docName = (path: string) => {
    if (!SAFE_PATH.test(path)) throw new Error(`Caminho inválido: ${path}`);
    return `${dbName}/documents/${path}`;
  };

  async function call(method: string, url: string, body?: unknown): Promise<Response> {
    const token = opts.emulatorHost ? "owner" : await opts.getToken();
    return fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  return {
    async getDoc(path) {
      const res = await call("GET", `${base}/${docName(path)}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Firestore GET ${res.status}: ${await res.text()}`);
      const body = (await res.json()) as { fields?: Record<string, Value> };
      return decodeFields(body.fields ?? {});
    },

    async commit(writes) {
      const restWrites = writes.map((w) => {
        if (w.op === "delete") return { delete: docName(w.path) };
        const update = { name: docName(w.path), fields: encodeFields(w.data) };
        if (w.op === "create") return { update, currentDocument: { exists: false } };
        if (w.op === "update") {
          return { update, updateMask: { fieldPaths: Object.keys(update.fields) }, currentDocument: { exists: true } };
        }
        return { update };
      });
      const res = await call("POST", `${base}/${dbName}/documents:commit`, { writes: restWrites });
      if (res.ok) return;
      const text = await res.text();
      if (res.status === 409 || res.status === 404 || /ALREADY_EXISTS|FAILED_PRECONDITION|NOT_FOUND/.test(text)) {
        throw new PreconditionFailed(text);
      }
      throw new Error(`Firestore commit ${res.status}: ${text}`);
    },

    async query(collection, filters, limit) {
      if (!SAFE_PATH.test(collection)) throw new Error("Coleção inválida");
      const where =
        filters.length === 0
          ? undefined
          : {
              compositeFilter: {
                op: "AND",
                filters: filters.map((f) => ({
                  fieldFilter: { field: { fieldPath: f.field }, op: f.op, value: encodeValue(f.value) },
                })),
              },
            };
      const res = await call("POST", `${base}/${dbName}/documents:runQuery`, {
        structuredQuery: { from: [{ collectionId: collection }], where, limit: Math.min(limit, 500) },
      });
      if (!res.ok) throw new Error(`Firestore query ${res.status}: ${await res.text()}`);
      const rows = (await res.json()) as { document?: { name: string; fields?: Record<string, Value> } }[];
      return rows
        .filter((r) => r.document)
        .map((r) => ({
          id: r.document!.name.split("/").pop()!,
          data: decodeFields(r.document!.fields ?? {}),
        }));
    },
  };
}
