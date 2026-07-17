/**
 * Cliente para a Azure OpenAI Responses API (Microsoft Foundry).
 *
 * Endpoint: POST {AZURE_OPENAI_ENDPOINT}/openai/v1/responses
 * Auth: header `api-key: <key>` (a key vem do Secrets Manager).
 *
 * Docs: https://learn.microsoft.com/en-us/rest/api/microsoft-foundry/azureopenai/responses
 * Docs: https://learn.microsoft.com/en-us/azure/ai-foundry/openai/how-to/responses
 *
 * A Responses API é OpenAI-compatível: aceita `model`, `input`, `instructions`,
 * `temperature`, `max_output_tokens`, `store`. Devolve `output_text` (concat) e
 * `output: [...]` (array estruturado com role/content).
 *
 * Este módulo é o UNICO ponto que fala com Azure. Todo o resto (triade.ts,
 * handlers.ts) chama `respond()`.
 */

import { config } from "./config.js";
import { readSecret } from "./secrets.js";

// ----- schema minimo da Responses API ---------------------------------

/**
 * Cada bloco do array `output` da Responses API pode ter shape:
 *   { type: "message", role: "assistant", content: [{ type: "output_text", text: "..." }] }
 * ou variações com tool_calls, refusal, etc. A gente só cuida do texto.
 */
interface ResponsesOutputContent {
  type?: string;
  text?: string;
}

interface ResponsesOutputItem {
  type?: string;
  role?: string;
  content?: ResponsesOutputContent[];
}

interface ResponsesAPIResponse {
  id?: string;
  status?: string;
  /** shortcut concatenado — nem sempre presente, dependendo da versão. */
  output_text?: string;
  output?: ResponsesOutputItem[];
  error?: { message?: string; code?: string };
  usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
}

// ----- parâmetros de entrada ------------------------------------------

export interface RespondParams {
  /** Nome do deployment Azure — "gpt-5.6-luna", "gpt-5.6-terra", etc. */
  deployment: string;
  /** System prompt / instrução persistente. */
  instructions: string;
  /** Mensagem do usuário. */
  input: string;
  temperature?: number;
  /** Default 4096. Aumenta pra HTML grande (Terra/Sol). */
  max_output_tokens?: number;
  /** Timeout em ms — Lambda tem 29s no API Gateway; deixamos 25s por chamada. */
  timeout_ms?: number;
}

// ----- cache da key ---------------------------------------------------

let keyCache: string | undefined;

async function getKey(): Promise<string> {
  if (keyCache) return keyCache;
  const arn = config.azureOpenAiKeySecretArn();
  if (!arn) {
    throw new Error(
      "AZURE_OPENAI_KEY_SECRET_ARN não configurado. Rode o CDK deploy com o secret criado."
    );
  }
  keyCache = await readSecret(arn);
  return keyCache;
}

// ----- chamada principal ---------------------------------------------

/**
 * Chama a Responses API e devolve o texto de saída. Já concatena o
 * `output_text` (se presente) OU percorre `output[].content[]` extraindo
 * `type: "output_text"`.
 *
 * Lança se a resposta veio com `error` ou se o corpo não teve texto.
 */
export async function respond(params: RespondParams): Promise<{
  text: string;
  usage?: ResponsesAPIResponse["usage"];
  raw: ResponsesAPIResponse;
}> {
  const endpoint = config.azureOpenAiEndpoint();
  if (!endpoint) {
    throw new Error("AZURE_OPENAI_ENDPOINT não configurado.");
  }
  const key = await getKey();

  const url = `${endpoint.replace(/\/$/, "")}/openai/v1/responses`;

  const body: Record<string, unknown> = {
    model: params.deployment,
    instructions: params.instructions,
    input: params.input,
    temperature: params.temperature ?? 0.7,
    max_output_tokens: params.max_output_tokens ?? 4096,
    // Não persistir em thread — cada chamada é isolada.
    store: false,
  };

  const controller = new AbortController();
  const timeoutMs = params.timeout_ms ?? 25000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let raw: ResponsesAPIResponse;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": key,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await res.text();
    try {
      raw = text ? (JSON.parse(text) as ResponsesAPIResponse) : {};
    } catch {
      throw new Error(
        `Azure Responses API devolveu resposta não-JSON (HTTP ${res.status}): ${text.slice(0, 200)}`
      );
    }

    if (!res.ok) {
      const msg = raw.error?.message ?? `HTTP ${res.status}`;
      throw new Error(`Azure Responses API falhou: ${msg}`);
    }
  } catch (e) {
    if ((e as { name?: string }).name === "AbortError") {
      throw new Error(`Azure Responses API timeout após ${timeoutMs}ms (deployment ${params.deployment}).`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }

  const extracted = extractText(raw);
  if (!extracted) {
    throw new Error(
      `Azure Responses API devolveu vazio (deployment ${params.deployment}). ` +
        `Status: ${raw.status ?? "?"}.`
    );
  }
  return { text: extracted, usage: raw.usage, raw };
}

/**
 * Extrai texto da resposta. Tenta primeiro `output_text` (shortcut),
 * cai pro loop em `output[].content[]` pegando `type: "output_text"`.
 */
function extractText(raw: ResponsesAPIResponse): string {
  if (typeof raw.output_text === "string" && raw.output_text.trim()) {
    return raw.output_text;
  }
  const parts: string[] = [];
  for (const item of raw.output ?? []) {
    if (item.type && item.type !== "message") continue;
    for (const content of item.content ?? []) {
      if (
        (content.type === "output_text" || content.type === "text") &&
        typeof content.text === "string"
      ) {
        parts.push(content.text);
      }
    }
  }
  return parts.join("\n").trim();
}

// ----- helper: extrai JSON de texto (Luna/Terra devolvem JSON) --------

/**
 * A gente pede JSON no prompt, mas modelos às vezes embrulham em
 * ```json ... ``` ou colocam texto antes. Extrai o primeiro objeto `{...}`
 * que parsear com sucesso.
 */
export function parseJsonFromModel<T>(text: string): T {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  // Try direct parse first.
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Fallback: pega o primeiro bloco {...} balanceado.
  }

  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error(
      `Modelo não devolveu JSON. Primeiros 200 chars: ${text.slice(0, 200)}`
    );
  }
  try {
    return JSON.parse(match[0]) as T;
  } catch (e) {
    throw new Error(
      `Não consegui parsear JSON do modelo: ${e instanceof Error ? e.message : String(e)}`
    );
  }
}
