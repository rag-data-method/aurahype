import type { GeneratedSite, GenerationModel, InstagramProfile } from "@site-forge/shared";

/**
 * Cada "IA" — Sol, Terra e Luna — é um estilo autoral aplicado sobre os mesmos dados do perfil.
 * Deixamos os três com voz e paleta próprias para que o resultado varie de forma consistente
 * sem depender de um provedor de LLM. Futuramente, dá pra plugar Bedrock aqui sem mudar contrato.
 */
const PALETTES: Record<GenerationModel, { primary: string; accent: string; cta: string; brand: string }> = {
  sol: { primary: "#f24d1b", accent: "#ffca28", cta: "Me chama agora", brand: "Sol" },
  terra: { primary: "#3f5b3a", accent: "#c7a56f", cta: "Vamos criar", brand: "Terra" },
  luna: { primary: "#2a1f4d", accent: "#c9a2ff", cta: "Entra na experiência", brand: "Luna" }
};

const HERO_LINES: Record<GenerationModel, (name: string, biography?: string) => { title: string; tagline: string; about: string }> = {
  sol: (name, biography) => ({
    title: `${name.toUpperCase()} EM PLENA LUZ`,
    tagline: biography ? shorten(biography, 140) : "Energia que atropela o feed — impossível não olhar.",
    about: biography
      ? `${biography}\n\nA Sol pegou o que já era seu e transformou em manifesto. Direto, quente, contagiante — feito pra parar polegar e converter clique em conversa.`
      : "A Sol pega o que já é seu e transforma em manifesto. Direto, quente, contagiante — feito pra parar polegar e converter clique em conversa."
  }),
  terra: (name, biography) => ({
    title: `${name}, com raízes.`,
    tagline: biography ? shorten(biography, 160) : "Verdade que segura os olhos antes de qualquer clique.",
    about: biography
      ? `${biography}\n\nA Terra escolheu o essencial. Textura, tempo, respiro. Uma página que parece editorial de revista — mas é sua, e vive na sua bio.`
      : "A Terra escolhe o essencial. Textura, tempo, respiro. Uma página que parece editorial de revista — mas é sua, e vive na sua bio."
  }),
  luna: (name, biography) => ({
    title: `${name} — depois das luzes.`,
    tagline: biography ? shorten(biography, 160) : "Presença noturna, magnética, feita pra ser lembrada.",
    about: biography
      ? `${biography}\n\nA Luna assinou uma atmosfera: sofisticada, cinematográfica, com respiro entre os enquadramentos. Cada rolagem é um novo plano.`
      : "A Luna assina uma atmosfera: sofisticada, cinematográfica, com respiro entre os enquadramentos. Cada rolagem é um novo plano."
  })
};

export function buildSite(profile: InstagramProfile, model: GenerationModel): GeneratedSite {
  const palette = PALETTES[model];
  const name = profile.name?.trim() || profile.username;
  const copy = HERO_LINES[model](name, profile.biography);

  return {
    slug: buildSlug(profile.username, model),
    title: copy.title,
    brandName: `${palette.brand} · @${profile.username}`,
    tagline: copy.tagline,
    about: copy.about,
    primaryColor: palette.primary,
    accentColor: palette.accent,
    ctaLabel: palette.cta,
    ctaUrl: profile.website || `https://instagram.com/${profile.username}`,
    instagramUrl: `https://instagram.com/${profile.username}`,
    gallery: profile.media
      .filter((media) => Boolean(media.mediaUrl || media.thumbnailUrl))
      .slice(0, 6)
      .map((media, index) => ({
        imageUrl: (media.mediaUrl || media.thumbnailUrl) as string,
        alt: media.caption ? shorten(media.caption, 80) : `Publicação ${index + 1} de @${profile.username}`,
        caption: media.caption ? shorten(media.caption, 120) : undefined
      })),
    generatedWith: model
  };
}

function buildSlug(username: string, model: GenerationModel): string {
  const clean = username.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "perfil";
  const stamp = Date.now().toString(36).slice(-5);
  return `${clean}-${model}-${stamp}`;
}

function shorten(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}
