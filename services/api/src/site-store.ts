import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { GeneratedSite } from "@site-forge/shared";
import { config } from "./config.js";

const s3 = new S3Client({});

function key(slug: string): string {
  return `sites/${slug}.json`;
}

export async function saveSite(site: GeneratedSite): Promise<void> {
  await s3.send(new PutObjectCommand({
    Bucket: config.sitesBucketName(),
    Key: key(site.slug),
    ContentType: "application/json",
    CacheControl: "public, max-age=300",
    Body: JSON.stringify(site)
  }));
}

export async function getSite(slug: string): Promise<GeneratedSite | undefined> {
  try {
    const response = await s3.send(new GetObjectCommand({ Bucket: config.sitesBucketName(), Key: key(slug) }));
    const body = await response.Body?.transformToString();
    return body ? (JSON.parse(body) as GeneratedSite) : undefined;
  } catch (error) {
    if ((error as { name?: string }).name === "NoSuchKey") return undefined;
    throw error;
  }
}
