import { basename, resolve } from "node:path";
import * as cdk from "aws-cdk-lib";
import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";

function workspacePath(...segments: string[]): string {
  const cwd = process.cwd();
  return basename(cwd) === "infra" ? resolve(cwd, "..", ...segments) : resolve(cwd, ...segments);
}

export class SiteForgeStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Domínio customizado (recomendado). Se você não preencher, o CDK usa apenas a
    // URL bruta do CloudFront (algo tipo d1abc.cloudfront.net) — funciona igual, só
    // muda o "endereço".
    const customDomainName = new cdk.CfnParameter(this, "CustomDomainName", {
      type: "String",
      default: "",
      description: "Ex.: app.codeagente.com. Deixe em branco pra usar apenas o CloudFront."
    });

    // Parâmetros opcionais para conectar a API oficial do Instagram.
    // Se você não preencher nada, a app roda em modo demo (fotos placeholder).
    const metaTokenSecretArn = new cdk.CfnParameter(this, "MetaAccessTokenSecretArn", {
      type: "String",
      default: "",
      description: "Opcional. ARN de um segredo do Secrets Manager com o access token da Meta."
    });
    const metaBusinessAccountId = new cdk.CfnParameter(this, "MetaInstagramBusinessAccountId", {
      type: "String",
      default: "",
      description: "Opcional. ID da conta profissional do Instagram habilitada para Business Discovery."
    });
    const metaGraphApiVersion = new cdk.CfnParameter(this, "MetaGraphApiVersion", {
      type: "String",
      default: "v22.0"
    });

    const jobs = new dynamodb.Table(this, "GenerationJobs", {
      partitionKey: { name: "id", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: RemovalPolicy.RETAIN
    });

    const sites = new s3.Bucket(this, "GeneratedSites", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      removalPolicy: RemovalPolicy.RETAIN
    });

    const handlerEntry = workspacePath("services", "api", "src", "handlers.ts");
    const makeHandler = (name: string, handler: string) => new NodejsFunction(this, name, {
      entry: handlerEntry,
      handler,
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: Duration.seconds(29),
      memorySize: 512,
      bundling: { minify: true, sourceMap: true, target: "node22" },
      environment: {
        JOBS_TABLE_NAME: jobs.tableName,
        SITES_BUCKET_NAME: sites.bucketName,
        META_ACCESS_TOKEN_SECRET_ARN: metaTokenSecretArn.valueAsString,
        META_INSTAGRAM_BUSINESS_ACCOUNT_ID: metaBusinessAccountId.valueAsString,
        META_GRAPH_API_VERSION: metaGraphApiVersion.valueAsString,
        ALLOWED_ORIGIN: "*"
      }
    });

    const createJobFn = makeHandler("CreateGenerationJob", "createJob");
    const getJobFn = makeHandler("GetGenerationJob", "readJob");
    const getSiteFn = makeHandler("GetGeneratedSite", "readSite");
    const optionsFn = makeHandler("CorsOptions", "options");
    const allFunctions = [createJobFn, getJobFn, getSiteFn, optionsFn];
    for (const fn of allFunctions) {
      jobs.grantReadWriteData(fn);
      sites.grantReadWrite(fn);
    }

    // Concede leitura do segredo apenas quando o ARN é fornecido.
    const hasMetaToken = new cdk.CfnCondition(this, "HasMetaToken", {
      expression: cdk.Fn.conditionNot(cdk.Fn.conditionEquals(metaTokenSecretArn.valueAsString, ""))
    });
    for (const fn of allFunctions) {
      const grant = new cdk.CfnResource(this, `${fn.node.id}MetaTokenAccess`, {
        type: "AWS::IAM::Policy",
        properties: {
          PolicyName: `${fn.node.id}MetaTokenAccess`,
          PolicyDocument: {
            Version: "2012-10-17",
            Statement: [{ Effect: "Allow", Action: ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"], Resource: metaTokenSecretArn.valueAsString }]
          },
          Roles: [(fn.role as cdk.aws_iam.IRole).roleName]
        }
      });
      grant.cfnOptions.condition = hasMetaToken;
    }

    const api = new apigwv2.HttpApi(this, "PublicApi", {
      corsPreflight: {
        allowHeaders: ["content-type"],
        allowMethods: [apigwv2.CorsHttpMethod.GET, apigwv2.CorsHttpMethod.POST, apigwv2.CorsHttpMethod.OPTIONS],
        allowOrigins: ["*"],
        maxAge: Duration.hours(1)
      }
    });
    api.addRoutes({ path: "/jobs", methods: [apigwv2.HttpMethod.POST], integration: new HttpLambdaIntegration("CreateJobIntegration", createJobFn) });
    api.addRoutes({ path: "/jobs/{id}", methods: [apigwv2.HttpMethod.GET], integration: new HttpLambdaIntegration("GetJobIntegration", getJobFn) });
    api.addRoutes({ path: "/sites/{slug}", methods: [apigwv2.HttpMethod.GET], integration: new HttpLambdaIntegration("GetSiteIntegration", getSiteFn) });

    const webBucket = new s3.Bucket(this, "WebApplication", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.RETAIN
    });

    // Suporte a domínio custom: quando você passar --parameters CustomDomainName=aurahype.com,
    // o CDK cria um certificado ACM (validação DNS) e configura o CloudFront pra usá-lo.
    // Se você deixar em branco, o CDK só cria o CloudFront padrão sem domínio custom.
    const hasCustomDomain = new cdk.CfnCondition(this, "HasCustomDomain", {
      expression: cdk.Fn.conditionNot(cdk.Fn.conditionEquals(customDomainName.valueAsString, ""))
    });
    const certificate = new acm.CfnCertificate(this, "SiteCertificate", {
      domainName: customDomainName.valueAsString,
      validationMethod: "DNS",
      subjectAlternativeNames: [cdk.Fn.join(".", ["www", customDomainName.valueAsString])]
    });
    certificate.cfnOptions.condition = hasCustomDomain;

    const distributionConfig: cloudfront.DistributionProps = {
      defaultRootObject: "index.html",
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(webBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED
      },
      errorResponses: [{ httpStatus: 403, responseHttpStatus: 200, responsePagePath: "/index.html", ttl: Duration.minutes(5) }]
    };
    const distribution = new cloudfront.Distribution(this, "WebDistribution", distributionConfig);

    // Se o domínio foi informado, aplicamos aliases + cert no CFN bruto do CloudFront.
    // (Isso permite manter o CDK L2 padrão quando não há domínio, e ativar quando houver.)
    const cfnDist = distribution.node.defaultChild as cloudfront.CfnDistribution;
    cfnDist.addPropertyOverride("DistributionConfig.Aliases", cdk.Fn.conditionIf(
      hasCustomDomain.logicalId,
      [customDomainName.valueAsString, cdk.Fn.join(".", ["www", customDomainName.valueAsString])],
      cdk.Aws.NO_VALUE
    ));
    cfnDist.addPropertyOverride("DistributionConfig.ViewerCertificate", cdk.Fn.conditionIf(
      hasCustomDomain.logicalId,
      {
        AcmCertificateArn: certificate.ref,
        SslSupportMethod: "sni-only",
        MinimumProtocolVersion: "TLSv1.2_2021"
      },
      cdk.Aws.NO_VALUE
    ));
    new s3deploy.BucketDeployment(this, "DeployWebApplication", {
      sources: [
        s3deploy.Source.asset(workspacePath("apps", "web", "dist")),
        s3deploy.Source.data("runtime-config.js", `window.__SITE_FORGE_RUNTIME__ = { apiUrl: ${JSON.stringify(api.apiEndpoint)} };`)
      ],
      destinationBucket: webBucket,
      distribution,
      distributionPaths: ["/*"]
    });

    new CfnOutput(this, "CloudFrontUrl", {
      value: `https://${distribution.distributionDomainName}`,
      description: "URL bruta do CloudFront. Aponte um CNAME no Cloudflare pra este destino."
    });
    new CfnOutput(this, "CustomDomainUrl", {
      value: cdk.Fn.conditionIf(hasCustomDomain.logicalId, `https://${customDomainName.valueAsString}`, "(sem domínio customizado)").toString(),
      description: "Endereço final do app quando o DNS estiver apontando pro CloudFront."
    });
    new CfnOutput(this, "ApiUrl", { value: api.apiEndpoint });
    new CfnOutput(this, "CertificateArn", {
      value: cdk.Fn.conditionIf(hasCustomDomain.logicalId, certificate.ref, "(sem certificado — domínio não configurado)").toString(),
      description: "ARN do certificado ACM. Console ACM mostra os CNAMEs de validação DNS."
    });
  }
}
