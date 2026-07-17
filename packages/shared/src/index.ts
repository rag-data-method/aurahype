export const GENERATION_MODELS = ["sol", "terra", "luna"] as const;

export type GenerationModel = (typeof GENERATION_MODELS)[number];
export type JobStatus = "queued" | "processing" | "published" | "failed";

export interface InstagramProfile {
  username: string;
  name?: string;
  biography?: string;
  website?: string;
  profilePictureUrl?: string;
  followersCount?: number;
  mediaCount?: number;
  media: Array<{
    id: string;
    caption?: string;
    mediaType?: string;
    mediaUrl?: string;
    thumbnailUrl?: string;
    permalink?: string;
    timestamp?: string;
  }>;
}

export interface CreateGenerationRequest {
  username: string;
  model: GenerationModel;
  consent: true;
}

export interface GenerationJob {
  id: string;
  username: string;
  model: GenerationModel;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  profile: InstagramProfile;
  siteSlug?: string;
  errorMessage?: string;
}

export interface GeneratedSite {
  slug: string;
  title: string;
  brandName: string;
  tagline: string;
  about: string;
  primaryColor: string;
  accentColor: string;
  ctaLabel: string;
  ctaUrl?: string;
  instagramUrl: string;
  gallery: Array<{
    imageUrl: string;
    alt: string;
    caption?: string;
  }>;
  generatedWith: GenerationModel;
}

const USERNAME = /^[a-zA-Z0-9._]{1,30}$/;

export function isGenerationModel(value: unknown): value is GenerationModel {
  return typeof value === "string" && (GENERATION_MODELS as readonly string[]).includes(value);
}

export function parseCreateGenerationRequest(value: unknown): CreateGenerationRequest {
  if (!value || typeof value !== "object") throw new Error("Corpo da requisição inválido.");
  const input = value as Record<string, unknown>;
  const username = typeof input.username === "string" ? input.username.replace(/^@/, "").trim() : "";

  if (!USERNAME.test(username)) {
    throw new Error("Informe um usuário do Instagram válido, sem @.");
  }
  if (!isGenerationModel(input.model)) {
    throw new Error("Escolha Sol, Terra ou Luna.");
  }
  if (input.consent !== true) {
    throw new Error("A autorização para usar os dados do perfil é obrigatória.");
  }

  return { username, model: input.model, consent: true };
}

export function isGeneratedSite(value: unknown): value is GeneratedSite {
  if (!value || typeof value !== "object") return false;
  const site = value as Record<string, unknown>;
  return (
    typeof site.slug === "string" &&
    /^[a-z0-9-]{3,80}$/.test(site.slug) &&
    typeof site.title === "string" &&
    typeof site.brandName === "string" &&
    typeof site.tagline === "string" &&
    typeof site.about === "string" &&
    typeof site.primaryColor === "string" &&
    typeof site.accentColor === "string" &&
    typeof site.ctaLabel === "string" &&
    typeof site.instagramUrl === "string" &&
    Array.isArray(site.gallery) &&
    isGenerationModel(site.generatedWith)
  );
}
