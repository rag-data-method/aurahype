import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { GENERATION_MODELS, type GeneratedSite, type GenerationJob, type GenerationModel } from "@site-forge/shared";
import "./styles.css";

// Registra o service worker para permitir "Instalar app" no Android/iOS.
// Silencioso em desenvolvimento — só registra quando existe SW no build final.
if ("serviceWorker" in navigator && window.location.protocol === "https:") {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch(() => undefined);
  });
}

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface Window {
    __SITE_FORGE_RUNTIME__?: { apiUrl?: string };
  }
}

const apiBaseUrl = (import.meta.env.VITE_API_URL || window.__SITE_FORGE_RUNTIME__?.apiUrl || "").replace(/\/$/, "");

const modelCopy: Record<GenerationModel, { title: string; promise: string; badge: string }> = {
  sol: { title: "Sol", promise: "energia que atropela o feed", badge: "manifesto de luz" },
  terra: { title: "Terra", promise: "verdade que segura os olhos", badge: "editorial de raiz" },
  luna: { title: "Luna", promise: "presença que a gente lembra", badge: "cinema noturno" }
};

interface GenerationResponse {
  job: GenerationJob;
  site: GeneratedSite;
  shareUrl?: string;
}

async function requestGeneration(body: { username: string; model: GenerationModel; consent: true }): Promise<GenerationResponse> {
  if (!apiBaseUrl) throw new Error("A URL da API ainda não foi configurada. Faça o deploy da infraestrutura AWS.");
  const response = await fetch(`${apiBaseUrl}/jobs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = (await response.json()) as GenerationResponse & { message?: string };
  if (!response.ok) throw new Error(payload.message || "Não foi possível gerar seu site.");
  return payload;
}

function GeneratedLanding({ site }: { site: GeneratedSite }) {
  return <section className="generated-site" style={{ "--brand": site.primaryColor, "--accent": site.accentColor } as CSSProperties}>
    <div className="site-topline"><span>feito com {site.generatedWith}</span><a href={site.instagramUrl} target="_blank" rel="noreferrer">Instagram ↗</a></div>
    <div className="site-hero">
      <p className="eyebrow">{site.brandName}</p>
      <h2>{site.title}</h2>
      <p className="site-tagline">{site.tagline}</p>
      {site.ctaUrl && <a className="site-cta" href={site.ctaUrl} target="_blank" rel="noreferrer">{site.ctaLabel} <span>→</span></a>}
    </div>
    <div className="site-about"><p>{site.about}</p></div>
    {site.gallery.length > 0 && <div className="site-gallery">{site.gallery.slice(0, 6).map((item, index) => <figure key={`${item.imageUrl}-${index}`}><img src={item.imageUrl} alt={item.alt} loading="lazy" /><figcaption>{item.caption}</figcaption></figure>)}</div>}
  </section>;
}

function useInstallPrompt() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent>();
  const [installed, setInstalled] = useState(false);
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    const captureAndroidPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const markInstalled = () => { setInstalled(true); setInstallPrompt(undefined); };
    window.addEventListener("beforeinstallprompt", captureAndroidPrompt);
    window.addEventListener("appinstalled", markInstalled);

    const alreadyStandalone = window.matchMedia("(display-mode: standalone)").matches
      || (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setInstalled(alreadyStandalone);

    const isIos = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
    if (isIos && !alreadyStandalone) setShowIosHint(true);

    return () => {
      window.removeEventListener("beforeinstallprompt", captureAndroidPrompt);
      window.removeEventListener("appinstalled", markInstalled);
    };
  }, []);

  return {
    installed,
    canInstall: Boolean(installPrompt),
    showIosHint,
    async install() {
      if (!installPrompt) return;
      await installPrompt.prompt();
      await installPrompt.userChoice;
      setInstallPrompt(undefined);
    }
  };
}

function App() {
  const [username, setUsername] = useState("");
  const [model, setModel] = useState<GenerationModel>("terra");
  const [consent, setConsent] = useState(false);
  const [site, setSite] = useState<GeneratedSite>();
  const [shareUrl, setShareUrl] = useState<string>();
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const install = useInstallPrompt();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setSite(undefined);
    setShareUrl(undefined);
    setSubmitting(true);
    try {
      const cleanUsername = username.replace(/^@+/, "").trim();
      const response = await requestGeneration({ username: cleanUsername, model, consent: true });
      setSite(response.site);
      setShareUrl(response.shareUrl);
      requestAnimationFrame(() => document.querySelector(".result")?.scrollIntoView({ behavior: "smooth" }));
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Não foi possível gerar seu site.");
    } finally {
      setSubmitting(false);
    }
  }

  return <main>
    <section className="intro">
      <div className="orb-container"><div className="orb luna" /><div className="orb terra" /><div className="orb sol" /></div>
      <div className="triad-halo" aria-hidden="true" />
      <nav>
        <span className="wordmark">AURA<span>HYPE</span></span>
        {!install.installed && install.canInstall && <button type="button" className="install-button" onClick={install.install}>Instalar app  ↗</button>}
        {!install.installed && !install.canInstall && <span className="nav-note">galeria → obra de arte</span>}
      </nav>
      <div className="intro-copy">
        <p className="kicker">SUA GALERIA MERECE MUSEU</p>
        <h1>Cole seu <em>@</em>.<br />Veja sua galeria virar <em>obra de arte</em>.</h1>
        <p className="lede">Três GPTs autorais leem cada foto, cada legenda, cada pausa entre publicações — e devolvem uma página que parece assinada por uma diretora de arte. Em <b>60 segundos</b>. Direto do seu Instagram.</p>
        <form onSubmit={submit} className="hero-generator">
          <label className="hero-profile-field">
            <span>COMECE PELO SEU @</span>
            <div>
              <b>@</b>
              <input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="seuperfil" autoComplete="off" required maxLength={30} aria-label="Seu usuário no Instagram" />
              <button type="submit" disabled={submitting || !consent || !username.trim()}>{submitting ? "TRANSFORMANDO…" : "VIRAR OBRA DE ARTE  →"}</button>
            </div>
          </label>
          <fieldset className="hero-model-choice">
            <legend>QUAL GPT ASSINA</legend>
            <div className="model-pills">{GENERATION_MODELS.map((item) => <label className={model === item ? "selected" : ""} key={item}>
              <input type="radio" name="model" value={item} checked={model === item} onChange={() => setModel(item)} />
              <strong>{modelCopy[item].title}</strong>
              <small>{modelCopy[item].badge}</small>
            </label>)}</div>
            <p className="model-promise" aria-live="polite"><i>{modelCopy[model].title}</i> — {modelCopy[model].promise}.</p>
          </fieldset>
          <label className="hero-consent">
            <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} required />
            <span>Este perfil é meu — ou tenho autorização de quem é.</span>
          </label>
        </form>
        {error && <p className="error" role="alert">{error}</p>}
        {install.showIosHint && !install.installed && <p className="install-hint">Pra instalar no iPhone: toque no botão de <b>compartilhar</b> no Safari e depois em <b>“Adicionar à Tela de Início”</b>.</p>}
      </div>
      <div className="scroll-hint">DESLIZE PRA VER A MÁGICA <span>↓</span></div>
    </section>

    <section className="forge">
      <div className="forge-title"><p className="kicker">EM 60 SEGUNDOS</p><h2>Você cola o <i>@</i>.<br />A gente devolve <i>presença.</i></h2></div>
      <div className="how-it-works">
        <article><span>01</span><h3>Cola seu @</h3><p>Instagram, TikTok ou Twitch. Escolhe Sol, Terra ou Luna. Um clique só.</p></article>
        <article><span>02</span><h3>Sol, Terra & Luna leem sua alma</h3><p>Três GPTs autorais analisam cada foto, legenda e cor. Extraem paleta, voz e ritmo.</p></article>
        <article><span>03</span><h3>O mundo vê o que você já era</h3><p>Uma página assinada, com CTA, galeria e link pronto pra bio. Compartilha. Vira hype.</p></article>
      </div>
    </section>

    {site && <section className="result">
      <div className="result-label">
        <span>PRONTO</span>
        <p>Sua galeria, <i>virada museu.</i></p>
      </div>
      {shareUrl && <p className="share-line">Compartilha: <a href={shareUrl} target="_blank" rel="noreferrer">{shareUrl}</a></p>}
      <GeneratedLanding site={site} />
    </section>}
    <footer>AuraHype · Sol, Terra e Luna transformam seu @ em obra de arte · dados usados apenas com autorização</footer>
  </main>;
}

createRoot(document.getElementById("root")!).render(<App />);
