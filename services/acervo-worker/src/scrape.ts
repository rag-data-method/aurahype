/**
 * Handlers de scraping. Suporta dois modos, estilo Tavily:
 *
 *   POST /scrape/extract  →  N urls conhecidas → conteudo limpo em markdown → ingest
 *   POST /scrape/crawl    →  1 url raiz + instrucoes → segue links → N paginas → ingest
 *
 * Provider primario: Tavily (docs claros, funciona bem em Lovable/SPA).
 * Fallback pro /extract: Scrapfly (usa render headless + regex extract simples).
 * /crawl so tem Tavily por enquanto (Scrapfly nao tem endpoint equivalente).
 *
 * SocialCrawl (perfis TikTok/IG/YT/etc) ficara em /scrape/social num
 * proximo commit — API diferente, use-case diferente.
 */

import type { Env, ScrapedSiteInput } from "./types.js";
import { handleIngest } from "./ingest.js";
import { tavilyExtract, tavilyCrawl } from "./providers/tavily.js";

// ================== Scrapfly (fallback) ====================================

const SCRAPFLY_ENDPOINT = "https://api.scrapfly.io/scrape";

async function scrapflyFetch(
  apiKey: string,
  url: string,
  opts: { renderJs: boolean; screenshot: boolean }
): Promise<{ html: string; screenshot?: string } | null> {
  const params = new URLSearchParams({
    key: apiKey,
    url,
    render_js: opts.renderJs ? "true" : "false",
    country: "us",
    asp: "true",
  });
  if (opts.screenshot) {
    params.set("screenshots[main]", "fullpage");
    params.set("screenshot_flags", "load_images,dark_mode");
  }
  const res = await fetch(`${SCRAPFLY_ENDPOINT}?${params.toString()}`);
  if (!res.ok) {
    console.warn(`scrapfly ${url}: HTTP ${res.status}`);
    return null;
  }
  const data = (await res.json()) as {
    result?: {
      content?: string;
      screenshots?: Record<string, { url: string }>;
    };
  };
  const html = data?.result?.content ?? "";
  if (!html) return null;
  return {
    html,
    screenshot: data?.result?.screenshots?.main?.url,
  };
}

// ================== Extracao HTML → ScrapedSiteInput =======================

const RE_TITLE = /<title[^>]*>([\s\S]*?)<\/title>/i;
const RE_META = (key: string, attr: "name" | "property") =>
  new RegExp(
    `<meta\\s+[^>]*${attr}=["']${key}["'][^>]*content=["']([^"']*)["']`,
    "i"
  );
const RE_META_REV = (key: string, attr: "name" | "property") =>
  new RegExp(
    `<meta\\s+[^>]*content=["']([^"']*)["'][^>]*${attr}=["']${key}["']`,
    "i"
  );
const RE_LANG = /<html[^>]*\blang=["']([^"'-]+)/i;

function firstMatch(html: string, ...res: RegExp[]): string | null {
  for (const re of res) {
    const m = html.match(re);
    if (m && m[1] && m[1].trim()) return decodeEntities(m[1].trim());
  }
  return null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function extractHtmlSnippet(html: string): string {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const body = bodyMatch ? bodyMatch[1] : html;
  return body
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4000);
}

function detectHeroKind(html: string): ScrapedSiteInput["hero_kind"] {
  const first10k = html.slice(0, 10000).toLowerCase();
  if (/<video\b/.test(first10k)) return "video";
  if (/<img\b[^>]*(hero|banner|cover)/.test(first10k)) return "image";
  if (/background\s*:\s*(linear-gradient|radial-gradient)/.test(first10k))
    return "gradient";
  if (/<img\b/.test(first10k)) return "image";
  return "text";
}

function extractPalette(html: string): string[] {
  const first20k = html.slice(0, 20000);
  const set = new Set<string>();
  const re = /#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(first20k)) !== null) {
    let hex = m[1];
    if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
    set.add("#" + hex.toLowerCase());
    if (set.size >= 24) break;
  }
  return [...set].slice(0, 8);
}

function parseFromHtml(
  url: string,
  html: string,
  screenshot: string | undefined,
  sourceLabel: string
): ScrapedSiteInput {
  const title = firstMatch(
    html,
    RE_META("og:title", "property"),
    RE_META_REV("og:title", "property"),
    RE_TITLE
  );
  const description = firstMatch(
    html,
    RE_META("description", "name"),
    RE_META_REV("description", "name"),
    RE_META("og:description", "property"),
    RE_META_REV("og:description", "property")
  );
  const ogImage = firstMatch(
    html,
    RE_META("og:image", "property"),
    RE_META_REV("og:image", "property")
  );
  const langMatch = html.match(RE_LANG);
  return {
    source_url: url,
    title,
    description,
    html_snippet: extractHtmlSnippet(html),
    screenshot_url: screenshot ?? ogImage ?? null,
    palette_hex: extractPalette(html),
    hero_kind: detectHeroKind(html),
    language: langMatch ? langMatch[1].toLowerCase() : null,
    raw: { scraped_via: sourceLabel, scraped_at: Date.now() },
  };
}

/**
 * Constroi um ScrapedSiteInput a partir de conteudo markdown/text
 * (o que Tavily devolve). Nao temos HTML, entao pulamos paleta/hero_kind.
 * Usamos a primeira linha como title fallback e um trecho do body como description.
 */
function parseFromMarkdown(
  url: string,
  content: string,
  sourceLabel: string
): ScrapedSiteInput {
  const clean = content.trim();
  // Primeira linha nao-vazia como fallback pra title.
  const firstLine = clean.split("\n").find((l) => l.trim().length > 0) ?? "";
  const title = firstLine.replace(/^#+\s*/, "").slice(0, 200) || null;
  // Description: primeiro paragrafo de texto puro (~300 chars).
  const description =
    clean
      .replace(/^#+\s.*$/gm, "")
      .replace(/\!\[.*?\]\(.*?\)/g, "")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .split(/\n\s*\n/)
      .find((p) => p.trim().length > 40)
      ?.slice(0, 300) ?? null;
  return {
    source_url: url,
    title,
    description,
    html_snippet: clean.slice(0, 4000),
    screenshot_url: null,
    palette_hex: null,
    hero_kind: null,
    language: null,
    raw: { scraped_via: sourceLabel, scraped_at: Date.now() },
  };
}

// ================== Handlers ==============================================

export interface ExtractBody {
  urls: string[];
  /** "tavily" (default se TAVILY_API_KEY) ou "scrapfly" (fallback). */
  provider?: "tavily" | "scrapfly" | "auto";
  /** Passa pro Tavily como query pra reranking de chunks. */
  query?: string;
  /** Chama LLM classifier depois de ingerir. Default false. */
  classify?: boolean;
  /** So Scrapfly. Default false. */
  screenshot?: boolean;
}

export async function handleExtract(
  env: Env,
  body: ExtractBody
): Promise<
  | { ok: false; error: string }
  | {
      ok: true;
      provider: string;
      scraped: number;
      failed: Array<{ url: string; error?: string }>;
      ingest: Awaited<ReturnType<typeof handleIngest>>;
    }
> {
  const urls = (body.urls ?? []).filter(
    (u): u is string => typeof u === "string" && /^https?:\/\//.test(u)
  );
  if (urls.length === 0) return { ok: false, error: "body.urls vazio ou invalido" };
  if (urls.length > 20)
    return { ok: false, error: "max 20 urls por request" };

  // Seleciona provider
  const requested = body.provider ?? "auto";
  const useTavily =
    (requested === "auto" || requested === "tavily") && !!env.TAVILY_API_KEY;
  const useScrapfly =
    !useTavily &&
    (requested === "auto" || requested === "scrapfly") &&
    !!env.SCRAPFLY_API_KEY;
  if (!useTavily && !useScrapfly) {
    return {
      ok: false,
      error:
        "nenhum provider disponivel: setar TAVILY_API_KEY (preferido) ou SCRAPFLY_API_KEY como secret do worker",
    };
  }

  let sites: ScrapedSiteInput[] = [];
  let failed: Array<{ url: string; error?: string }> = [];

  if (useTavily) {
    try {
      const result = await tavilyExtract(env.TAVILY_API_KEY!, {
        urls,
        extract_depth: "advanced",
        format: "markdown",
        query: body.query,
        chunks_per_source: body.query ? 3 : undefined,
      });
      sites = result.results.map((r) =>
        parseFromMarkdown(r.url, r.raw_content, "tavily-extract")
      );
      failed = (result.failed_results ?? []).map((f) => ({
        url: f.url,
        error: f.error,
      }));
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  } else {
    // Scrapfly em paralelo
    const results = await Promise.all(
      urls.map(async (url) => {
        try {
          const fetched = await scrapflyFetch(env.SCRAPFLY_API_KEY!, url, {
            renderJs: true,
            screenshot: body.screenshot === true,
          });
          if (!fetched) return { url, ok: false as const, error: "empty response" };
          return {
            url,
            ok: true as const,
            site: parseFromHtml(url, fetched.html, fetched.screenshot, "scrapfly"),
          };
        } catch (e) {
          return {
            url,
            ok: false as const,
            error: e instanceof Error ? e.message : String(e),
          };
        }
      })
    );
    for (const r of results) {
      if (r.ok) sites.push(r.site);
      else failed.push({ url: r.url, error: r.error });
    }
  }

  const ingest = await handleIngest(env, {
    sites,
    classify: body.classify === true,
  });

  return {
    ok: true,
    provider: useTavily ? "tavily" : "scrapfly",
    scraped: sites.length,
    failed,
    ingest,
  };
}

export interface CrawlBody {
  url: string;
  instructions?: string;
  max_depth?: number;
  max_breadth?: number;
  limit?: number;
  select_paths?: string[];
  exclude_paths?: string[];
  classify?: boolean;
}

export async function handleCrawl(
  env: Env,
  body: CrawlBody
): Promise<
  | { ok: false; error: string }
  | {
      ok: true;
      provider: "tavily";
      base_url: string;
      crawled: number;
      ingest: Awaited<ReturnType<typeof handleIngest>>;
    }
> {
  if (!env.TAVILY_API_KEY) {
    return {
      ok: false,
      error: "TAVILY_API_KEY nao configurada (crawl so suportado via Tavily)",
    };
  }
  if (!body.url || !/^https?:\/\//.test(body.url)) {
    return { ok: false, error: "body.url invalido" };
  }
  const limit = clamp(body.limit ?? 20, 1, 100);
  const max_depth = clamp(body.max_depth ?? 1, 1, 3);
  const max_breadth = clamp(body.max_breadth ?? 20, 1, 100);

  const result = await tavilyCrawl(env.TAVILY_API_KEY, {
    url: body.url,
    max_depth,
    max_breadth,
    limit,
    instructions: body.instructions,
    chunks_per_source: body.instructions ? 3 : undefined,
    extract_depth: "basic",
    format: "markdown",
    select_paths: body.select_paths,
    exclude_paths: body.exclude_paths,
  }).catch((e) => {
    throw e;
  });

  const sites = result.results.map((r) =>
    parseFromMarkdown(r.url, r.raw_content, "tavily-crawl")
  );
  const ingest = await handleIngest(env, {
    sites,
    classify: body.classify === true,
  });

  return {
    ok: true,
    provider: "tavily",
    base_url: result.base_url,
    crawled: sites.length,
    ingest,
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
