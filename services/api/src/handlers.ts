/**
 * Lambda handlers da API Tríade 56.
 *
 * Rotas (montadas pelo CDK em API Gateway HTTP):
 *   OPTIONS *          → cors preflight
 *   POST    /jobs      → createJob  — dispara pipeline Luna→Terra→Sol e persiste
 *   GET     /jobs/{id} → readJob    — status + slug do site
 *   GET     /sites/{slug}          → readSite (HTML por default, ?format=json pra debug)
 */

import { randomUUID } from "node:crypto";
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import {
  parseCreateGenerationRequest,
  type GenerationJob,
} from "@site-forge/shared";
import { config } from "./config.js";
import { errorMessage, htmlResponse, json, parseJsonBody } from "./http.js";
import { getJob, putJob } from "./repository.js";
import { getSite, saveSite } from "./site-store.js";
import { generateSite } from "./triade.js";

export async function options(): Promise<APIGatewayProxyStructuredResultV2> {
  return json(204, {});
}

export async function createJob(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> {
  const now = new Date().toISOString();
  const jobId = randomUUID();

  try {
    const input = parseCreateGenerationRequest(
      parseJsonBody(event.body, event.isBase64Encoded)
    );

    // Persiste job em "processing" primeiro pra ficar rastreável mesmo
    // se a Tríade falhar no meio.
    const pending: GenerationJob = {
      id: jobId,
      brief: input.brief,
      plan: input.plan,
      handle: input.handle,
      status: "processing",
      createdAt: now,
      updatedAt: now,
    };
    await putJob(pending);

    const site = await generateSite({
      brief: input.brief,
      plan: input.plan,
      handle: input.handle,
    });
    await saveSite(site);

    const finished: GenerationJob = {
      ...pending,
      status: "published",
      siteSlug: site.slug,
      updatedAt: new Date().toISOString(),
    };
    await putJob(finished);

    const base = config.publicSiteBaseUrl();
    const shareUrl = base ? `${base}/s/${site.slug}` : undefined;

    return json(200, { job: finished, site, shareUrl });
  } catch (error) {
    console.error("createJob failed", error);

    // Melhor esforço: marca o job como failed se ele chegou a existir.
    try {
      const stored = await getJob(jobId);
      if (stored) {
        await putJob({
          ...stored,
          status: "failed",
          errorMessage: errorMessage(error),
          updatedAt: new Date().toISOString(),
        });
      }
    } catch (persistError) {
      console.warn("também falhei salvando o job como failed:", persistError);
    }

    return json(400, { message: errorMessage(error), jobId });
  }
}

export async function readJob(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> {
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

export async function readSite(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const slug = event.pathParameters?.slug;
    if (!slug || !/^[a-z0-9-]{3,80}$/.test(slug)) {
      return json(400, { message: "Slug inválido." });
    }
    const site = await getSite(slug);
    if (!site) return json(404, { message: "Site não encontrado." });

    const format = event.queryStringParameters?.format;
    if (format === "json") {
      return json(200, { site });
    }
    // Default: serve HTML direto pra abrir no browser como se fosse página.
    return htmlResponse(200, site.html, { cacheSeconds: 300 });
  } catch (error) {
    console.error("readSite failed", error);
    return json(500, { message: errorMessage(error) });
  }
}
