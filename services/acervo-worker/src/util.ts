/**
 * Helpers pequenos usados por vários módulos.
 */

/** sha256 hex — id estável a partir do source_url. */
export async function sha256(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Monta o texto que vai virar embedding.
 * Priorizamos title + description; se faltarem, cai no html_snippet
 * truncado. Se nada disso existir, usa o próprio source_url (fraco,
 * mas evita embedar string vazia).
 */
export function buildEmbedText(input: {
  title?: string | null;
  description?: string | null;
  html_snippet?: string | null;
  source_url: string;
}): string {
  const parts: string[] = [];
  if (input.title) parts.push(input.title.trim());
  if (input.description) parts.push(input.description.trim());
  if (parts.length === 0 && input.html_snippet) {
    // Limpa tags HTML de forma tosca mas eficiente pra embedding.
    const text = input.html_snippet
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (text) parts.push(text.slice(0, 2000));
  }
  if (parts.length === 0) parts.push(input.source_url);
  return parts.join("\n").slice(0, 4000);
}

/** Serializa arrays JSON de forma segura pro D1. */
export function toJsonOrNull<T>(v: T | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  try {
    return JSON.stringify(v);
  } catch {
    return null;
  }
}

/** Parse defensivo — nunca joga. */
export function parseJsonSafe<T>(s: string | null | undefined): T | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

/** Response JSON com CORS aberto — igual ao worker MissCanvas. */
export function jsonResponse(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      ...(init.headers ?? {}),
    },
  });
}
