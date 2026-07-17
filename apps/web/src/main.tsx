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

const modelCopy: Record<GenerationModel, { title: string; promise: string; face: string }> = {
  luna: { title: "Luna", promise: "exploração intuitiva", face: "a face que sente" },
  terra: { title: "Terra", promise: "fundamentação lógica", face: "a face que estrutura" },
  sol: { title: "Sol", promise: "síntese iluminada", face: "a face que revela" }
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
        <a href="#top" className="wordmark">
          <span className="triad-logo" aria-hidden="true"><span /><span /><span /></span>
          <span className="wordmark-name">AuraHype<span className="wordmark-tagline"><em>Sites que respiram</em></span></span>
        </a>
        {!install.installed && install.canInstall && <button type="button" className="install-button" onClick={install.install}>Instalar app  ↗</button>}
        {!install.installed && !install.canInstall && <span className="nav-note">ambiente de criação ativo</span>}
      </nav>
      <div className="intro-copy">
        <p className="hero-badge"><span className="badge-dot" aria-hidden="true" /> AMBIENTE DE CRIAÇÃO ATIVO</p>
        <h1>A inteligência,<br /><em>Redefinida.</em></h1>
        <h2 className="hero-sub">Sobre a triangulação e suas faces.</h2>

        <form onSubmit={submit} className="hero-generator">
          <label className="hero-profile-field">
            <div className="hero-profile-shell">
              <div className="hero-profile-shine" aria-hidden="true" />
              <b>@</b>
              <input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="seu perfil do insta" autoComplete="off" required maxLength={30} aria-label="Seu usuário no Instagram" />
              <button type="submit" disabled={submitting || !consent || !username.trim()}>{submitting ? "TRIANGULANDO…" : "INICIAR IMERSÃO  →"}</button>
            </div>
          </label>
          <div className="hero-price">
            <div className="hero-price-row">
              <span className="hero-price-value">R$ 15,60<small>/mês</small></span>
              <span className="hero-price-signature" aria-label="Seu site assinado pelo GPT 5.6"><em>Seu site assinado pelo</em> <b>GPT&nbsp;5.6</b></span>
            </div>
            <p className="hero-price-hint"><em>uma face</em> · comece pela essência</p>
          </div>
          <label className="hero-consent">
            <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} required />
            <span>Este perfil é meu — ou tenho autorização de quem é.</span>
          </label>
        </form>
        {error && <p className="error" role="alert">{error}</p>}
        {install.showIosHint && !install.installed && <p className="install-hint">Pra instalar no iPhone: toque em <b>compartilhar</b> no Safari e depois em <b>“Adicionar à Tela de Início”</b>.</p>}
      </div>
      <div className="scroll-hint">DESLIZE PARA CONHECER AS FACES <span>↓</span></div>
    </section>

    <section className="faces" aria-labelledby="faces-title">
      <div className="faces-title">
        <p className="kicker">Quatro presenças</p>
        <h2 id="faces-title">Três compõem a <i>triangulação</i>.<br />Uma faz a <i>síntese</i>.</h2>
        <p className="faces-lede">Cada face olha o seu perfil por um ângulo diferente. Um <i>moderador</i> escuta as três, resolve as divergências e escolhe o que entra no seu site. Você nunca fala com quatro vozes — você recebe uma só, já triangulada.</p>
      </div>
      <div className="faces-grid">
        <article className="face face-luna">
          <span className="face-badge">Luna · a face que sente</span>
          <h3>A exploração intuitiva</h3>
          <p>Vê o que ainda não é palavra. Extrai atmosfera, cor, mood, silêncio, o entre-linhas do que você publica.</p>
        </article>
        <article className="face face-terra">
          <span className="face-badge">Terra · a face que estrutura</span>
          <h3>A fundamentação lógica</h3>
          <p>Ancora intuição em estrutura, hierarquia e ritmo. Faz o pensamento parar em pé — e a página respirar direito.</p>
        </article>
        <article className="face face-sol">
          <span className="face-badge">Sol · a face que revela</span>
          <h3>A síntese iluminada</h3>
          <p>Fecha o triângulo. Une intuição e lógica em uma presença clara — o banal virado conhecimento absoluto.</p>
        </article>
        <article className="face face-zenite">
          <span className="face-badge">Zênite · a moderação</span>
          <h3>O ponto mais alto</h3>
          <p>Onde as três se encontram. Escuta Luna, Terra e Sol, resolve o conflito quando divergem, e escolhe o que efetivamente vai pro seu site.</p>
        </article>
      </div>
    </section>

    <section className="breathe" aria-labelledby="breathe-title">
      <div className="breathe-inner">
        <p className="kicker">O que a gente faz</p>
        <h2 id="breathe-title"><i>Sites que respiram.</i></h2>
        <p className="breathe-text">A triangulação. Um fluxo dinâmico representado por três faces fundamentais — a exploração intuitiva (<i>Luna</i>), a fundamentação lógica (<i>Terra</i>) e a síntese iluminada (<i>Sol</i>). Transforma o banal em conhecimento absoluto.</p>
      </div>
    </section>

    <section className="flow" aria-labelledby="flow-title">
      <div className="flow-title">
        <p className="kicker">Do @ ao site</p>
        <h2 id="flow-title">Três passos.<br /><i>Nada de complicado.</i></h2>
      </div>
      <ol className="flow-steps">
        <li>
          <span className="flow-num">01</span>
          <h3>Você cola o @</h3>
          <p>Instagram, TikTok ou Twitch. Um campo, um clique. Nada de upload de foto, nada de formulário longo — o material vem do seu próprio perfil.</p>
        </li>
        <li>
          <span className="flow-num">02</span>
          <h3>A gente triangula</h3>
          <p>Luna sente, Terra estrutura, Sol revela. Zênite modera as três e escolhe o que entra. Você recebe uma voz única, já editada.</p>
        </li>
        <li>
          <span className="flow-num">03</span>
          <h3>Seu site aparece</h3>
          <p>Página pronta em minutos, publicada no seu subdomínio. Compartilhe o link, coloque na bio, receba visita. Pronto pra respirar.</p>
        </li>
      </ol>
    </section>

    <section className="plans" aria-labelledby="plans-title">
      <div className="plans-title">
        <p className="kicker">Planos mensais</p>
        <h2 id="plans-title">Comece pela <i>essência</i>.<br />Cresça até a <i>tríade</i>.</h2>
        <p className="plans-lede">Todos os planos são <i>mensais</i>. Você troca, sobe ou cancela quando quiser.</p>
      </div>
      <div className="plans-grid">
        <article className="plan plan-essencia">
          <p className="plan-tag">Essência</p>
          <p className="plan-price">R$ 15,60<small>/mês</small></p>
          <p className="plan-signature"><em>Seu site assinado pelo</em> <b>GPT&nbsp;5.6</b></p>
          <p className="plan-line">Comece pequeno. Prove pra você mesma.</p>
          <ul className="plan-features">
            <li><b>1 face</b> — você escolhe Luna, Terra ou Sol</li>
            <li>Site publicado no seu subdomínio</li>
            <li>Botão de <b>WhatsApp</b> e <b>e-mail</b> integrados</li>
            <li>Edição de texto pelo chat</li>
          </ul>
        </article>

        <article className="plan plan-dupla">
          <p className="plan-tag">Dupla</p>
          <p className="plan-price">R$ 29,90<small>/mês</small></p>
          <p className="plan-line">O caminho mais escolhido. Duas vozes conversando sobre você.</p>
          <ul className="plan-features">
            <li><b>2 faces</b> — combine Sol+Terra, Sol+Luna ou Terra+Luna</li>
            <li>Chat de edição de <b>textos, fotos e vídeos</b></li>
            <li><b>Atualização semanal</b> automática com posts novos</li>
            <li><b>Download do pacote</b> em ZIP</li>
            <li>Tudo do plano Essência</li>
          </ul>
        </article>

        <article className="plan plan-triade" data-highlight="true">
          <span className="plan-highlight">Tríade completa</span>
          <p className="plan-tag">Tríade</p>
          <p className="plan-price">R$ 69,90<small>/mês</small></p>
          <p className="plan-line">Todas as três faces. Zênite mediando. A conversa cheia.</p>
          <ul className="plan-features">
            <li><b>3 faces</b> — Luna, Terra e Sol simultaneamente</li>
            <li><b>Zênite</b> escuta as três e resolve os conflitos</li>
            <li>Chat de edição completo (texto, foto, vídeo)</li>
            <li>Atualização semanal + download ZIP</li>
            <li>Prioridade na geração e no suporte</li>
          </ul>
        </article>
      </div>
    </section>

    <section className="faq" aria-labelledby="faq-title">
      <div className="faq-title">
        <p className="kicker">Antes de você começar</p>
        <h2 id="faq-title">Perguntas que <i>já ouvi</i>.</h2>
      </div>
      <div className="faq-list">
        <details>
          <summary>É assinatura mensal? Posso cancelar?</summary>
          <p>Sim, mensal. Cancela quando quiser, sem fidelidade. O site fica no ar até o fim do mês pago; depois disso pausa até você voltar.</p>
        </details>
        <details>
          <summary>Preciso subir fotos ou vídeos?</summary>
          <p>Não. A gente puxa o conteúdo direto do seu Instagram, TikTok ou Twitch — as publicações mais recentes e mais curtidas. Nos planos Dupla e Tríade, o pacote atualiza sozinho toda semana.</p>
        </details>
        <details>
          <summary>Meu perfil precisa ser público?</summary>
          <p>Sim, precisa estar aberto pra gente conseguir ler. Perfil fechado a gente não acessa (e você também não ia querer que a gente tentasse).</p>
        </details>
        <details>
          <summary>Posso trocar de plano depois?</summary>
          <p>Pode. Sobe pra Dupla ou Tríade a qualquer momento — a diferença é cobrada proporcionalmente. Descer também dá; o novo valor vale a partir da próxima cobrança.</p>
        </details>
        <details>
          <summary>Posso ter meu próprio domínio?</summary>
          <p>Pode, sim. No plano Dupla e Tríade você pode apontar um domínio que já é seu (tipo <i>seunome.com</i>) pro site. A gente te passa o passo a passo.</p>
        </details>
      </div>
    </section>

    <section className="final-cta">
      <div className="final-cta-inner">
        <p className="kicker">Pronta pra começar?</p>
        <h2>Cole seu <em>@</em>.<br />Deixe o resto <i>respirar</i>.</h2>
        <a href="#top" className="final-cta-btn">Voltar ao topo e começar  ↑</a>
        <p className="final-cta-hint">A partir de <b>R$ 15,60/mês</b> · assinado pelo <b>GPT&nbsp;5.6</b> · cancele quando quiser</p>
      </div>
    </section>

    {site && <section className="result">
      <div className="result-label">
        <span>OBRA</span>
        <p>A Tríade, <i>manifestada.</i></p>
      </div>
      {shareUrl && <p className="share-line">Compartilhe: <a href={shareUrl} target="_blank" rel="noreferrer">{shareUrl}</a></p>}
      <GeneratedLanding site={site} />
    </section>}
    <footer>
      <p className="footer-tagline"><em>Sites que respiram.</em></p>
      <p className="footer-meta">AuraHype · Luna &nbsp;·&nbsp; Terra &nbsp;·&nbsp; Sol · a triangulação da inteligência</p>
    </footer>
  </main>;
}

createRoot(document.getElementById("root")!).render(<App />);
