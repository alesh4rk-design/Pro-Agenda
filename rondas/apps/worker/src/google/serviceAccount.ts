import { SignJWT, importPKCS8 } from "jose";

/**
 * Obtém um access token OAuth2 da conta de serviço (fluxo JWT bearer).
 * O token é guardado em memória do isolate e reutilizado até 5 min antes de expirar,
 * para economizar CPU (limite de 10 ms/invocação no plano gratuito) e chamadas.
 */
const SCOPES = [
  "https://www.googleapis.com/auth/datastore",
  "https://www.googleapis.com/auth/identitytoolkit",
  "https://www.googleapis.com/auth/cloud-platform",
].join(" ");

let cached: { token: string; exp: number; email: string } | null = null;

export async function getServiceAccountToken(clientEmail: string, privateKeyPem: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.email === clientEmail && cached.exp - 300 > now) return cached.token;

  const key = await importPKCS8(privateKeyPem.replace(/\\n/g, "\n"), "RS256");
  const assertion = await new SignJWT({ scope: SCOPES })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(clientEmail)
    .setSubject(clientEmail)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!res.ok) throw new Error(`Falha ao obter token da conta de serviço (${res.status}).`);
  const body = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: body.access_token, exp: now + body.expires_in, email: clientEmail };
  return body.access_token;
}
