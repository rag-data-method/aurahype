# Tríade 56 · acervo-worker

Worker Cloudflare que indexa acervo de sites (scraper Lovable + outros) com **busca vetorial** e **classificação por LLM**. Zero AWS — tudo dentro da Cloudflare que a Miriam já usa.

## Stack

- **Workers AI** — embeddings (`@cf/baai/bge-m3`, 1024d multilingual) + classificação (`@cf/meta/llama-3.1-8b-instruct`).
- **Vectorize** — índice vetorial (cosine, 1024d).
- **D1** — SQLite serverless pros metadados + tags + payload cru.
- **Hono** — router leve (~30KB) em cima do Workers runtime.

## Primeiro deploy (a Miriam roda uma vez)

```bash
cd services/acervo-worker
npm install

# 1) cria o índice Vectorize
npx wrangler vectorize create triade-acervo --dimensions=1024 --metric=cosine

# 2) cria o D1 e copia o database_id que aparecer
npx wrangler d1 create triade-acervo
# -> cola o id no wrangler.toml em [[d1_databases]].database_id

# 3) roda o schema no D1 remoto
npm run db:init:remote

# 4) opcional: define um token pra proteger /ingest e /classify
npx wrangler secret put INGEST_TOKEN
# (cola qualquer string longa — vai virar o Bearer)

# 5) deploy
npm run deploy
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
