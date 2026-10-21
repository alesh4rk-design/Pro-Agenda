/**
 * Limite de taxa por usuário, em memória do isolate (best effort: cada isolate
 * tem o próprio contador). Protege contra loops e abuso simples sem custo extra.
 * Para limites globais, usar o binding de Rate Limiting da Cloudflare (Etapa 8).
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function allow(key: string, max: number, windowMs: number, now = Date.now()): boolean {
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    if (buckets.size > 5000) buckets.clear();
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  b.count += 1;
  return b.count <= max;
}

export function resetRateLimits() {
  buckets.clear();
}
