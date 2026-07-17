/**
 * Tipos compartilhados do worker triade-acervo.
 *
 * O scraper Lovable pode mandar qualquer shape — a gente aceita
 * o mínimo (source_url + algum texto pra embed) e o resto é opcional.
 */

export interface Env {
  AI: Ai;
  VECTORIZE: Vectorize;
  DB: D1Database;
  EMBED_MODEL: string;
  CLASSIFY_MODEL: string;
  INGEST_TOKEN?: string;
  /** Habilita /scrape/extract e /scrape/crawl via Tavily (prioritario). */
  TAVILY_API_KEY?: string;
  /** Fallback pra /scrape/extract quando TAVILY_API_KEY nao setada. */
  SCRAPFLY_API_KEY?: string;
  /** Reservado pra scraping social (Instagram/TikTok/YouTube) — feature futura. */
  SOCIALCRAWL_KEY?: string;
}

/**
 * Shape mínimo que o scraper precisa mandar por site.
 * Só source_url é obrigatório. Se não tiver title/description,
 * a gente cai no html_snippet pra fazer embed.
 */
export interface ScrapedSiteInput {
  source_url: string;
  title?: string | null;
  description?: string | null;
  html_snippet?: string | null;
  screenshot_url?: string | null;
  palette_hex?: string[] | null;
  hero_kind?: "image" | "video" | "gradient" | "text" | null;
  language?: string | null;
  /** ID do scraper. Se não vier, calculamos sha256(source_url). */
  id?: string | null;
  /** Payload cru — guardado inteiro no D1 pra debug/reprocess. */
  raw?: unknown;
}

export interface IngestBody {
  /** Lote de sites. Recomendado <=100 por request pra caber no timeout. */
  sites: ScrapedSiteInput[];
  /**
   * Se true, chama o LLM pra classificar cada site no mesmo request.
   * Mais lento (~1-2s por site). Default false — classifica depois em /classify.
   */
  classify?: boolean;
}

export interface SiteRow {
  id: string;
  source_url: string;
  title: string | null;
  description: string | null;
  html_snippet: string | null;
  screenshot_url: string | null;
  palette_hex: string | null; // JSON string
  hero_kind: string | null;
  language: string | null;
  category: string | null;
  style: string | null;
  vibe: string | null;
  tags: string | null; // JSON string
  classified_at: number | null;
  ingested_at: number;
  updated_at: number;
  raw_json: string | null;
}

export interface Classification {
  category: string;
  style: string;
  vibe: string;
  tags: string[];
}

export interface SearchBody {
  query: string;
  /** topK final devolvido depois do filtro. Default 12, max 50. */
  limit?: number;
  /** topK bruto do Vectorize antes do filtro D1. Default 40. */
  vector_topk?: number;
  filter?: {
    category?: string;
    style?: string;
    vibe?: string;
    /** Match parcial no source_url, útil pra restringir ao Lovable. */
    source_contains?: string;
  };
}
