import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { config } from "./config.js";

export function json(statusCode: number, body: unknown): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": config.allowedOrigin(),
      "access-control-allow-headers": "content-type,x-worker-signature",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "cache-control": "no-store"
    },
    body: JSON.stringify(body)
  };
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Erro inesperado.";
}

export function parseJsonBody(body: string | undefined, isBase64Encoded?: boolean): unknown {
  if (!body) throw new Error("Corpo da requisição ausente.");
  const raw = isBase64Encoded ? Buffer.from(body, "base64").toString("utf8") : body;
  return JSON.parse(raw);
}

export function rawBody(body: string | undefined, isBase64Encoded?: boolean): string {
  if (!body) throw new Error("Corpo da requisição ausente.");
  return isBase64Encoded ? Buffer.from(body, "base64").toString("utf8") : body;
}
