/**
 * Wrapper do Workers AI pra gerar embeddings.
 *
 * Modelo padrão: @cf/baai/bge-m3 (multilingual, 1024 dims).
 * Se quiser inglês-only e mais barato: @cf/baai/bge-base-en-v1.5 (768 dims)
 * — mas nesse caso troque também dimensions=768 ao criar o Vectorize.
 */

import type { Env } from "./types.js";

export async function embedBatch(
  env: Env,
  texts: string[]
): Promise<number[][]> {
  if (texts.length === 0) return [];

  // Workers AI aceita array de strings em uma chamada só (até 100).
  const chunks: string[][] = [];
  for (let i = 0; i < texts.length; i += 50) {
    chunks.push(texts.slice(i, i + 50));
  }

  const all: number[][] = [];
  for (const chunk of chunks) {
    const result = (await env.AI.run(env.EMBED_MODEL as never, {
      text: chunk,
    })) as { data: number[][] } | { shape: number[]; data: number[][] };

    if (!("data" in result) || !Array.isArray(result.data)) {
      throw new Error("embed: resposta do Workers AI sem campo data[]");
    }
    all.push(...result.data);
  }

  if (all.length !== texts.length) {
    throw new Error(
      `embed: esperava ${texts.length} vetores, recebeu ${all.length}`
    );
  }
  return all;
}
