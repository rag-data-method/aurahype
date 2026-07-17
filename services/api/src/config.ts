/**
 * Configuração da Lambda a partir de variáveis de ambiente.
 * Todas as envs vêm do CDK (site-forge-stack.ts).
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`A variável ${name} não está configurada.`);
  return value;
}

function optional(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

export const config = {
  // ----- storage AWS -----
  jobsTableName: () => required("JOBS_TABLE_NAME"),
  sitesBucketName: () => required("SITES_BUCKET_NAME"),
  publicSiteBaseUrl: () => process.env.PUBLIC_SITE_BASE_URL || "",
  allowedOrigin: () => process.env.ALLOWED_ORIGIN || "*",

  // ----- Azure OpenAI (Tríade 5.6) -----
  /** Ex: https://mariareiss2301-8779-resource.services.ai.azure.com */
  azureOpenAiEndpoint: () => optional("AZURE_OPENAI_ENDPOINT"),
  azureOpenAiKeySecretArn: () => optional("AZURE_OPENAI_KEY_SECRET_ARN"),
  azureOpenAiDeploymentLuna: () =>
    process.env.AZURE_OPENAI_DEPLOYMENT_LUNA || "gpt-5.6-luna",
  azureOpenAiDeploymentTerra: () =>
    process.env.AZURE_OPENAI_DEPLOYMENT_TERRA || "gpt-5.6-terra",
  azureOpenAiDeploymentSol: () =>
    process.env.AZURE_OPENAI_DEPLOYMENT_SOL || "gpt-5.6-sol",
  /** Fallback quando algum dos 5.6 estourar quota / falhar. Ex: "gpt-5.4". */
  azureOpenAiDeploymentFallback: () => optional("AZURE_OPENAI_DEPLOYMENT_FALLBACK"),
};

export function azureConfigured(): boolean {
  return Boolean(config.azureOpenAiEndpoint() && config.azureOpenAiKeySecretArn());
}
