/**
 * Contratos compartilhados entre backend Lambda (services/api) e frontend
 * (apps/web) do Tríade 56.
 *
 * Fluxo:
 *   cliente escreve um brief (+ @ opcional) → pipeline Luna → Terra → Sol
 *   (dependendo do plano) → HTML final salvo em S3.
 */

/** Nomes canônicos das três faces da Tríade. */
export const TRIADE_MODELS = ["luna", "terra", "sol"] as const;
export type TriadeModel = (typeof TRIADE_MODELS)[number];

/**
 * Planos de assinatura da Tríade 56:
 *   "15" → só Luna (R$ 15,60 — 1 GPT)
 *   "35" → Luna + Terra (R$ 35,60 — 2 GPTs)
 *   "96" → Tríade completa Luna + Terra + Sol (R$ 96,50 — 3 GPTs)
 */
export const PLANS = ["15", "35", "96"] as const;
export type Plan = (typeof PLANS)[number];

export type JobStatus = "queued" | "processing" | "published" | "failed";

// ----- entrada do cliente ------------------------------------------------

export interface CreateGenerationRequest {
  /** Descrição livre do negócio, ou o próprio handle Insta, ou ambos combinados. */
  brief: string;
  plan: Plan;
  /** Handle do Instagram opcional, guardado como metadado. Sem @. */
  handle?: string;
  /** Confirmação explícita — o cliente autoriza processar o brief. */
  consent: true;
}

// ----- saídas de cada face -----------------------------------------------

export interface Palette {
  primary: string;
  accent: string;
  bg: string;
  text: string;
}

/** O que a Luna devolve: essência + copy + paleta. */
export interface LunaOutput {
  essencia: string;
  tom: string;
  paleta: Palette;
  headline: string;
  subheadline: string;
  cta_texto: string;
  palavras_chave: string[];
}

/** O que a Terra devolve: HTML estruturado. */
export interface TerraOutput {
  html: string;
  sections: string[];
}

/** O que a Sol devolve: HTML refinado + decisões que ela tomou. */
export interface SolOutput {
  html: string;
  decisoes: string[];
}

// ----- site persistido ---------------------------------------------------

export interface GeneratedSite {
  slug: string;
  brief: string;
  plan: Plan;
  handle?: string;
  /** HTML final (Sol se plano 96, Terra se 35, Luna-inline se 15). */
  html: string;
  luna: LunaOutput;
  terra?: TerraOutput;
  sol?: SolOutput;
  models_used: TriadeModel[];
  generated_at: string;
}

// ----- job trail --------------------------------------------------------

export interface GenerationJob {
  id: string;
  brief: string;
  plan: Plan;
  handle?: string;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  siteSlug?: string;
  errorMessage?: string;
}

// ----- helpers de tipo --------------------------------------------------

export function isTriadeModel(value: unknown): value is TriadeModel {
  return typeof value === "string" && (TRIADE_MODELS as readonly string[]).includes(value);
}

export function isPlan(value: unknown): value is Plan {
  return typeof value === "string" && (PLANS as readonly string[]).includes(value);
}

// ----- parser da requisição --------------------------------------------

const HANDLE_RE = /^[a-zA-Z0-9._]{1,30}$/;

export function parseCreateGenerationRequest(value: unknown): CreateGenerationRequest {
  if (!value || typeof value !== "object") {
    throw new Error("Corpo da requisição inválido.");
  }
  const input = value as Record<string, unknown>;

  const brief =
    typeof input.brief === "string" ? input.brief.trim() : "";
  if (brief.length < 3) {
    throw new Error("Descreva pelo menos rapidamente o que a Tríade vai criar (mínimo 3 caracteres).");
  }
  if (brief.length > 4000) {
    throw new Error("Brief muito longo (máx 4000 caracteres).");
  }

  if (!isPlan(input.plan)) {
    throw new Error("Plano inválido. Use 15, 35 ou 96.");
  }

  let handle: string | undefined;
  if (typeof input.handle === "string" && input.handle.trim()) {
    handle = input.handle.replace(/^@/, "").trim();
    if (!HANDLE_RE.test(handle)) {
      throw new Error("Handle do Instagram inválido.");
    }
  }

  if (input.consent !== true) {
    throw new Error("A autorização (consent) é obrigatória.");
  }

  return { brief, plan: input.plan, handle, consent: true };
}

// ----- aliases legacy (compat com apps/web atual) ----------------------
// O frontend em apps/web ainda importa GENERATION_MODELS/GenerationModel
// pra escolher a face antes de chamar o worker Cloudflare (MissCanvas).
// Quando o front migrar pra apontar pro API Gateway AWS novo (que usa
// {brief, plan}), estas aliases podem sumir. Por ora, mantém o build verde.

/** @deprecated Use TRIADE_MODELS. */
export const GENERATION_MODELS = TRIADE_MODELS;

/** @deprecated Use TriadeModel. */
export type GenerationModel = TriadeModel;

// ----- guard de site persistido ----------------------------------------

export function isGeneratedSite(value: unknown): value is GeneratedSite {
  if (!value || typeof value !== "object") return false;
  const site = value as Record<string, unknown>;
  return (
    typeof site.slug === "string" &&
    /^[a-z0-9-]{3,80}$/.test(site.slug) &&
    typeof site.brief === "string" &&
    isPlan(site.plan) &&
    typeof site.html === "string" &&
    !!site.luna &&
    typeof site.luna === "object" &&
    Array.isArray((site as { models_used?: unknown }).models_used)
  );
}
