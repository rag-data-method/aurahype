import { useEffect, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { GENERATION_MODELS, type GenerationModel } from "@site-forge/shared";
import "./styles.css";

// ─────────────────────────────────────────────────────────────────
// CONFIGURAÇÃO — Miriam, você mexe SÓ AQUI pra lançar:
//   1) TRIADE_API_URL = URL do worker MissCanvas que gera o site
//      (handleInstaSite). Probe 2026-07-17: misscanvas.com/api/insta-site = 404.
//      Endpoint vivo: https://2minutes.site/api/insta-site (CORS * OK).
//   2) WHATSAPP_MIRIAM = seu WhatsApp com DDI, só números (55 + DDD + número)
//
// Em produção esses valores vêm do runtime-config.js (Cloudflare Pages)
// ou de VITE_TRIADE_API / VITE_WHATSAPP em .env.local — o padrão abaixo
// é usado só se nenhum dos dois estiver setado.
// ─────────────────────────────────────────────────────────────────
declare global {
  interface Window {
    __TRIADE_RUNTIME__?: { apiUrl?: string; whatsapp?: string };
  }
}
const TRIADE_API_URL =
  (import.meta.env.VITE_TRIADE_API as string | undefined) ||
  window.__TRIADE_RUNTIME__?.apiUrl ||
  "https://2minutes.site/api/insta-site";
const WHATSAPP_MIRIAM =
  (import.meta.env.VITE_WHATSAPP as string | undefined) ||
  window.__TRIADE_RUNTIME__?.whatsapp ||
  "5511999999999"; // ← TROCA ESSE NÚMERO PELO SEU (não commitar número real sem OK)

// Registra o service worker para permitir "Instalar app" no Android/iOS.
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

const modelCopy: Record<GenerationModel, { title: string; promise: string; face: string }> = {
  luna: { title: "Luna", promise: "exploração intuitiva", face: "a face que sente" },
  terra: { title: "Terra", promise: "fundamentação lógica", face: "a face que estrutura" },
  sol: { title: "Sol", promise: "síntese iluminada", face: "a face que revela" }
};

// ─────────────────────────────────────────────────────────────────
// Chamada ao worker MissCanvas (handleInstaSite). Body compatível com
// o que ele espera: { handle, model, temp, async }. Se async=true, o
// worker devolve NDJSON com heartbeat + o URL final quando pronto.
// ─────────────────────────────────────────────────────────────────
interface GenerationResult {
  ok: boolean;
  url?: string;
  slug?: string;
  temporary?: boolean;
  voucher?: string;
  error?: string;
}

async function iniciarImersao(username: string, model: GenerationModel): Promise<GenerationResult> {
  const response = await fetch(TRIADE_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ handle: username, model, temp: true, async: false })
  });
  const contentType = response.headers.get("content-type") || "";
  // NDJSON: lê linha por linha e devolve a última { done: true }
  if (contentType.includes("ndjson") && response.body) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let last: GenerationResult = { ok: false };
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        try {
          const obj = JSON.parse(line) as GenerationResult & { done?: boolean };
          if (obj.done) last = obj;
        } catch { /* ignora linhas parciais */ }
      }
    }
    return last;
  }
  return (await response.json()) as GenerationResult;
}

function whatsappLink(mensagem: string): string {
  return `https://wa.me/${WHATSAPP_MIRIAM}?text=${encodeURIComponent(mensagem)}`;
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
  const [status, setStatus] = useState<"idle" | "gerando" | "pronto" | "erro">("idle");
  const [siteUrl, setSiteUrl] = useState<string>();
  const [errorMsg, setErrorMsg] = useState<string>();
  const install = useInstallPrompt();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMsg(undefined);
    setSiteUrl(undefined);
    setStatus("gerando");
    try {
      const cleanUsername = username.replace(/^@+/, "").trim();
      const result = await iniciarImersao(cleanUsername, model);
      if (result.ok && result.url) {
        setSiteUrl(result.url);
        setStatus("pronto");
      } else {
        throw new Error(result.error || "Não consegui gerar seu preview agora.");
      }
    } catch (submitError) {
      setErrorMsg(submitError instanceof Error ? submitError.message : "Não consegui gerar seu preview agora.");
      setStatus("erro");
    }
  }

  function planoWhatsapp(planoNome: string, preco: string) {
    const perfil = username ? `@${username.replace(/^@+/, "")}` : "meu @";
    return whatsappLink(`Oi Miriam! Quero assinar o plano ${planoNome} da Tríade 56 (${preco}/mês). Meu perfil é ${perfil}. Como pago?`);
  }

  return <main>
    <section className="intro">
      <div className="orb-container"><div className="orb luna" /><div className="orb terra" /><div className="orb sol" /></div>
      <div className="triad-halo" aria-hidden="true" />
      <span className="big-56" aria-hidden="true">56</span>
      <nav>
        <a href="#top" className="wordmark" aria-label="Tríade 56 — sites que respiram">
          <svg className="brand-emblem" viewBox="0 0 60 60" width="42" height="42" aria-hidden="true">
            <polygon points="30,8 54,52 6,52" fill="none" stroke="rgba(255,248,240,0.35)" strokeWidth="1.4" strokeLinejoin="round" />
            <circle cx="30" cy="8" r="2" fill="#a78bfa" />
            <circle cx="54" cy="52" r="2" fill="#fbbf24" />
            <circle cx="6" cy="52" r="2" fill="#34d399" />
            <text x="30" y="43" textAnchor="middle" fontFamily="Georgia, 'Instrument Serif', serif" fontStyle="italic" fontWeight="400" fontSize="26" fill="#fff8f0" letterSpacing="-1">56</text>
          </svg>
          <span className="wordmark-name">
            <span className="wordmark-primary"><em>Tríade</em></span>
            <span className="wordmark-tagline">sites que respiram</span>
          </span>
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
              <button type="submit" disabled={status === "gerando" || !consent || !username.trim()}>{status === "gerando" ? "TRIANGULANDO…" : "INICIAR IMERSÃO  →"}</button>
            </div>
          </label>
          <div className="hero-price">
            <div className="hero-price-row">
              <span className="hero-price-value">R$ 15,60<small>/mês</small></span>
              <span className="hero-price-signature" aria-label="Seu site assinado pelo GPT 5.6"><em>Seu site assinado pelo</em> <b>GPT&nbsp;5.6</b></span>
            </div>
            <p className="hero-price-hint"><em>preview grátis</em> · comece pela essência</p>
          </div>
          <label className="hero-consent">
            <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} required />
            <span>Este perfil é meu — ou tenho autorização de quem é.</span>
          </label>
        </form>
        {status === "gerando" && <p className="status-line">Luna sente, Terra estrutura, Sol revela. Zênite modera. <em>Levo 2 minutinhos.</em></p>}
        {status === "pronto" && siteUrl && <div className="status-line status-ready">
          <p><b>Seu preview está pronto.</b> Abre num toque:</p>
          <a href={siteUrl} target="_blank" rel="noreferrer" className="preview-link">{siteUrl} ↗</a>
          <p className="status-hint">Gostou? Escolha um plano abaixo pra manter no ar.</p>
        </div>}
        {status === "erro" && errorMsg && <p className="error" role="alert">{errorMsg}</p>}
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

    <section className="editor" aria-labelledby="editor-title">
      <div className="editor-inner">
        <div className="editor-emblem" aria-hidden="true">
          <svg viewBox="0 0 120 120" width="88" height="88">
            <defs>
              <linearGradient id="pitLine" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#ffffff" stopOpacity="0.9" />
                <stop offset="1" stopColor="#ffffff" stopOpacity="0.35" />
              </linearGradient>
            </defs>
            <polygon points="60,14 106,96 14,96" fill="none" stroke="url(#pitLine)" strokeWidth="1.6" strokeLinejoin="round" />
            <line x1="60" y1="14" x2="60" y2="96" stroke="#ffffff" strokeOpacity="0.28" strokeWidth="1" strokeDasharray="3 3" />
            <circle cx="60" cy="14" r="3" fill="#a78bfa" />
            <circle cx="106" cy="96" r="3" fill="#fbbf24" />
            <circle cx="14" cy="96" r="3" fill="#34d399" />
            <circle cx="60" cy="96" r="4" fill="#ffffff" />
          </svg>
        </div>
        <p className="kicker">Depois da triangulação</p>
        <h2 id="editor-title">Pitágoras <i>entra em cena</i>.</h2>
        <p className="editor-text">Quando as três faces já triangularam e o Zênite escolheu, seu site nasce. A partir daí, quem cuida da <i>geometria</i> — a cor de um botão, o tom de uma frase, trocar a foto principal, ajustar uma seção — é o <b>Pitágoras</b>, no meu bastidor. Você manda o pedido no <b>WhatsApp</b>; eu ajusto e te devolvo o link novo. Sem instalar nada.</p>
        <p className="editor-tag"><em>a² + b² = c²</em> · o editor que entende triângulo</p>
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

    <section className="plans" aria-labelledby="plans-title" id="planos">
      <div className="plans-title">
        <p className="kicker">Planos mensais</p>
        <h2 id="plans-title">Comece pela <i>essência</i>.<br />Cresça até a <i>tríade</i>.</h2>
        <p className="plans-lede">Todos os planos são <i>mensais</i>. Você troca, sobe ou cancela quando quiser.</p>
      </div>
      <div className="plans-grid">
        <article className="plan plan-essencia">
          <p className="plan-tag">Essência · Starter</p>
          <p className="plan-price">R$ 15,60<small>/mês</small></p>
          <p className="plan-signature"><em>Seu site assinado pelo</em> <b>GPT&nbsp;5.6</b></p>
          <p className="plan-line">Só site. Modelo Luna. Comece pequeno e prove pra você mesma.</p>
          <ul className="plan-features">
            <li><b>1 modelo</b> — Luna</li>
            <li>Site publicado no seu subdomínio</li>
            <li>Botão de <b>WhatsApp</b> e <b>e-mail</b> integrados</li>
          </ul>
          <a className="plan-cta" href={planoWhatsapp("Essência", "R$ 15,60")} target="_blank" rel="noreferrer">Assinar Essência  →</a>
          <p className="plan-cta-hint">Pagamento por Pix pelo WhatsApp</p>
        </article>

        <article className="plan plan-dupla">
          <p className="plan-tag">Dupla · Creator</p>
          <p className="plan-price">R$ 35,60<small>/mês</small></p>
          <p className="plan-line">Duas vozes conversando sobre você. Ajustes pelo WhatsApp.</p>
          <ul className="plan-features">
            <li><b>2 modelos</b> — combine Sol+Terra, Sol+Luna ou Terra+Luna</li>
            <li><b>40 créditos de chat</b> incluídos</li>
            <li>Ajustes ilimitados no site (pedidos pelo WhatsApp)</li>
            <li><b>Atualização semanal</b> automática com posts novos</li>
            <li><b>Download do pacote</b> em ZIP</li>
            <li>Tudo do plano Essência</li>
          </ul>
          <a className="plan-cta" href={planoWhatsapp("Dupla", "R$ 35,60")} target="_blank" rel="noreferrer">Assinar Dupla  →</a>
          <p className="plan-cta-hint">Pagamento por Pix pelo WhatsApp</p>
        </article>

        <article className="plan plan-triade" data-highlight="true">
          <span className="plan-highlight">Tríade completa</span>
          <p className="plan-tag">Tríade · Pro</p>
          <p className="plan-price">R$ 96,50<small>/mês</small></p>
          <p className="plan-line">Site profissional completo. Três modelos e ajustes prioritários pelo WhatsApp.</p>
          <ul className="plan-features">
            <li><b>3 modelos</b> — Luna, Terra e Sol simultaneamente</li>
            <li><b>Zênite</b> escuta as três e resolve os conflitos</li>
            <li><b>100 créditos de chat</b> incluídos</li>
            <li>Ajustes prioritários e ilimitados (pedidos pelo WhatsApp)</li>
            <li>Atualização semanal + download ZIP</li>
            <li>Prioridade na geração e no suporte</li>
          </ul>
          <a className="plan-cta plan-cta-highlight" href={planoWhatsapp("Tríade Completa", "R$ 96,50")} target="_blank" rel="noreferrer">Assinar Tríade  →</a>
          <p className="plan-cta-hint">Pagamento por Pix pelo WhatsApp</p>
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
          <summary>Como é o pagamento?</summary>
          <p>Por enquanto, direto no WhatsApp por Pix. Você clica em "Assinar" no plano que quiser, cai numa conversa comigo, eu te mando a chave Pix e libero seu site em minutos. Em breve vamos ter pagamento automático por cartão.</p>
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
          <summary>Quem é o Pitágoras?</summary>
          <p>É o motor de edição que roda no meu computador. Quando você quer mudar algo — cor, tom, foto, seção inteira — me manda o pedido no WhatsApp que eu ajusto e te devolvo o link novo em minutos. Você não precisa instalar nada.</p>
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

    <footer>
      <p className="footer-tagline"><em>Sites que respiram.</em></p>
      <p className="footer-meta">Tríade&nbsp;56 · Luna &nbsp;·&nbsp; Terra &nbsp;·&nbsp; Sol · a triangulação da inteligência</p>
      <p className="footer-meta">triade56.com · assinado pelo <b>GPT&nbsp;5.6</b></p>
    </footer>
  </main>;
}

createRoot(document.getElementById("root")!).render(<App />);
