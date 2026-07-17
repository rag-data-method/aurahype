# 2Minutes — guia de deploy na AWS (versão pra quem tá começando)

O que este repositório faz:
1. **Frontend** em CloudFront + S3 — o site com a caixa "digite seu @".
2. **Backend** em API Gateway + Lambda + DynamoDB + S3 — gera o site na hora.
3. **Sem workers Cloudflare, sem Firebase, sem Stripe.** Tudo AWS.

A app já funciona em **modo demo** (sem credenciais Meta): quando alguém digita `@fulano`, o sistema devolve um site bonito com fotos placeholder + textos autorais (Sol / Terra / Luna). Você pode conectar a API oficial do Instagram depois, sem mudar nada no código.

---

## 1. O que você precisa instalar (uma vez só)

Estas ferramentas são gratuitas. Se você não tem uma conta AWS, crie em https://aws.amazon.com/free (o cartão só é cobrado se você passar do free tier — este projeto fica abaixo).

- Node.js 22 ou 24 → https://nodejs.org
- AWS CLI → https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html
- AWS CDK (globalmente): abra o terminal e rode
  ```
  npm install -g aws-cdk
  ```

Configure suas credenciais AWS uma vez:
```
aws configure
```
Ele vai pedir Access Key, Secret e a região (use `us-east-1` se não tiver preferência).

---

## 2. Preparar o projeto (uma vez só)

Dentro da pasta do projeto:
```
npm install
```

Faça o **bootstrap** do CDK na sua conta (só uma vez por conta+região):
```
npx cdk bootstrap --app "node infra/dist/bin/app.js"
```
Se der erro dizendo que não achou `infra/dist`, rode antes:
```
npm run build
```

---

## 3. Subir tudo pra AWS

Um único comando, na raiz do projeto:
```
npm run build && npx cdk deploy --app "node infra/dist/bin/app.js" --require-approval never
```

O deploy leva de 4 a 8 minutos na primeira vez. Quando terminar, aparece algo tipo:

```
Outputs:
InstagramSiteForge.ApiUrl = https://abc123.execute-api.us-east-1.amazonaws.com
InstagramSiteForge.WebUrl = https://d1abc123xyz.cloudfront.net
```

**Abra a `WebUrl` no navegador.** Já vai estar funcionando.

---

## 4. Como testar

1. No site, digite qualquer @ (por exemplo, `@fulaninha`).
2. Escolha uma das três IAs: **Sol**, **Terra** ou **Luna**.
3. Marque a caixa de autorização.
4. Clique em **VER A MÁGICA**.

Sem credenciais Meta, você verá um preview gerado com o próprio @ e uma galeria de imagens placeholder — mas o design, textos, cores e o link do Instagram são reais e mudam conforme a IA escolhida.

---

## 5. (Opcional) Ligar os dados reais do Instagram

Isso não é obrigatório pra começar. Faça quando você tiver tempo:

1. Crie uma conta em https://developers.facebook.com.
2. Crie um app do tipo **Business**.
3. Conecte uma **Página do Facebook** e uma **conta profissional do Instagram** (Business ou Creator).
4. Gere um **access token de longa duração** com a permissão `instagram_basic`.
5. Guarde esse token no **AWS Secrets Manager** (crie um segredo do tipo "Other type", cole só o token).
6. Copie o ARN do segredo e o ID da sua conta Instagram profissional.
7. Rode o deploy passando os dois parâmetros:
   ```
   npx cdk deploy --app "node infra/dist/bin/app.js" --require-approval never \
     --parameters MetaAccessTokenSecretArn=arn:aws:secretsmanager:us-east-1:SEU_ID:secret:SEU_SEGREDO \
     --parameters MetaInstagramBusinessAccountId=17841400000000000
   ```

A partir daí, a app começa a puxar dados reais. Se o perfil consultado não for profissional, a app cai automaticamente no modo demo — nenhum erro pra você tratar.

---

## 6. Estrutura do projeto (pra você se localizar)

```
apps/web/           → o site que o usuário vê
services/api/       → o backend em Lambda (createJob, readJob, readSite)
packages/shared/    → tipos comuns entre frontend e backend
infra/              → o AWS CDK que descreve toda a infraestrutura
```

Arquivos que você provavelmente vai querer mexer primeiro:
- `apps/web/src/main.tsx` → textos, botões, ordem das seções.
- `apps/web/src/styles.css` → cores da hero, tipografia, animações.
- `services/api/src/generator.ts` → textos e paletas do Sol, Terra e Luna.

---

## 7. Como parar de pagar (destruir tudo)

Se um dia quiser tirar tudo do ar:
```
npx cdk destroy --app "node infra/dist/bin/app.js"
```
Os buckets S3 e a tabela DynamoDB ficam preservados por segurança. Você apaga eles à mão no console se quiser mesmo remover.

---

## 8. Quando algo der errado

- **"Not authorized"** no `aws configure` → refaça o `aws configure` com uma Access Key nova.
- **"Bootstrap not found"** → rode `npx cdk bootstrap` de novo.
- **A URL do CloudFront demora pra abrir** → o primeiro carregamento leva até 5 minutos. Depois fica instantâneo.
- **Aparece "modo demonstração"** → normal se você ainda não configurou o Meta. Não é bug.

Qualquer coisa, me manda o erro que eu resolvo com você.


---

## 9. Publicar na Google Play (Android) — opcional

O site já vira "app" instalável no celular (Android e iPhone) só usando o navegador — no Chrome do Android aparece o botão "Instalar app", no iPhone é Safari → compartilhar → "Adicionar à Tela de Início". **Isso já basta pra você usar do telefone.**

Se quiser publicar na Play Store como app "de verdade" (aparece nas buscas, tem ficha, dá pra atualizar), o Google tem uma ferramenta oficial chamada **Bubblewrap** que pega o seu PWA e gera um `.aab` (o formato que a Play exige). Roteiro:

1. Rode o deploy AWS (passos 1 a 3 deste guia). Anote a `WebUrl`. Se você já tem um domínio próprio apontando pra ela (recomendado, algo como `2minutes.site`), use o domínio.

2. Instale o Bubblewrap (uma vez só):
   ```
   npm install -g @bubblewrap/cli
   ```

3. Na pasta do projeto, rode:
   ```
   npx @bubblewrap/cli init --manifest https://SEU-DOMINIO/manifest.webmanifest
   ```
   Ele vai perguntar o nome do app, o pacote (use algo tipo `site.twominutes.app`), gerar a chave de assinatura e criar o projeto Android.

4. Ele mostra o **SHA-256 da chave**. Copie esse valor.

5. Edite `apps/web/public/.well-known/assetlinks.json`, cole o SHA-256 no campo `sha256_cert_fingerprints` e substitua `package_name` pelo mesmo que você usou no passo 3.

6. Refaça o deploy AWS pra publicar o `assetlinks.json` atualizado:
   ```
   npm run build && npx cdk deploy --app "node infra/dist/bin/app.js" --require-approval never
   ```

7. Gere o AAB assinado:
   ```
   npx @bubblewrap/cli build
   ```
   O arquivo `.aab` é gerado. Esse é o arquivo que você vai subir na Play Store.

8. Crie sua conta em https://play.google.com/console (US$ 25 uma vez, na vida). Crie o app, faça upload do `.aab`, preencha screenshots e descrição, envie pra revisão.

A revisão do Google costuma sair em 1-3 dias. Depois disso o app está na Play Store, com o mesmo comportamento do site — mas com ficha oficial de app, sem barra de navegador, atualização automática sempre que você refaz o deploy AWS.

## 10. E o iPhone / App Store?

Pra usar do iPhone: já funciona. Safari → compartilhar → "Adicionar à Tela de Início". Vira ícone na home, tela cheia, offline básico.

Pra colocar na App Store (ficha oficial de app iOS): precisa de mais coisas — Mac com Xcode, conta Apple Developer (US$ 99/ano) e empacotar com **Capacitor**. Quando você quiser fazer isso, me chama que eu te ajudo — mas deixa pra depois, primeiro publica na Play e ganha usuários no Android.
