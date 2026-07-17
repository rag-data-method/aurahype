/**
 * Tríade 56 · acervo-worker
 *
 * Cloudflare Worker responsável por indexar o acervo de sites
 * (scraper Lovable + outros) com busca vetorial.
 *
 * Rotas:
 *   GET  /health        — status
 *   POST /ingest        — recebe lote do scraper, embed + upsert
 *   POST /search        — busca vetorial por texto natural
 *   POST /classify      — processa fila de sites ainda sem classificação
 *   GET  /site/:id      — devolve um site do D1
 *
 * Segurança: /ingest e /classify exigem header
 *   Authorization: Bearer <INGEST_TOKEN>
 * quando o secret INGEST_TOKEN estiver definido. /search e /health
 * ficam abertos pro frontend do Tríade 56.
 */

import { Hono } from "hono";
import type { Env, IngestBody, SearchBody } from "./types.js";
import { handleIngest } from "./ingest.js";
import { handleSearch } from "./search.js";
import {
  handleExtract,
  handleCrawl,
  type ExtractBody,
  type CrawlBody,
} from "./scrape.js";
import { classifyOne } from "./classify.js";
import { getUnclassifiedSites, updateClassification } from "./db.js";
import { parseJsonSafe } from "./util.js";

const app = new Hono<{ Bindings: Env }>();

// CORS aberto — igual ao worker MissCanvas atual.
app.use("*", async (c, next) => {
  if (c.req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "86400",
      },
    });
  }
  await next();
  c.res.headers.set("Access-Control-Allow-Origin", "*");
});

app.get("/health", (c) =>
  c.json({
    ok: true,
    service: "triade-acervo",
    embed_model: c.env.EMBED_MODEL,
    classify_model: c.env.CLASSIFY_MODEL,
    now: Date.now(),
  })
);

/**
 * Guard simples: se INGEST_TOKEN estiver setado como secret,
 * exige Bearer. Se não estiver, deixa passar (dev).
 */
function requireIngestToken(env: Env, authHeader: string | undefined): boolean {
  if (!env.INGEST_TOKEN) return true;
  if (!authHeader) return false;
  const [scheme, token] = authHeader.split(" ");
  return scheme === "Bearer" && token === env.INGEST_TOKEN;
}

app.post("/ingest", async (c) => {
  if (!requireIngestToken(c.env, c.req.header("Authorization"))) {
    return c.json({ ok: false, error: "unauthorized" }, 401);
  }
  const body = (await c.req.json().catch(() => null)) as IngestBody | null;
  if (!body || !Array.isArray(body.sites)) {
    return c.json({ ok: false, error: "body inválido: esperado {sites: [...]}" }, 400);
  }
  const result = await handleIngest(c.env, body);
  return c.json(result);
});

app.post("/search", async (c) => {
  const body = (await c.req.json().catch(() => null)) as SearchBody | null;
  if (!body || typeof body.query !== "string") {
    return c.json({ ok: false, error: "body inválido: esperado {query: string}" }, 400);
  }
  const result = await handleSearch(c.env, body);
  return c.json(result);
});

/**
 * POST /scrape/extract — N URLs conhecidas → conteudo limpo → ingest.
 * Provider: Tavily (default) ou Scrapfly (fallback). Auto-seleciona pela env.
 * Protegido por INGEST_TOKEN pra nao torrar creditos.
 */
app.post("/scrape/extract", async (c) => {
  if (!requireIngestToken(c.env, c.req.header("Authorization"))) {
    return c.json({ ok: false, error: "unauthorized" }, 401);
  }
  const body = (await c.req.json().catch(() => null)) as ExtractBody | null;
  if (!body || !Array.isArray(body.urls)) {
    return c.json(
      { ok: false, error: "body inválido: esperado {urls: string[]}" },
      400
    );
  }
  const result = await handleExtract(c.env, body);
  if (!result.ok) return c.json(result, 501);
  return c.json(result);
});

/**
 * POST /scrape/crawl — URL raiz + instructions → Tavily crawl → ingest.
 * So Tavily por enquanto (Scrapfly nao tem endpoint de crawl).
 */
app.post("/scrape/crawl", async (c) => {
  if (!requireIngestToken(c.env, c.req.header("Authorization"))) {
    return c.json({ ok: false, error: "unauthorized" }, 401);
  }
  const body = (await c.req.json().catch(() => null)) as CrawlBody | null;
  if (!body || typeof body.url !== "string") {
    return c.json(
      { ok: false, error: "body inválido: esperado {url: string, instructions?: string, ...}" },
      400
    );
  }
  try {
    const result = await handleCrawl(c.env, body);
    if (!result.ok) return c.json(result, 501);
    return c.json(result);
  } catch (e) {
    return c.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      500
    );
  }
});

/**
 * POST /classify — processa em lote sites com classified_at NULL.
 * Body: { limit?: number }  default 20, max 100.
 * Serial porque o LLM é caro; roda como job manual da Miriam.
 */
app.post("/classify", async (c) => {
  if (!requireIngestToken(c.env, c.req.header("Authorization"))) {
    return c.json({ ok: false, error: "unauthorized" }, 401);
  }
  const body = (await c.req.json().catch(() => ({}))) as { limit?: number };
  const limit = Math.max(1, Math.min(100, body.limit ?? 20));
  const rows = await getUnclassifiedSites(c.env.DB, limit);
  const now = Date.now();
  let classified = 0;
  const errors: Array<{ id: string; error: string }> = [];

  for (const row of rows) {
    try {
      const c1 = await classifyOne(c.env, {
        source_url: row.source_url,
        title: row.title,
        description: row.description,
        html_snippet: row.html_snippet,
      });
      if (c1) {
        await updateClassification(c.env.DB, row.id, c1, now);
        classified++;
      } else {
        errors.push({ id: row.id, error: "LLM não retornou JSON válido" });
      }
    } catch (e) {
      errors.push({ id: row.id, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return c.json({
    ok: true,
    picked: rows.length,
    classified,
    errors,
  });
});

app.get("/site/:id", async (c) => {
  const id = c.req.param("id");
  const row = await c.env.DB
    .prepare("SELECT * FROM sites WHERE id = ?1")
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) return c.json({ ok: false, error: "not found" }, 404);

  return c.json({
    ok: true,
    site: {
      ...row,
      palette_hex: parseJsonSafe<string[]>(row.palette_hex as string | null),
      tags: parseJsonSafe<string[]>(row.tags as string | null),
      raw_json: undefined, // não devolve raw por default (pesado)
    },
  });
});

app.notFound((c) =>
  c.json({ ok: false, error: "route not found", path: c.req.path }, 404)
);

app.onError((err, c) => {
  console.error("acervo-worker error:", err);
  return c.json({ ok: false, error: err.message ?? "internal" }, 500);
});

export default app;
