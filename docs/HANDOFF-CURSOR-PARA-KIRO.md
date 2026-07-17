# Handoff Cursor → Kiro (Tríade 56)

**Para:** Kiro (front `aurahype` / triade56.com)  
**De:** Cursor + Miriam (2026-07-17)  
**Repo:** https://github.com/rag-data-method/aurahype  
**Clone:** `C:\Users\100le\aurahype`  
**Este arquivo é a fonte única de verdade** de produto + API + fluxo. Guia operacional curto: [`../COMO-LANCAR-HOJE.md`](../COMO-LANCAR-HOJE.md).

Fontes consolidadas (Cursor `cria-site-kimi/outputs/`): `planos_triade56_2minutes.md`, `triade56_lancar_status.md`, `builder_lovable_triade_status.md`, regra de produto “lançar hoje” (SEM upload).

---

## 1. Planos oficiais (Miriam)

| Marketing | Interno | Preço | Inclui | Modelos | Créditos chat | Quem edita / chat |
|-----------|---------|-------|--------|---------|---------------|-------------------|
| **Essência** | Starter | **R$ 15,60** | Só site | **Luna** | — | edição leve (se houver) |
| **Dupla** | Creator | **R$ 35,60** | Site + edição + chat | 2 modelos (foco Luna) | **40** | **Luna** (+ **Pitágoras** no template) |
| **Tríade** | Pro | **R$ 96,50** | Site completo + 3 modelos + chat | Sol / Terra / Luna | **100** | Chat/edição pesada: **Terra** |

### Papéis canônicos

| Agente | Papel | Onde usa |
|--------|-------|----------|
| **Luna** | Site barato, copy/UI, edição leve | Essência (site); **Creator** (edita) |
| **Terra** | Backend/código, chat/edição **pesada** | **Pro** = hot path do chat |
| **Sol** | Plano / orquestração | **Evitar hot path** — reasoning lenta; só excepcional |
| **Pitágoras** | Editor conversacional do **template** pós-geração | Dupla + Tríade (geometria: cor, texto, foto, seção) |
| **Zênite** | Moderação das 3 faces na geração | Tríade |

### Regras duras

- Não vender Essência como “3 modelos”.
- Não colocar **Sol** no hot path de chat/edição (é lenta).
- UI em `apps/web/src/main.tsx` (commit `c324182+`) já tem preços 15,60 / 35,60 / 96,50 e bullets de créditos — manter alinhado.
- Pagamento **hoje:** WhatsApp + Pix manual (botão Assinar). Stripe = semana que vem.

---

## 2. API (crítico)

| URL | Status |
|-----|--------|
| `https://2minutes.site/api/insta-site` | **USAR** — vivo; OPTIONS 200; CORS `*`; headers `x-mc-token` / `x-mc-device` OK |
| `https://misscanvas.com/api/insta-site` | **NÃO USAR** — **404** |
| `https://url-inspire-worker.miriamreis33.workers.dev/api/insta-site` | Worker bruto; preferir domínio público `2minutes.site` |

Default no front:

```ts
const TRIADE_API_URL =
  import.meta.env.VITE_TRIADE_API || "https://2minutes.site/api/insta-site";
```

Env (Cloudflare Pages Production **ou** `apps/web/.env.local`):

```
VITE_TRIADE_API=https://2minutes.site/api/insta-site
VITE_WHATSAPP=55XXXXXXXXXXX
NODE_VERSION=22
```

- `VITE_WHATSAPP`: só dígitos = `55` + DDD (2) + número (9). Placeholder `5511999999999` **não é real** — Miriam troca antes de vender.
- **Não** commitar número real nem chaves Azure / Firebase service account.

CORS no worker (já probeado com `*`): se restringir no futuro, incluir `https://triade56.com`.

---

## 3. Fluxo de produto — SEM upload (lançamento)

**Regra Miriam (CRÍTICO):**

1. **Sem upload** de foto/vídeo pelo usuário.
2. Scraping via **Context.dev** (e cascade do 2Minutes: Context → SocialCrawl (+ Tavily) → Silver → Apify last).
3. Apresentar mídia rasgada → usuário escolhe o que é **principal** e o que é **secundária**.
4. **Publicar** o site com essa escolha.

Copy atual do front já diz “nada de upload” (cola o @). O gap de produto a fechar no UX/API é o passo **escolher principal/secundária** antes do publish — não inventar formulário de upload.

Na geração/edição: GPTs da Tríade (**Luna** / **Terra**; **Sol** fora do hot path).

---

## 4. DNS / deploy triade56.com

Estado ao handoff (2026-07-17):

| Item | Status |
|------|--------|
| `aurahype.pages.dev` | No ar, mas pode ainda servir build legado — **Retry deployment** do `main` atual |
| `triade56.com` | Parking name.com (`91.195.240.94` / Parking/1.0) — **não** ligado ao Pages |
| NS | Ainda `ns*.name.com` |

Passos Miriam/Kiro:

1. Cloudflare → Workers & Pages → projeto do repo → env vars (`VITE_TRIADE_API`, `VITE_WHATSAPP`, `NODE_VERSION=22`).
2. Deployments → **Retry deployment**.
3. Custom domains → `triade56.com` (+ opcional `www`).
4. Se domínio no name.com: aceitar troca de NS para Cloudflare **ou** adicionar o domínio na conta CF primeiro.
5. Conferir SSL verde e botão **INICIAR IMERSÃO** contra `2minutes.site/api/insta-site`.

---

## 5. Builder “Lovable” × Tríade (contexto paralelo)

**Não é o front aurahype** — é o trilho local da Miriam. Kiro precisa saber o gap pra não misturar escopos.

| Peça | O quê | Path típico |
|------|-------|-------------|
| **Foundry Studio** | Chat web (zip “Lovable” TanStack) — chat Azure, **não** edita arquivos | `Downloads/your-interactive-app-main/...` |
| **Copiloto / Agente Azure Local** | Desktop Tkinter + EXE — Assistente + Construtor Full-Stack | `Documents\Copiloto\` (`debug_gui.py`, `AgenteAzureLocal.exe`) |

### Veredito

- Construtor gera **scaffold template** (todo + auth), **não** edita com a Tríade.
- Chat usa deployments Azure `gpt-5.6-terra` / `gpt-5.6-sol`; **Luna** e **Pitágoras** ausentes nesse builder.
- **Não é Lovable ainda** — falta loop prompt → patch de arquivos → preview.
- Firebase checklist gerado por app aponta projeto família 2Minutes (`minutes-8203d`) — **sem colar service account / keys neste repo**.

Próximo salto Lovable (fora do escopo Pages): Construtor chama LLM e escreve em `generated_apps/<slug>`; Luna UI / Terra API / Sol só orquestra.

---

## 6. Stack deste repo (o que Kiro manda)

| Camada | Tecnologia |
|--------|------------|
| Front | React + Vite → Cloudflare Pages |
| Backend de geração | Worker MissCanvas `handleInstaSite` via `https://2minutes.site/api/insta-site` |
| Pagamento | WhatsApp + Pix (agora); Stripe (depois) |
| Domínio produto | **triade56.com** |

Estrutura: `apps/web/` (publicado), `packages/shared/`, `services/api/` e `infra/` = legado AWS (não usar nesta versão).

---

## 7. Checklist Kiro (aceite)

- [ ] Preços UI = 15,60 / 35,60 / 96,50 + créditos 40/100
- [ ] Essência = Luna; Dupla = Luna edita + Pitágoras; Tríade = Terra no chat; Sol fora do hot path
- [ ] `VITE_TRIADE_API` → `2minutes.site` (nunca misscanvas 404)
- [ ] `VITE_WHATSAPP` real (só dígitos), sem placeholder
- [ ] Fluxo SEM upload; scrape → escolha principal/secundária → publish
- [ ] `triade56.com` no Pages + SSL
- [ ] Zero secrets (Azure keys, paths detalhados de service account) no git

---

## 8. O que NÃO fazer

- Deploy Pages com secrets sem OK da Miriam.
- Inventar número de WhatsApp.
- Voltar default da API para `misscanvas.com`.
- Misturar Onda 2 / builder Copiloto no hot path do front de venda.
- Colocar Sol no chat pesado “pra ficar completo”.

---

*Handoff consolidado 2026-07-17 — Cursor → Kiro. Sem secrets.*
