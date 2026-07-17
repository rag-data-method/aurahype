/**
 * POST /search — busca vetorial + filtro por tags/categoria.
 *
 * Fluxo:
 *   1) embed da query com o mesmo modelo do /ingest
 *   2) Vectorize query com vector_topk (default 40) resultados brutos
 *   3) hidrata metadados do D1
 *   4) aplica filtros (category/style/vibe/source_contains)
 *   5) devolve os top `limit` (default 12)
 */

import type { Env, SearchBody, SiteRow } from "./types.js";
import { embedBatch } from "./embed.js";
import { getSitesByIds } from "./db.js";
import { parseJsonSafe } from "./util.js";

interface SearchResult {
  id: string;
  score: number;
  source_url: string;
  title: string | null;
  description: string | null;
  screenshot_url: string | null;
  palette_hex: string[] | null;
  hero_kind: string | null;
  category: string | null;
  style: string | null;
  vibe: string | null;
  tags: string[] | null;
}

export async function handleSearch(
  env: Env,
  body: SearchBody
): Promise<{ ok: true; query: string; count: number; results: SearchResult[] }> {
  const query = (body.query ?? "").trim();
  if (!query) {
    return { ok: true, query: "", count: 0, results: [] };
  }
  const limit = clamp(body.limit ?? 12, 1, 50);
  const vectorTopK = clamp(body.vector_topk ?? 40, limit, 200);

  const [queryVec] = await embedBatch(env, [query]);
  const vecResult = await env.VECTORIZE.query(queryVec, {
    topK: vectorTopK,
    returnMetadata: "none",
  });

  const matches = vecResult.matches ?? [];
  if (matches.length === 0) {
    return { ok: true, query, count: 0, results: [] };
  }

  const ids = matches.map((m) => m.id);
  const rowsById = await getSitesByIds(env.DB, ids);

  const filter = body.filter ?? {};
  const results: SearchResult[] = [];
  for (const m of matches) {
    const row = rowsById.get(m.id);
    if (!row) continue;
    if (filter.category && row.category !== filter.category) continue;
    if (filter.style && row.style !== filter.style) continue;
    if (filter.vibe && row.vibe !== filter.vibe) continue;
    if (
      filter.source_contains &&
      !row.source_url.toLowerCase().includes(filter.source_contains.toLowerCase())
    ) {
      continue;
    }
    results.push(toResult(row, m.score));
    if (results.length >= limit) break;
  }

  return { ok: true, query, count: results.length, results };
}

function toResult(row: SiteRow, score: number): SearchResult {
  return {
    id: row.id,
    score,
    source_url: row.source_url,
    title: row.title,
    description: row.description,
    screenshot_url: row.screenshot_url,
    palette_hex: parseJsonSafe<string[]>(row.palette_hex),
    hero_kind: row.hero_kind,
    category: row.category,
    style: row.style,
    vibe: row.vibe,
    tags: parseJsonSafe<string[]>(row.tags),
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
