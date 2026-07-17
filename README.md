# 2Minutes — Instagram Site Forge

Digite seu @, veja a mágica. Aplicação full-stack **AWS**: frontend em CloudFront + S3, backend em API Gateway + Lambda, dados em DynamoDB + S3.

Três IAs autorais transformam o perfil em uma página com voz, paleta e ritmo próprios:

- **Sol** — vibrante, direta, impossível de ignorar.
- **Terra** — autêntica, editorial, feita pra converter.
- **Luna** — sofisticada, magnética, cheia de presença.

Roda em **modo demo** sem credenciais externas. Conecte a Instagram Graph API oficial quando quiser dados reais.

## Deploy

Ver [`COMO-USAR.md`](./COMO-USAR.md) — passo a passo em português, do zero.

Resumo pra quem já é fluente em AWS:

```bash
npm install
npm run build
npx cdk bootstrap --app "node infra/dist/bin/app.js"      # só na primeira vez
npx cdk deploy    --app "node infra/dist/bin/app.js" --require-approval never
```

Saída: `WebUrl` (frontend público) e `ApiUrl` (backend).

## Estrutura

```
apps/web/           frontend React/Vite
services/api/       Lambda handlers TypeScript
packages/shared/    tipos compartilhados
infra/              AWS CDK
```

## Endpoints

- `POST /jobs` — recebe `{ username, model, consent }` e devolve `{ job, site, shareUrl? }` em uma única chamada.
- `GET /jobs/{id}` — status e dados de um job.
- `GET /sites/{slug}` — recupera um site publicado.
