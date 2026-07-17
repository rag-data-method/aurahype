# Tríade 56 — Sites que respiram

Cole seu @, veja seu site nascer da triangulação de **Luna**, **Terra** e **Sol**, moderada pelo **Zênite**. O **Pitágoras** cuida da geometria depois. Tudo assinado pelo **GPT 5.6**.

Domínio: **[triade56.com](https://triade56.com)**

## Stack

- **Frontend**: React + Vite (esse repo) → publicado no Cloudflare Pages
- **Backend**: worker MissCanvas (`handleInstaSite`) que já roda em produção — gera o site a partir do @
- **Pagamento (hoje)**: WhatsApp + Pix manual (botão em cada plano abre conversa pronta)
- **Pagamento (semana que vem)**: Stripe Checkout

## Rodar local (opcional)

```bash
npm install
npm run build --workspace=@site-forge/shared
npm run dev  --workspace=@site-forge/web
```

Depois, abre http://localhost:5173.

## Configuração de runtime

Duas variáveis mandam em tudo — dá pra setar no Cloudflare Pages (Environment variables) ou em `apps/web/.env.local`:

- `VITE_TRIADE_API` — URL do worker MissCanvas que gera o site (default: `https://misscanvas.com/api/insta-site`)
- `VITE_WHATSAPP` — número da Miriam com DDI, só dígitos (default placeholder: `5511999999999`)

Detalhes em [`COMO-LANCAR-HOJE.md`](./COMO-LANCAR-HOJE.md).

## Estrutura

```
apps/web/          frontend Vite (o que a Cloudflare publica)
services/api/      Lambda TypeScript legado (AWS) — não usada nesta versão
packages/shared/   tipos TypeScript compartilhados
infra/             AWS CDK legado — não usada nesta versão
mobile/            manifest Bubblewrap pra gerar o .aab da Play Store depois
```
