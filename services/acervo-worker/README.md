# Tríade 56 · acervo-worker

Worker Cloudflare que indexa acervo de sites (scraper Lovable + outros) com **busca vetorial** e **classificação por LLM**. Zero AWS — tudo dentro da Cloudflare que a Miriam já usa.

## Stack

- **Workers AI** — embeddings (`@cf/baai/bge-m3`, 1024d multilingual) + classificação (`@cf/meta/llama-3.1-8b-instruct`).
- **Vectorize** — índice vetorial (cosine, 1024d).
- **D1** — SQLite serverless pros metadados + tags + payload cru.
- **Hono** — router leve (~30KB) em cima do Workers runtime.

## Deploy automatico via GitHub Actions (recomendado)

Você **não abre terminal**. Cola 2 secrets uma vez no GitHub e o CI faz tudo:

1. Vai em `github.com/rag-data-method/aurahype` → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.
2. Adiciona:
   - `CLOUDFLARE_API_TOKEN` → gera em [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens) usando o template **"Edit Cloudflare Workers"** (dá permissão pra Workers + AI + Vectorize + D1).
   - `CLOUDFLARE_ACCOUNT_ID` → aparece no topo direito de qualquer página do dashboard Cloudflare, tipo `1a2b3c...`.
   - (opcional) `INGEST_TOKEN` → qualquer string longa que você inventar. Se não setar, `/ingest` fica aberto.
3. Faz qualquer commit que toque `services/acervo-worker/` → o workflow `.github/workflows/deploy-acervo.yml` roda sozinho, cria Vectorize + D1, aplica schema, deploya, e pinga `/health`.

Também dá pra rodar manualmente no botão **Actions** → **Deploy acervo-worker** → **Run workflow**.

## Deploy manual (se preferir controle total)

```bash
cd services/acervo-worker
npm install
export CLOUDFLARE_API_TOKEN=...
export CLOUDFLARE_ACCOUNT_ID=...
export INGEST_TOKEN=<opcional>
node scripts/bootstrap.mjs   # cria Vectorize + D1 + schema, idempotente
npx wrangler deploy
```

Depois disso o worker fica em algo tipo `https://triade-acervo.<subdomain>.workers.dev`. Você pode plugar num Custom Domain (`acervo.triade56.com`) pelo dashboard.

## API

### `GET /health`

```json
{
  "ok": true,
  "service": "triade-acervo",
  "embed_model": "@cf/baai/bge-m3",
  "classify_model": "@cf/meta/llama-3.1-8b-instruct",
  "now": 1721260000000
}
```

### `POST /ingest`

Header: `Authorization: Bearer <INGEST_TOKEN>` (se o secret estiver setado).

Body — lote de sites do scraper. **Só `source_url` é obrigatório**. Todo o resto é opcional; se faltar título/descrição, a gente usa o HTML pra fazer embed.

```json
{
  "classify": false,
  "sites": [
    {
      "source_url": "https://exemplo.lovable.app/",
      "title": "Studio Aura",
      "description": "Studio de yoga em Pinheiros",
      "html_snippet": "<h1>Studio Aura</h1><p>...</p>",
      "screenshot_url": "https://cdn.exemplo.com/screenshot.png",
      "palette_hex": ["#f5efe6", "#2e2a26"],
      "hero_kind": "image",
      "language": "pt",
      "raw": { "qualquer": "coisa que o scraper produziu" }
    }
  ]
}
```

Resposta:

```json
{
  "ok": true,
  "received": 1,
  "embedded": 1,
  "classified": 0,
  "errors": []
}
```

Se você mandar `classify: true`, cada site também passa pelo LLM classifier no mesmo request (~1-2s por site, cuidado com lote grande). O jeito recomendado é ingerir rápido sem classificar e chamar `/classify` depois em batch.

### `POST /scrape/extract`

Recebe N URLs, extrai conteudo limpo (markdown), joga no `/ingest` internamente. Estilo Tavily Extract.

Header: `Authorization: Bearer <INGEST_TOKEN>`.

```json
{
  "urls": [
    "https://algum-site.lovable.app/",
    "https://outro-site.com/"
  ],
  "query": "estilo minimal com hero em video",
  "classify": true
}
```

Provider: **Tavily** se `TAVILY_API_KEY` setada (preferido — funciona bem em Lovable/SPA), **Scrapfly** como fallback se `SCRAPFLY_API_KEY` setada. Se nenhuma, retorna 501.

### `POST /scrape/crawl`

Recebe uma URL raiz + instrucoes, o Tavily segue os links por N niveis e devolve as paginas descobertas em markdown, tudo ingerido de uma vez. Estilo Tavily Crawl.

Header: `Authorization: Bearer <INGEST_TOKEN>`.

```json
{
  "url": "https://gallery.lovable.app/",
  "instructions": "sites de portfolio e servico, estilo minimal e organico",
  "max_depth": 2,
  "max_breadth": 30,
  "limit": 50,
  "select_paths": ["/project/.*", "/showcase/.*"],
  "exclude_paths": ["/blog/.*"],
  "classify": true
}
```

So Tavily por enquanto — Scrapfly nao tem endpoint equivalente. Se `TAVILY_API_KEY` nao setada, retorna 501.

### `POST /search`

Público (sem token). É o endpoint que o frontend do Tríade 56 chama.

```json
{
  "query": "sites minimalistas com hero em vídeo em tons quentes",
  "limit": 12,
  "filter": {
    "category": "restaurant",
    "vibe": "warm"
  }
}
```

Resposta:

```json
{
  "ok": true,
  "query": "...",
  "count": 8,
  "results": [
    {
      "id": "a1b2...",
      "score": 0.87,
      "source_url": "https://...",
      "title": "...",
      "description": "...",
      "screenshot_url": "...",
      "palette_hex": ["#..."],
      "category": "restaurant",
      "style": "elegant",
      "vibe": "warm",
      "tags": ["hero-video", "serif-heading"]
    }
  ]
}
```

### `POST /classify`

Header: `Authorization: Bearer <INGEST_TOKEN>`.

Processa em lote sites que ainda não foram classificados (`classified_at IS NULL`). Serial, ~1-2s por site.

```json
{ "limit": 20 }
```

### `GET /site/:id`

Pega um site inteiro do D1.

## Como o scraper Lovable pluga aqui

Duas opções, dependendo de onde o scraper roda:

**A) Scraper roda local (Windows, script Python/Node)**
No fim de cada rodada, ele faz um POST batch:

```js
await fetch("https://triade-acervo.<workers-subdomain>.workers.dev/ingest", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer <INGEST_TOKEN>"
  },
  body: JSON.stringify({ sites: lote100 })
});
```

**B) Scraper já é um worker Cloudflare (mais robusto)**
Usa Service Binding em vez de fetch — grátis, sem CORS, sem custo de saída.

## Custo estimado

Pra 5.000 sites indexados:

- **Workers AI embed** (bge-m3, 1024d): ~5000 chamadas de embed × ~500 tokens = ~2.5M tokens ~ **$0.02** no total (bem dentro do free tier de 10k neurons/dia).
- **Workers AI classify** (llama 8B): 5000 chamadas × ~800 tokens I/O = ~4M tokens ~ **~$0.40** total.
- **Vectorize storage**: 5000 × 1024 × 4 bytes ~= 20MB ~ **$0.001/mês**.
- **Vectorize queries**: $0.04/M — irrelevante.
- **D1**: gratuito até 5GB.

**Total: alguns centavos.** Se escalar pra 50k sites, ainda fica <$5/mês.

## Reprocessar (se precisar)

- **Reclassificar um site específico**: `DELETE FROM sites WHERE id=?` no D1 e re-ingere.
- **Refazer todos os embeddings** (ex: trocou de modelo): apagar o índice Vectorize (`wrangler vectorize delete triade-acervo`), recriar com as novas dimensões, e re-ingerir tudo lendo os `raw_json` do D1.

## Debugging

- **500 no /ingest**: quase sempre é dimensão do Vectorize errada. `bge-m3` = 1024, `bge-base-en-v1.5` = 768. Se trocar o `EMBED_MODEL` em `wrangler.toml`, tem que recriar o índice com a dimensão nova.
- **`unauthorized`**: você definiu `INGEST_TOKEN` como secret mas o scraper não está mandando `Authorization: Bearer`.
- **Vectorize `insufficient permissions`**: conta free tem 5 índices; se estourou, delete algum não usado.
