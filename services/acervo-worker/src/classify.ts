/**
 * Classificação de sites com LLM.
 *
 * Recebe title/description/html_snippet e devolve:
 *   { category, style, vibe, tags: string[] }
 *
 * Modelo padrão: @cf/meta/llama-3.1-8b-instruct.
 * Pede JSON via prompt (Workers AI ainda não expõe json_mode oficial
 * pra todos os modelos, então parseamos defensivamente).
 */

import type { Env, Classification } from "./types.js";

const SYSTEM_PROMPT = `Você é um classificador de sites. Recebe título, descrição e trecho de HTML e responde SOMENTE com JSON válido no formato:

{"category": string, "style": string, "vibe": string, "tags": string[]}

Regras:
- category: uma palavra em minúsculas. Ex: "fitness", "tech", "food", "beauty", "service", "portfolio", "ecommerce", "saas", "restaurant", "consulting".
- style: uma palavra. Ex: "minimal", "bold", "organic", "brutalist", "elegant", "playful", "corporate".
- vibe: uma palavra. Ex: "warm", "cool", "neutral", "dark", "bright", "monochrome".
- tags: 3 a 8 tags curtas em kebab-case. Ex: "hero-video", "glassmorphism", "gradient-purple", "serif-heading".
- Sem comentários, sem texto fora do JSON, sem markdown.`;

interface AiChatResponse {
  response?: string;
  result?: { response?: string };
}

export async function classifyOne(
  env: Env,
  input: {
    title?: string | null;
    description?: string | null;
    html_snippet?: string | null;
    source_url: string;
  }
): Promise<Classification | null> {
  const userContent = [
    `URL: ${input.source_url}`,
    input.title ? `Título: ${input.title}` : "",
    input.description ? `Descrição: ${input.description}` : "",
    input.html_snippet
      ? `HTML (trecho): ${stripTags(input.html_snippet).slice(0, 1500)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const raw = (await env.AI.run(env.CLASSIFY_MODEL as never, {
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
    temperature: 0.2,
    max_tokens: 256,
  })) as AiChatResponse;

  const text = raw.response ?? raw.result?.response ?? "";
  return parseClassification(text);
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * O LLM às vezes envolve o JSON em texto ou markdown fences.
 * A gente extrai o primeiro bloco `{...}` e valida os campos.
 */
export function parseClassification(text: string): Classification | null {
  if (!text) return null;
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as Partial<Classification>;
    if (
      typeof parsed.category !== "string" ||
      typeof parsed.style !== "string" ||
      typeof parsed.vibe !== "string" ||
      !Array.isArray(parsed.tags)
    ) {
      return null;
    }
    return {
      category: parsed.category.toLowerCase().trim(),
      style: parsed.style.toLowerCase().trim(),
      vibe: parsed.vibe.toLowerCase().trim(),
      tags: parsed.tags
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.toLowerCase().trim())
        .filter(Boolean)
        .slice(0, 8),
    };
  } catch {
    return null;
  }
}
