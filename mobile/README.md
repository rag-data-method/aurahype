# Empacotamento Android (Play Store) — TWA via Bubblewrap

Este diretório contém tudo o que a Kiro usa pra gerar o `.aab` da Play Store a partir
do PWA que já roda no CloudFront. Você não precisa executar nada aqui — os passos são
executados pela agente. Fica documentado só como referência.

Fluxo executado pela agente quando você fornece a URL final:

1. Copia `twa-manifest.template.json` para `twa-manifest.json`, substituindo
   `REPLACE_WITH_YOUR_HOST` pelo seu domínio (ex.: `d1abc.cloudfront.net` ou `2minutes.site`).
2. Roda `npx @bubblewrap/cli init --manifest ./twa-manifest.json`.
3. Bubblewrap baixa Android SDK (se ainda não estiver disponível), gera keystore
   `android.keystore` e captura o SHA-256 do certificado.
4. A agente atualiza `apps/web/public/.well-known/assetlinks.json` com o SHA-256 e o
   `packageId`, e refaz o deploy AWS pra publicar esse arquivo no seu domínio.
5. Roda `npx @bubblewrap/cli build`, gerando `app-release-bundle.aab` (para a Play)
   e `app-release-signed.apk` (para instalar direto no celular, opcional).
6. Você faz upload de `app-release-bundle.aab` no Play Console.

O keystore (`android.keystore`) e a senha ficam guardados neste diretório. **Não perca
esse arquivo** — sem ele você não consegue atualizar o app no futuro. Recomendo tirar
uma cópia num lugar seguro fora do repositório também.
