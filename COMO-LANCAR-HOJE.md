# Como lançar a Tríade 56 no ar HOJE

Miriam, é isso aqui. 4 passos, sem enrolação. Todo o código já está pronto no `main` do repo.

---

## 1. Confirme 2 valores no código (2 minutos)

Abre o arquivo `apps/web/src/main.tsx` no Cursor. Nas primeiras linhas, confere estas duas constantes:

```ts
const TRIADE_API_URL = ... || "https://misscanvas.com/api/insta-site";
const WHATSAPP_MIRIAM = ... || "5511999999999"; // ← TROCA ESSE NÚMERO PELO SEU
```

- **`TRIADE_API_URL`**: URL do seu worker MissCanvas que responde `handleInstaSite`. Se for `https://misscanvas.com/api/insta-site` mesmo, deixa. Se for outro endpoint, edita.
- **`WHATSAPP_MIRIAM`**: seu WhatsApp com DDI. Formato: `55` + DDD (2 dígitos) + número (9 dígitos). Exemplo: `5511987654321`.

Prefer configurar por variável de ambiente em vez de editar o código? Cria um arquivo `apps/web/.env.local`:

```
VITE_TRIADE_API=https://misscanvas.com/api/insta-site
VITE_WHATSAPP=5511987654321
```

## 2. Suba as mudanças pro GitHub (30 segundos)

No Cursor, aba **Source Control** (Ctrl+Shift+G). Escreve uma mensagem tipo "meus valores" e clica em **Commit** → **Push**. Pronto.

*(Se ainda não configurou, o Cursor pede login no GitHub uma vez — é 1 clique.)*

## 3. Cloudflare Pages: aponta triade56.com pra esse repo (5 minutos)

No dashboard Cloudflare (a conta onde você comprou triade56.com):

1. **Workers & Pages** → seu projeto **aurahype** (renomeia depois se quiser)
2. **Settings** → **Environment variables** → **Production** → adiciona 2 variáveis (se você fez o passo 1 com `.env.local` local, precisa refazer aqui também):
   - `VITE_TRIADE_API` = `https://misscanvas.com/api/insta-site`
   - `VITE_WHATSAPP` = `5511987654321` (o SEU número, com DDI, só dígitos)
   - `NODE_VERSION` = `22`
3. **Settings** → **Custom domains** → **Set up a custom domain** → digita `triade56.com` → **Continue**
   - Cloudflare vê que o domínio já está na sua conta e configura o DNS automaticamente.
   - Em 1-2 minutos o SSL fica verde.
4. Repete pra `www.triade56.com` se você quiser que o `www` também abra.
5. Vai em **Deployments** → **Retry deployment** (pra ele rebuildar com as env vars novas)

Em ~3 minutos, **triade56.com** está no ar com o build mais recente.

## 4. Ligue CORS no worker MissCanvas (crítico, 2 minutos)

O botão "INICIAR IMERSÃO" no site chama `misscanvas.com/api/insta-site`. Se você não permitir `triade56.com` no CORS do worker, o navegador vai bloquear.

No seu worker `handleInstaSite`, garanta que o response inclui:

```js
headers: {
  'Access-Control-Allow-Origin': '*',   // ou 'https://triade56.com'
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-mc-token, x-mc-device'
}
```

O seu `corsHeaders()` já faz isso — só confere que ele está sendo aplicado no `handleInstaSite` (nos returns `json(...)` já vai; nos returns `new Response(readable, {...})` também).

---

## Pronto. E agora?

Abre **triade56.com** no celular. Cola um @, escolhe uma face, clica **INICIAR IMERSÃO**. Se aparecer link do preview, deu tudo certo.

Vende assim:
- Poste no seu Instagram: **"Digite seu @ em triade56.com. Seu site nasce assinado pelo GPT 5.6. R$ 15,60/mês."**
- Cada clique em "Assinar" nos planos abre WhatsApp com mensagem pronta.
- Você recebe Pix, libera o site na mão pelo painel do MissCanvas.

Se algo der errado (404, CORS, botão não faz nada), me manda:

1. **A URL** que abriu (triade56.com)
2. **O que apareceu na tela**
3. **F12** → aba **Console** → screenshot dos erros em vermelho
