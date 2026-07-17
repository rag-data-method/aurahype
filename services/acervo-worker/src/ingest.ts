/**
 * POST /ingest — recebe um lote de sites do scraper, gera embeddings
 * em batch, grava metadados no D1 e vetores no Vectorize.
 *
 * Opcional: se body.classify === true, também roda o LLM classifier
 * pra cada site inline (mais lento).
 */

import type { Env, IngestBody, ScrapedSiteInput } from "./types.js";
import { buildEmbedText } from "./util.js";
import { embedBatch } from "./embed.js";
import { classifyOne } from "./classify.js";
import { computeId, upsertSite } from "./db.js";

const MAX_BATCH = 100;

export async function handleIngest(
  env: Env,
  body: IngestBody
): Promise<{
  ok: true;
  received: number;
  embedded: number;
  classified: number;
  errors: Array<{ source_url: string; error: string }>;
}> {
  const sites = (body.sites ?? []).slice(0, MAX_BATCH);
  const errors: Array<{ source_url: string; error: string }> = [];
  const valid: Array<{ input: ScrapedSiteInput; id: string; text: string }> = [];

  // 1) valida + calcula id + monta texto pra embed
  for (const s of sites) {
    if (!s || typeof s.source_url !== "string" || !s.source_url.trim()) {
      errors.push({
        source_url: s?.source_url ?? "(missing)",
        error: "source_url ausente ou inválido",
      });
      continue;
    }
    const id = await computeId(s);
    const text = buildEmbedText(s);
    valid.push({ input: s, id, text });
  }

  if (valid.length === 0) {
    return { ok: true, received: sites.length, embedded: 0, classified: 0, errors };
  }

  // 2) embed em batch (uma chamada Workers AI pra tudo)
  let vectors: number[][];
  try {
    vectors = await embedBatch(env, valid.map((v) => v.text));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: true,
      received: sites.length,
      embedded: 0,
      classified: 0,
      errors: [
        ...errors,
        ...valid.map((v) => ({ source_url: v.input.source_url, error: `embed: ${msg}` })),
      ],
    };
  }

  // 3) opcionalmente classifica cada site (serial pra não estourar quotas)
  let classifiedCount = 0;
  const classifications = new Map<string, Awaited<ReturnType<typeof classifyOne>>>();
  if (body.classify) {
    for (const v of valid) {
      try {
        const c = await classifyOne(env, {
          source_url: v.input.source_url,
          title: v.input.title,
          description: v.input.description,
          html_snippet: v.input.html_snippet,
        });
        classifications.set(v.id, c);
        if (c) classifiedCount++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push({ source_url: v.input.source_url, error: `classify: ${msg}` });
        classifications.set(v.id, null);
      }
    }
  }

  // 4) grava D1 (upsert) + prepara vetores pra Vectorize
  const now = Date.now();
  const vectorizePayload = valid.map((v, i) => ({
    id: v.id,
    values: vectors[i],
    metadata: {
      source_url: v.input.source_url,
      title: (v.input.title ?? "").slice(0, 200),
      category: classifications.get(v.id)?.category ?? "",
      style: classifications.get(v.id)?.style ?? "",
      vibe: classifications.get(v.id)?.vibe ?? "",
    },
  }));

  for (const v of valid) {
    try {
      await upsertSite(
        env.DB,
        v.input,
        v.id,
        classifications.get(v.id) ?? null,
        now
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push({ source_url: v.input.source_url, error: `db: ${msg}` });
    }
  }

  try {
    // Vectorize upsert aceita até 1000 vetores por chamada; nosso batch é <=100.
    await env.VECTORIZE.upsert(vectorizePayload);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // O D1 já salvou — reprocesso via /reindex pode subir os vetores depois.
    errors.push({ source_url: "(vectorize)", error: `vectorize: ${msg}` });
  }

  return {
    ok: true,
    received: sites.length,
    embedded: valid.length,
    classified: classifiedCount,
    errors,
  };
}
