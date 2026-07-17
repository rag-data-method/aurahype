/**
 * CDK Stack da Tríade 56.
 *
 * Recursos:
 *   - DynamoDB: fila de jobs de geração
 *   - S3: bucket com os sites HTML gerados pela Tríade
 *   - S3 + CloudFront: hospedagem do frontend estático (apps/web/dist)
 *   - Secrets Manager: AzureOpenAIKey (placeholder — Miriam preenche depois)
 *   - Lambda x4: createJob, readJob, readSite, options (todos NodejsFunction NODE 22)
 *   - API Gateway HTTP API: /jobs, /jobs/{id}, /sites/{slug}
 *   - ACM cert + custom domain: opcional, ativa quando CustomDomainName != ""
 */

import { basename, resolve } from "node:path";
import * as cdk from "aws-cdk-lib";
import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps,
} from "aws-cdk-lib";
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
  return basename(cwd) === "infra"
    ? resolve(cwd, "..", ...segments)
    : resolve(cwd, ...segments);
}

export class SiteForgeStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // ---------------------------------------------------------------------
    // Parâmetros — passados no deploy via --parameters ou GitHub Actions
    // ---------------------------------------------------------------------

    /** Ex: triade56.com. Vazio = usa só URL bruta do CloudFront. */
    const customDomainName = new cdk.CfnParameter(this, "CustomDomainName", {
      type: "String",
      default: "",
      description:
        "Domínio custom (ex: triade56.com). Deixe vazio pra usar só o CloudFront.",
    });

    /** Endpoint do Azure OpenAI (Foundry). Sem barra no final. */
    const azureEndpoint = new cdk.CfnParameter(this, "AzureOpenAiEndpoint", {
      type: "String",
      default: "https://mariareiss2301-8779-resource.services.ai.azure.com",
      description:
        "Endpoint do Azure OpenAI (Responses API). Ex: https://xxx.services.ai.azure.com",
    });

    const lunaDeployment = new cdk.CfnParameter(this, "LunaDeployment", {
      type: "String",
      default: "gpt-5.6-luna",
      description: "Nome do deployment Azure OpenAI da face Luna.",
    });
    const terraDeployment = new cdk.CfnParameter(this, "TerraDeployment", {
      type: "String",
      default: "gpt-5.6-terra",
      description: "Nome do deployment Azure OpenAI da face Terra.",
    });
    const solDeployment = new cdk.CfnParameter(this, "SolDeployment", {
      type: "String",
      default: "gpt-5.6-sol",
      description: "Nome do deployment Azure OpenAI da face Sol.",
    });
    const fallbackDeployment = new cdk.CfnParameter(
      this,
      "FallbackDeployment",
      {
        type: "String",
        default: "",
        description:
          "Deployment fallback quando os 5.6 estourarem quota. Ex: gpt-5.4. Vazio = sem fallback.",
      }
    );

    // ---------------------------------------------------------------------
    // Secret com a Azure OpenAI key. O CDK só cria o slot vazio.
    // Miriam preenche a key real via workflow (aws secretsmanager put-secret-value)
    // ou pelo console — a key NUNCA aparece em código nem em parâmetro.
    // ---------------------------------------------------------------------
    const azureKeySecret = new secretsmanager.Secret(this, "AzureOpenAiKey", {
      description:
        "Azure OpenAI API key (Responses API). Preencher via aws secretsmanager put-secret-value depois do primeiro deploy.",
      // Placeholder aleatório — CDK exige algum valor inicial pra criar o secret.
      // O valor real é sobrescrito pelo workflow ou pelo console.
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ placeholder: true }),
        generateStringKey: "value",
        passwordLength: 32,
        excludePunctuation: true,
      },
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // ---------------------------------------------------------------------
    // Storage — DynamoDB (jobs) + S3 (sites gerados)
    // ---------------------------------------------------------------------

    const jobs = new dynamodb.Table(this, "GenerationJobs", {
      partitionKey: { name: "id", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const sites = new s3.Bucket(this, "GeneratedSites", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // ---------------------------------------------------------------------
    // Lambda handlers
    // ---------------------------------------------------------------------

    const handlerEntry = workspacePath(
      "services",
      "api",
      "src",
      "handlers.ts"
    );

    const makeHandler = (name: string, handler: string, timeoutSec: number) =>
      new NodejsFunction(this, name, {
        entry: handlerEntry,
        handler,
        runtime: lambda.Runtime.NODEJS_22_X,
        timeout: Duration.seconds(timeoutSec),
        memorySize: 1024,
        bundling: {
          minify: true,
          sourceMap: true,
          target: "node22",
        },
        environment: {
          JOBS_TABLE_NAME: jobs.tableName,
          SITES_BUCKET_NAME: sites.bucketName,
          ALLOWED_ORIGIN: "*",
          AZURE_OPENAI_ENDPOINT: azureEndpoint.valueAsString,
          AZURE_OPENAI_KEY_SECRET_ARN: azureKeySecret.secretArn,
          AZURE_OPENAI_DEPLOYMENT_LUNA: lunaDeployment.valueAsString,
          AZURE_OPENAI_DEPLOYMENT_TERRA: terraDeployment.valueAsString,
          AZURE_OPENAI_DEPLOYMENT_SOL: solDeployment.valueAsString,
          AZURE_OPENAI_DEPLOYMENT_FALLBACK: fallbackDeployment.valueAsString,
        },
      });

    // createJob roda a Tríade em série — mais tempo (Luna+Terra+Sol ~60s pior caso).
    // API Gateway HTTP corta em 30s; Lambda continua rodando em background e grava
    // o job como published. Cliente faz polling em GET /jobs/{id}.
    const createJobFn = makeHandler("CreateGenerationJob", "createJob", 120);
    const getJobFn = makeHandler("GetGenerationJob", "readJob", 15);
    const getSiteFn = makeHandler("GetGeneratedSite", "readSite", 15);
    const optionsFn = makeHandler("CorsOptions", "options", 5);
    const allFunctions = [createJobFn, getJobFn, getSiteFn, optionsFn];

    for (const fn of allFunctions) {
      jobs.grantReadWriteData(fn);
      sites.grantReadWrite(fn);
      azureKeySecret.grantRead(fn);
    }

    // ---------------------------------------------------------------------
    // API Gateway HTTP
    // ---------------------------------------------------------------------

    const api = new apigwv2.HttpApi(this, "PublicApi", {
      corsPreflight: {
        allowHeaders: ["content-type"],
        allowMethods: [
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.POST,
          apigwv2.CorsHttpMethod.OPTIONS,
        ],
        allowOrigins: ["*"],
        maxAge: Duration.hours(1),
      },
    });
    api.addRoutes({
      path: "/jobs",
      methods: [apigwv2.HttpMethod.POST],
      integration: new HttpLambdaIntegration(
        "CreateJobIntegration",
        createJobFn
      ),
    });
    api.addRoutes({
      path: "/jobs/{id}",
      methods: [apigwv2.HttpMethod.GET],
      integration: new HttpLambdaIntegration(
        "GetJobIntegration",
        getJobFn
      ),
    });
    api.addRoutes({
      path: "/sites/{slug}",
      methods: [apigwv2.HttpMethod.GET],
      integration: new HttpLambdaIntegration(
        "GetSiteIntegration",
        getSiteFn
      ),
    });

    // ---------------------------------------------------------------------
    // Frontend estático (apps/web/dist) atrás de CloudFront
    // ---------------------------------------------------------------------

    const webBucket = new s3.Bucket(this, "WebApplication", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // Cert + Custom Domain: condição CFN — ativa quando CustomDomainName != "".
    const hasCustomDomain = new cdk.CfnCondition(this, "HasCustomDomain", {
      expression: cdk.Fn.conditionNot(
        cdk.Fn.conditionEquals(customDomainName.valueAsString, "")
      ),
    });
    const certificate = new acm.CfnCertificate(this, "SiteCertificate", {
      domainName: customDomainName.valueAsString,
      validationMethod: "DNS",
      subjectAlternativeNames: [
        cdk.Fn.join(".", ["www", customDomainName.valueAsString]),
      ],
    });
    certificate.cfnOptions.condition = hasCustomDomain;

    const distributionConfig: cloudfront.DistributionProps = {
      defaultRootObject: "index.html",
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(webBucket),
        viewerProtocolPolicy:
          cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
          ttl: Duration.minutes(5),
        },
      ],
    };
    const distribution = new cloudfront.Distribution(
      this,
      "WebDistribution",
      distributionConfig
    );

    // Aliases + cert quando domínio informado.
    const cfnDist = distribution.node.defaultChild as cloudfront.CfnDistribution;
    cfnDist.addPropertyOverride(
      "DistributionConfig.Aliases",
      cdk.Fn.conditionIf(
        hasCustomDomain.logicalId,
        [
          customDomainName.valueAsString,
          cdk.Fn.join(".", ["www", customDomainName.valueAsString]),
        ],
        cdk.Aws.NO_VALUE
      )
    );
    cfnDist.addPropertyOverride(
      "DistributionConfig.ViewerCertificate",
      cdk.Fn.conditionIf(
        hasCustomDomain.logicalId,
        {
          AcmCertificateArn: certificate.ref,
          SslSupportMethod: "sni-only",
          MinimumProtocolVersion: "TLSv1.2_2021",
        },
        cdk.Aws.NO_VALUE
      )
    );

    new s3deploy.BucketDeployment(this, "DeployWebApplication", {
      sources: [
        s3deploy.Source.asset(workspacePath("apps", "web", "dist")),
        // runtime-config.js exposto pro frontend descobrir a apiUrl dinamicamente
        s3deploy.Source.data(
          "runtime-config.js",
          `window.__TRIADE_RUNTIME__ = { apiUrl: ${JSON.stringify(
            api.apiEndpoint
          )} };`
        ),
      ],
      destinationBucket: webBucket,
      distribution,
      distributionPaths: ["/*"],
    });

    // ---------------------------------------------------------------------
    // Outputs
    // ---------------------------------------------------------------------

    new CfnOutput(this, "CloudFrontUrl", {
      value: `https://${distribution.distributionDomainName}`,
      description:
        "URL bruta do CloudFront. Aponta o CNAME do teu domínio pra este destino.",
    });
    new CfnOutput(this, "CustomDomainUrl", {
      value: cdk.Fn.conditionIf(
        hasCustomDomain.logicalId,
        `https://${customDomainName.valueAsString}`,
        "(sem domínio customizado)"
      ).toString(),
    });
    new CfnOutput(this, "ApiUrl", { value: api.apiEndpoint });
    new CfnOutput(this, "CertificateArn", {
      value: cdk.Fn.conditionIf(
        hasCustomDomain.logicalId,
        certificate.ref,
        "(sem certificado)"
      ).toString(),
    });
    new CfnOutput(this, "AzureOpenAiKeySecretArn", {
      value: azureKeySecret.secretArn,
      description:
        "ARN do Secret onde a Azure OpenAI key deve ser salva. Preencher via 'aws secretsmanager put-secret-value'.",
    });
    new CfnOutput(this, "GeneratedSitesBucket", {
      value: sites.bucketName,
    });
  }
}
