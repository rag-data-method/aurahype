import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { config } from "./config.js";

const CORS_HEADERS = {
  "access-control-allow-headers": "content-type,x-worker-signature",
  "access-control-allow-methods": "GET,POST,OPTIONS",
};

export function json(
  statusCode: number,
  body: unknown
): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": config.allowedOrigin(),
      ...CORS_HEADERS,
      "cache-control": "no-store",
    },
    body: JSON.stringify(body),
  };
}

/**
 * Devolve HTML com cache curto — pros sites gerados pela Tríade serem
 * visitáveis direto pelo endpoint `/sites/:slug`.
 */
export function htmlResponse(
  statusCode: number,
  html: string,
  opts: { cacheSeconds?: number } = {}
): APIGatewayProxyStructuredResultV2 {
  const cache = opts.cacheSeconds ?? 60;
  return {
    statusCode,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "access-control-allow-origin": config.allowedOrigin(),
      ...CORS_HEADERS,
      "cache-control": `public, max-age=${cache}`,
    },
    body: html,
  };
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Erro inesperado.";
}

export function parseJsonBody(
  body: string | undefined,
  isBase64Encoded?: boolean
): unknown {
  if (!body) throw new Error("Corpo da requisição ausente.");
  const raw = isBase64Encoded
    ? Buffer.from(body, "base64").toString("utf8")
    : body;
  return JSON.parse(raw);
}

export function rawBody(
  body: string | undefined,
  isBase64Encoded?: boolean
): string {
  if (!body) throw new Error("Corpo da requisição ausente.");
  return isBase64Encoded
    ? Buffer.from(body, "base64").toString("utf8")
    : body;
}
