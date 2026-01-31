/**
 * Shared DynamoDB client for Image Workshop Stack
 *
 * When DYNAMODB_ENDPOINT is set (e.g. http://localhost:8000 for local DynamoDB),
 * uses that endpoint with dummy credentials for local development.
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";

const endpoint = process.env.DYNAMODB_ENDPOINT;
const region = process.env.AWS_REGION ?? "us-east-1";

function dynamoClientConfig(): NonNullable<ConstructorParameters<typeof DynamoDBClient>[0]> {
  if (endpoint) {
    return {
      region,
      endpoint,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "local",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "local",
      },
    };
  }
  return { region };
}

let _client: DynamoDBClient | null = null;

/**
 * Create or return shared DynamoDB client (respects DYNAMODB_ENDPOINT for local DynamoDB)
 */
export function createDynamoDBClient(): DynamoDBClient {
  if (!_client) {
    _client = new DynamoDBClient(dynamoClientConfig());
  }
  return _client;
}
