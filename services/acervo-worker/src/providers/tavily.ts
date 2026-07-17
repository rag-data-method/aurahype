/**
 * Cliente Tavily minimalista pros endpoints /extract e /crawl.
 *
 * Docs: https://docs.tavily.com/documentation/api-reference/endpoint/extract
 *       https://docs.tavily.com/documentation/api-reference/endpoint/crawl
 *
 * Auth: passamos `api_key` no body (Tavily aceita tanto body quanto
 * `Authorization: Bearer tvly-...`). Body eh mais portavel entre SDKs.
 */

const TAVILY_EXTRACT = "https://api.tavily.com/extract";
const TAVILY_CRAWL = "https://api.tavily.com/crawl";

export interface TavilyExtractParams {
  urls: string[]; // max 20
  extract_depth?: "basic" | "advanced";
  format?: "markdown" | "text";
  query?: string;
  chunks_per_source?: number; // 1-5, so com query
  include_images?: boolean;
  include_favicon?: boolean;
  timeout?: number; // 1-60s
}

export interface TavilyExtractResult {
  results: Array<{
    url: string;
    raw_content: string;
    images?: string[];
    favicon?: string;
  }>;
  failed_results: Array<{ url: string; error: string }>;
  response_time: number;
  request_id: string;
}

export async function tavilyExtract(
  apiKey: string,
  params: TavilyExtractParams
): Promise<TavilyExtractResult> {
  const body = {
    api_key: apiKey,
    urls: params.urls,
    extract_depth: params.extract_depth ?? "advanced", // "advanced" cobre JS/Lovable
    format: params.format ?? "markdown",
    query: params.query,
    chunks_per_source: params.query ? params.chunks_per_source ?? 3 : undefined,
    include_images: params.include_images ?? false,
    include_favicon: params.include_favicon ?? false,
    timeout: params.timeout ?? 30,
  };
  const res = await fetch(TAVILY_EXTRACT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`tavily extract HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as TavilyExtractResult;
}

export interface TavilyCrawlParams {
  url: string;
  max_depth?: number; // 1-5, default 1
  max_breadth?: number; // default 20
  limit?: number; // default 50
  instructions?: string; // guidance semantica pro crawler
  chunks_per_source?: number; // 1-5, so com instructions
  extract_depth?: "basic" | "advanced";
  format?: "markdown" | "text";
  select_paths?: string[]; // regex
  exclude_paths?: string[];
  select_domains?: string[];
  exclude_domains?: string[];
  allow_external?: boolean;
  include_images?: boolean;
  include_favicon?: boolean;
  timeout?: number; // 10-150s
}

export interface TavilyCrawlResult {
  base_url: string;
  results: Array<{
    url: string;
    raw_content: string;
    images?: string[];
    favicon?: string;
  }>;
  response_time: number;
  request_id: string;
}

export async function tavilyCrawl(
  apiKey: string,
  params: TavilyCrawlParams
): Promise<TavilyCrawlResult> {
  const body = {
    api_key: apiKey,
    url: params.url,
    max_depth: params.max_depth ?? 1,
    max_breadth: params.max_breadth ?? 20,
    limit: params.limit ?? 20,
    instructions: params.instructions,
    chunks_per_source: params.instructions
      ? params.chunks_per_source ?? 3
      : undefined,
    extract_depth: params.extract_depth ?? "basic",
    format: params.format ?? "markdown",
    select_paths: params.select_paths,
    exclude_paths: params.exclude_paths,
    select_domains: params.select_domains,
    exclude_domains: params.exclude_domains,
    allow_external: params.allow_external ?? true,
    include_images: params.include_images ?? false,
    include_favicon: params.include_favicon ?? false,
    timeout: params.timeout ?? 60,
  };
  const res = await fetch(TAVILY_CRAWL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`tavily crawl HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as TavilyCrawlResult;
}
