/**
 * Wrappers pra D1 — upsert de sites, leitura por id em batch, listagem paginada.
 */

import type { D1Database } from "@cloudflare/workers-types";
import type { ScrapedSiteInput, SiteRow, Classification } from "./types.js";
import { sha256, toJsonOrNull } from "./util.js";

export async function computeId(input: ScrapedSiteInput): Promise<string> {
  if (input.id && input.id.trim()) return input.id.trim();
  return sha256(input.source_url);
}

/**
 * Upsert de site. Se já existe (mesmo source_url), preserva
 * category/style/vibe/tags a menos que venham no input.
 */
export async function upsertSite(
  db: D1Database,
  input: ScrapedSiteInput,
  id: string,
  classification: Classification | null,
  now: number
): Promise<void> {
  const paletteJson = toJsonOrNull(input.palette_hex ?? null);
  const tagsJson = classification ? toJsonOrNull(classification.tags) : null;
  const rawJson = toJsonOrNull(input.raw ?? input);

  // ON CONFLICT no source_url atualiza campos novos e mantém os antigos
  // se não vieram. Classification só sobrescreve se veio agora.
  await db
    .prepare(
      `
      INSERT INTO sites (
        id, source_url, title, description, html_snippet, screenshot_url,
        palette_hex, hero_kind, language,
        category, style, vibe, tags, classified_at,
        ingested_at, updated_at, raw_json
      ) VALUES (
        ?1, ?2, ?3, ?4, ?5, ?6,
        ?7, ?8, ?9,
        ?10, ?11, ?12, ?13, ?14,
        ?15, ?16, ?17
      )
      ON CONFLICT(source_url) DO UPDATE SET
        title          = COALESCE(excluded.title, sites.title),
        description    = COALESCE(excluded.description, sites.description),
        html_snippet   = COALESCE(excluded.html_snippet, sites.html_snippet),
        screenshot_url = COALESCE(excluded.screenshot_url, sites.screenshot_url),
        palette_hex    = COALESCE(excluded.palette_hex, sites.palette_hex),
        hero_kind      = COALESCE(excluded.hero_kind, sites.hero_kind),
        language       = COALESCE(excluded.language, sites.language),
        category       = COALESCE(excluded.category, sites.category),
        style          = COALESCE(excluded.style, sites.style),
        vibe           = COALESCE(excluded.vibe, sites.vibe),
        tags           = COALESCE(excluded.tags, sites.tags),
        classified_at  = COALESCE(excluded.classified_at, sites.classified_at),
        updated_at     = excluded.updated_at,
        raw_json       = COALESCE(excluded.raw_json, sites.raw_json)
      `
    )
    .bind(
      id,
      input.source_url,
      input.title ?? null,
      input.description ?? null,
      input.html_snippet ?? null,
      input.screenshot_url ?? null,
      paletteJson,
      input.hero_kind ?? null,
      input.language ?? null,
      classification?.category ?? null,
      classification?.style ?? null,
      classification?.vibe ?? null,
      tagsJson,
      classification ? now : null,
      now,
      now,
      rawJson
    )
    .run();
}

export async function updateClassification(
  db: D1Database,
  id: string,
  c: Classification,
  now: number
): Promise<void> {
  await db
    .prepare(
      `UPDATE sites
       SET category = ?2, style = ?3, vibe = ?4, tags = ?5,
           classified_at = ?6, updated_at = ?6
       WHERE id = ?1`
    )
    .bind(id, c.category, c.style, c.vibe, toJsonOrNull(c.tags), now)
    .run();
}

export async function getSitesByIds(
  db: D1Database,
  ids: string[]
): Promise<Map<string, SiteRow>> {
  if (ids.length === 0) return new Map();
  const placeholders = ids.map(() => "?").join(",");
  const stmt = db.prepare(
    `SELECT * FROM sites WHERE id IN (${placeholders})`
  );
  const bound = stmt.bind(...ids);
  const { results } = await bound.all<SiteRow>();
  const map = new Map<string, SiteRow>();
  for (const row of results ?? []) map.set(row.id, row);
  return map;
}

export async function getUnclassifiedSites(
  db: D1Database,
  limit: number
): Promise<SiteRow[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM sites
       WHERE classified_at IS NULL
       ORDER BY ingested_at ASC
       LIMIT ?1`
    )
    .bind(limit)
    .all<SiteRow>();
  return results ?? [];
}
