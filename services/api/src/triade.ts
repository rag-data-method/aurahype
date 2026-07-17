/**
 * Pipeline Tríade 56 — Luna → Terra → Sol.
 *
 * Cada face é um deployment separado no Azure OpenAI (gpt-5.6-luna, -terra, -sol).
 * O que roda depende do plano do cliente:
 *
 *   plan="15" → só Luna (gera copy + HTML inline básico via lunaOnlyHtml)
 *   plan="35" → Luna + Terra (Terra gera HTML completo a partir da Luna)
 *   plan="96" → Luna + Terra + Sol (Sol refina o HTML da Terra)
 *
 * Cada chamada usa `respond()` de azure-openai.ts. As instruções (system prompts)
 * ficam versionadas aqui pra facilitar iterar copy/estilo sem tocar em infra.
 */

import { randomUUID } from "node:crypto";
import type {
  GeneratedSite,
  LunaOutput,
  Palette,
  Plan,
  SolOutput,
  TerraOutput,
  TriadeModel,
} from "@site-forge/shared";
import { config } from "./config.js";
import { parseJsonFromModel, respond } from "./azure-openai.js";

// ============================================================
// LUNA — a exploração intuitiva, essência do negócio, copy, paleta
// ============================================================

const LUNA_INSTRUCTIONS = `Você é Luna, a face intuitiva da Tríade 56. Sua função é extrair a ESSÊNCIA de um negócio a partir de um brief curto e devolver dados estruturados que Terra usará para arquitetar o site e Sol usará para refinar.

Você é sensível, brasileira, poética mas direta. Nada de clichê corporate. Nada de "elevamos seu negócio ao próximo nível". Você fala como uma diretora de arte experiente que entendeu o cliente em 30 segundos.

Devolva SOMENTE um JSON válido no formato exato abaixo, sem markdown, sem texto antes ou depois:

{
  "essencia": "1-2 frases descrevendo a essência do negócio, o que ele realmente é.",
  "tom": "3-4 adjetivos separados por vírgula. Ex: 'quente, confiante, artesanal'.",
  "paleta": {
    "primary": "#RRGGBB",
    "accent":  "#RRGGBB",
    "bg":      "#RRGGBB",
    "text":    "#RRGGBB"
  },
  "headline": "Frase de impacto principal, máximo 12 palavras.",
  "subheadline": "Complemento explicando o que o negócio faz, 1 frase.",
  "cta_texto": "Texto do botão principal. Máximo 4 palavras. Direto.",
  "palavras_chave": ["3","a","6","palavras","que","o","cliente","procura"]
}

Regras da paleta:
- primary é a cor de marca principal (usada em botões, headings, destaques).
- accent é uma cor complementar (usada em ícones, hover states).
- bg é o fundo dominante — pode ser claro (#fafafa) ou escuro (#0a0a0a) dependendo do tom.
- text é a cor do corpo do texto — sempre alto contraste com bg.
- Cores devem HARMONIZAR com o tom que você definiu. Se o tom é "quente, artesanal", pense em terracota + creme. Se é "noturno, sofisticado", pense em índigo profundo + dourado.
- Nada de #FF0000 puro ou paletas óbvias.`;

export async function runLuna(brief: string): Promise<LunaOutput> {
  const { text } = await respond({
    deployment: config.azureOpenAiDeploymentLuna(),
    instructions: LUNA_INSTRUCTIONS,
    input: `Brief do cliente:\n\n${brief}\n\nDevolva o JSON estruturado.`,
    temperature: 0.8,
    max_output_tokens: 1500,
    timeout_ms: 20000,
  });

  const parsed = parseJsonFromModel<LunaOutput>(text);
  validateLuna(parsed);
  return parsed;
}

function validateLuna(luna: LunaOutput): void {
  const missing: string[] = [];
  if (!luna.essencia?.trim()) missing.push("essencia");
  if (!luna.tom?.trim()) missing.push("tom");
  if (!luna.headline?.trim()) missing.push("headline");
  if (!luna.subheadline?.trim()) missing.push("subheadline");
  if (!luna.cta_texto?.trim()) missing.push("cta_texto");
  if (!Array.isArray(luna.palavras_chave)) missing.push("palavras_chave");
  if (!luna.paleta) missing.push("paleta");
  else {
    for (const k of ["primary", "accent", "bg", "text"] as const) {
      if (!/^#[0-9a-fA-F]{6}$/.test(luna.paleta[k] ?? "")) missing.push(`paleta.${k}`);
    }
  }
  if (missing.length > 0) {
    throw new Error(`Luna devolveu JSON incompleto. Campos ausentes: ${missing.join(", ")}`);
  }
}

// ============================================================
// TERRA — fundamentação lógica, arquitetura HTML
// ============================================================

const TERRA_INSTRUCTIONS = `Você é Terra, a face lógica da Tríade 56. Sua função é ARQUITETAR o HTML completo de uma landing page a partir da essência que a Luna definiu.

Você é técnica, brasileira, minuciosa. Constrói HTML semântico, acessível, responsivo, com CSS inline (sem <link>, sem framework externo). Não usa JavaScript. Não usa fontes externas (só system-ui, sans-serif, serif, monospace). Não usa imagens externas — usa SVG inline ou gradientes CSS.

Devolva SOMENTE um JSON válido no formato:

{
  "html": "<!DOCTYPE html><html lang='pt-BR'>...</html>",
  "sections": ["hero","sobre","servicos","cta"]
}

Regras do HTML:
1. Um único arquivo self-contained. Nada externo.
2. <style> dentro do <head>. Usa a paleta da Luna (primary, accent, bg, text) via CSS custom properties (:root { --c-primary: ...; }).
3. Layout responsivo com CSS Grid ou Flexbox. Media query para mobile (<720px).
4. Hero com headline + subheadline + CTA da Luna.
5. Seção "sobre" com a essência.
6. Seção com 3 blocos (serviços/valores/o-que-fazemos) — invente conteúdo coerente com o brief e a essência.
7. CTA final grande, botão com cta_texto da Luna.
8. Rodapé mínimo com "Assinado pela Tríade 56" + ano atual.
9. Tamanho do HTML: máximo ~8000 caracteres. Nada de repetir 20 lorem ipsum.
10. Zero comentários no HTML. Zero espaços extras.

Regras do JSON:
- "sections" lista os IDs das seções que você usou, na ordem em que aparecem.
- Nada de \`\`\`html ou \`\`\`json fences.`;

export async function runTerra(brief: string, luna: LunaOutput): Promise<TerraOutput> {
  const input = [
    `Brief do cliente:`,
    brief,
    ``,
    `Essência definida pela Luna:`,
    JSON.stringify(luna, null, 2),
    ``,
    `Monte o HTML completo da landing page conforme suas regras. Use a paleta da Luna.`,
  ].join("\n");

  const { text } = await respond({
    deployment: config.azureOpenAiDeploymentTerra(),
    instructions: TERRA_INSTRUCTIONS,
    input,
    temperature: 0.5,
    max_output_tokens: 8000,
    timeout_ms: 25000,
  });

  const parsed = parseJsonFromModel<TerraOutput>(text);
  if (!parsed.html || typeof parsed.html !== "string" || parsed.html.length < 200) {
    throw new Error("Terra devolveu HTML inválido ou muito curto.");
  }
  if (!Array.isArray(parsed.sections)) parsed.sections = [];
  return parsed;
}

// ============================================================
// SOL — síntese iluminada, refinamento final
// ============================================================

const SOL_INSTRUCTIONS = `Você é Sol, a face síntese da Tríade 56. Sua função é REFINAR o HTML que a Terra construiu, elevando-o para um resultado editorial.

Você é a direção de arte final. Toma o HTML da Terra e refina:
- Hierarquia visual (tamanhos, pesos, respiros).
- Microcopy (ajustes finos em textos, sem trocar a estrutura).
- Micro-animações CSS (transitions em hover, sem @keyframes complexos, sem JS).
- Contraste e legibilidade (garante WCAG AA).
- Elementos decorativos sutis (SVG inline, gradientes, sombras suaves).

Você NÃO troca a estrutura de seções. NÃO adiciona seções novas. NÃO tira seções existentes. NÃO adiciona JS. NÃO adiciona dependências externas.

Devolva SOMENTE um JSON válido no formato:

{
  "html": "<!DOCTYPE html>...</html>",
  "decisoes": ["3 a 6 bullet points curtos descrevendo o que você refinou"]
}

Regras:
- Retorne o HTML COMPLETO refinado, não um diff.
- Máximo ~9000 caracteres.
- decisoes deve listar mudanças concretas ("aumentei tamanho do headline pra 4rem", "adicionei transition 200ms em .cta:hover", etc). Não seja genérico.
- Zero fences markdown.`;

export async function runSol(
  brief: string,
  luna: LunaOutput,
  terra: TerraOutput
): Promise<SolOutput> {
  const input = [
    `Brief do cliente:`,
    brief,
    ``,
    `Essência da Luna:`,
    JSON.stringify(luna, null, 2),
    ``,
    `HTML atual construído pela Terra (seções: ${terra.sections.join(", ")}):`,
    terra.html,
    ``,
    `Refine este HTML seguindo suas regras. Preserve estrutura.`,
  ].join("\n");

  const { text } = await respond({
    deployment: config.azureOpenAiDeploymentSol(),
    instructions: SOL_INSTRUCTIONS,
    input,
    temperature: 0.4,
    max_output_tokens: 8000,
    timeout_ms: 25000,
  });

  const parsed = parseJsonFromModel<SolOutput>(text);
  if (!parsed.html || typeof parsed.html !== "string" || parsed.html.length < 200) {
    throw new Error("Sol devolveu HTML inválido ou muito curto.");
  }
  if (!Array.isArray(parsed.decisoes)) parsed.decisoes = [];
  return parsed;
}

// ============================================================
// Plano 15: Luna só — HTML gerado deterministicamente do JSON dela
// ============================================================

/**
 * Quando o plano é R$15,60, a gente não gasta chamada Terra/Sol. A gente
 * gera um HTML simples e limpo a partir do JSON da Luna. Um template
 * fixo, mas com a paleta e a copy da Luna aplicadas.
 *
 * O resultado é honesto: o plano 15 entrega uma landing correta,
 * responsiva, acessível — mas sem o refino que Terra e Sol trazem.
 */
export function lunaOnlyHtml(luna: LunaOutput, brief: string): string {
  const p = luna.paleta;
  const year = new Date().getUTCFullYear();
  const keywordsBadge = luna.palavras_chave
    .slice(0, 6)
    .map((k) => `<li>${escapeHtml(k)}</li>`)
    .join("");

  return [
    `<!DOCTYPE html>`,
    `<html lang="pt-BR">`,
    `<head>`,
    `<meta charset="utf-8"/>`,
    `<meta name="viewport" content="width=device-width,initial-scale=1"/>`,
    `<title>${escapeHtml(luna.headline)}</title>`,
    `<meta name="description" content="${escapeHtml(luna.subheadline)}"/>`,
    `<style>`,
    paletteCss(p),
    baseCss(),
    `</style>`,
    `</head>`,
    `<body>`,
    `<header class="hero">`,
    `<h1>${escapeHtml(luna.headline)}</h1>`,
    `<p class="sub">${escapeHtml(luna.subheadline)}</p>`,
    `<a class="cta" href="#contato">${escapeHtml(luna.cta_texto)}</a>`,
    `</header>`,
    `<section class="sobre">`,
    `<h2>Sobre</h2>`,
    `<p>${escapeHtml(luna.essencia)}</p>`,
    `<ul class="tags">${keywordsBadge}</ul>`,
    `</section>`,
    `<section id="contato" class="contato">`,
    `<h2>${escapeHtml(luna.cta_texto)}</h2>`,
    `<p>Fale com a gente e descubra o próximo passo.</p>`,
    `</section>`,
    `<footer><small>Assinado pela Tríade 56 · ${year}</small></footer>`,
    `</body>`,
    `</html>`,
  ].join("");
}

function paletteCss(p: Palette): string {
  return `:root{--c-primary:${p.primary};--c-accent:${p.accent};--c-bg:${p.bg};--c-text:${p.text};}`;
}

function baseCss(): string {
  return `*{box-sizing:border-box;margin:0;padding:0}body{background:var(--c-bg);color:var(--c-text);font-family:system-ui,-apple-system,sans-serif;line-height:1.6;-webkit-font-smoothing:antialiased}.hero{padding:6rem 1.5rem 4rem;max-width:960px;margin:0 auto;text-align:center}.hero h1{font-size:clamp(2rem,5vw,3.5rem);font-weight:700;letter-spacing:-0.02em;color:var(--c-primary);margin-bottom:1rem}.hero .sub{font-size:1.25rem;max-width:640px;margin:0 auto 2rem;opacity:0.85}.cta{display:inline-block;background:var(--c-primary);color:var(--c-bg);padding:0.9rem 2rem;border-radius:999px;text-decoration:none;font-weight:600;transition:transform 200ms ease,box-shadow 200ms ease}.cta:hover{transform:translateY(-2px);box-shadow:0 12px 32px -12px var(--c-accent)}section{padding:4rem 1.5rem;max-width:960px;margin:0 auto}section h2{font-size:clamp(1.5rem,3vw,2.25rem);color:var(--c-primary);margin-bottom:1.5rem}section p{font-size:1.1rem;max-width:720px;opacity:0.9}.tags{list-style:none;display:flex;flex-wrap:wrap;gap:0.5rem;margin-top:1.5rem}.tags li{padding:0.35rem 0.9rem;border:1px solid var(--c-accent);border-radius:999px;font-size:0.85rem;color:var(--c-accent)}.contato{text-align:center;padding:5rem 1.5rem}footer{padding:2rem 1.5rem;text-align:center;opacity:0.55;font-size:0.85rem}@media (max-width:720px){.hero{padding:4rem 1.25rem 3rem}section{padding:3rem 1.25rem}}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ============================================================
// generateSite — orquestra o pipeline conforme o plano
// ============================================================

export async function generateSite(input: {
  brief: string;
  plan: Plan;
  handle?: string;
}): Promise<GeneratedSite> {
  const luna = await runLuna(input.brief);

  let terra: TerraOutput | undefined;
  let sol: SolOutput | undefined;
  const modelsUsed: TriadeModel[] = ["luna"];
  let html: string;

  if (input.plan === "15") {
    html = lunaOnlyHtml(luna, input.brief);
  } else if (input.plan === "35") {
    terra = await runTerra(input.brief, luna);
    modelsUsed.push("terra");
    html = terra.html;
  } else {
    // plan === "96"
    terra = await runTerra(input.brief, luna);
    modelsUsed.push("terra");
    sol = await runSol(input.brief, luna, terra);
    modelsUsed.push("sol");
    html = sol.html;
  }

  return {
    slug: buildSlug(input.handle, input.plan),
    brief: input.brief,
    plan: input.plan,
    handle: input.handle,
    html,
    luna,
    terra,
    sol,
    models_used: modelsUsed,
    generated_at: new Date().toISOString(),
  };
}

function buildSlug(handle: string | undefined, plan: Plan): string {
  const base =
    handle
      ?.toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || `triade-${randomUUID().slice(0, 8)}`;
  const stamp = Date.now().toString(36).slice(-5);
  return `${base}-p${plan}-${stamp}`;
}
