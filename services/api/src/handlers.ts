import { randomUUID } from "node:crypto";
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { parseCreateGenerationRequest, type GenerationJob } from "@site-forge/shared";
import { config } from "./config.js";
import { buildSite } from "./generator.js";
import { errorMessage, json, parseJsonBody } from "./http.js";
import { fetchInstagramProfile } from "./instagram.js";
import { getJob, putJob } from "./repository.js";
import { getSite, saveSite } from "./site-store.js";

export async function options(): Promise<APIGatewayProxyStructuredResultV2> {
  return json(204, {});
}

export async function createJob(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const input = parseCreateGenerationRequest(parseJsonBody(event.body, event.isBase64Encoded));
    const profile = await fetchInstagramProfile(input.username);
    const site = buildSite(profile, input.model);
    const now = new Date().toISOString();
    const job: GenerationJob = {
      id: randomUUID(),
      username: input.username,
      model: input.model,
      status: "published",
      createdAt: now,
      updatedAt: now,
      profile,
      siteSlug: site.slug
    };

    await Promise.all([saveSite(site), putJob(job)]);
    const shareUrl = config.publicSiteBaseUrl() ? `${config.publicSiteBaseUrl()}/s/${site.slug}` : undefined;
    return json(200, { job, site, shareUrl });
  } catch (error) {
    console.error("createJob failed", error);
    return json(400, { message: errorMessage(error) });
  }
}

export async function readJob(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const id = event.pathParameters?.id;
    if (!id) return json(400, { message: "ID do job ausente." });
    const job = await getJob(id);
    return job ? json(200, { job }) : json(404, { message: "Job não encontrado." });
  } catch (error) {
    console.error("readJob failed", error);
    return json(500, { message: errorMessage(error) });
  }
}

export async function readSite(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const slug = event.pathParameters?.slug;
    if (!slug || !/^[a-z0-9-]{3,80}$/.test(slug)) return json(400, { message: "Slug inválido." });
    const site = await getSite(slug);
    return site ? json(200, { site }) : json(404, { message: "Site não encontrado." });
  } catch (error) {
    console.error("readSite failed", error);
    return json(500, { message: errorMessage(error) });
  }
}
