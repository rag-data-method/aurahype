import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import type { GenerationJob } from "@site-forge/shared";
import { config } from "./config.js";

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export async function putJob(job: GenerationJob): Promise<void> {
  await client.send(new PutCommand({ TableName: config.jobsTableName(), Item: job }));
}

export async function getJob(id: string): Promise<GenerationJob | undefined> {
  const response = await client.send(new GetCommand({ TableName: config.jobsTableName(), Key: { id } }));
  return response.Item as GenerationJob | undefined;
}
