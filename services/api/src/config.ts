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
  jobsTableName: () => required("JOBS_TABLE_NAME"),
  sitesBucketName: () => required("SITES_BUCKET_NAME"),
  publicSiteBaseUrl: () => process.env.PUBLIC_SITE_BASE_URL || "",
  metaAccessTokenSecretArn: () => optional("META_ACCESS_TOKEN_SECRET_ARN"),
  metaBusinessAccountId: () => optional("META_INSTAGRAM_BUSINESS_ACCOUNT_ID"),
  metaGraphApiVersion: () => process.env.META_GRAPH_API_VERSION || "v22.0",
  allowedOrigin: () => process.env.ALLOWED_ORIGIN || "*"
};

export function metaCredentialsAvailable(): boolean {
  return Boolean(config.metaAccessTokenSecretArn() && config.metaBusinessAccountId());
}
