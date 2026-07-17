import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";

const client = new SecretsManagerClient({});
const cache = new Map<string, string>();

export async function readSecret(secretArn: string): Promise<string> {
  const cached = cache.get(secretArn);
  if (cached) return cached;

  const response = await client.send(new GetSecretValueCommand({ SecretId: secretArn }));
  const secret = response.SecretString ?? (response.SecretBinary ? Buffer.from(response.SecretBinary).toString("utf8") : undefined);
  if (!secret) throw new Error("O segredo configurado está vazio.");
  cache.set(secretArn, secret);
  return secret;
}
