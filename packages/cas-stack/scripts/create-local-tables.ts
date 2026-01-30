#!/usr/bin/env bun
/**
 * Create CAS DynamoDB tables in local DynamoDB (e.g. Docker).
 *
 * Prerequisites:
 *   docker compose up -d dynamodb
 *
 * Usage:
 *   DYNAMODB_ENDPOINT=http://localhost:8000 bun run scripts/create-local-tables.ts
 *
 * Env:
 *   DYNAMODB_ENDPOINT - default http://localhost:8000
 *   TOKENS_TABLE      - default awp-cas-tokens
 *   CAS_REALM_TABLE   - default awp-cas-cas-realm
 *   CAS_DAG_TABLE     - default awp-cas-cas-dag
 */

import {
  CreateTableCommand,
  DynamoDBClient,
  type CreateTableCommandInput,
} from "@aws-sdk/client-dynamodb";

const endpoint = process.env.DYNAMODB_ENDPOINT ?? "http://localhost:8000";
const tokensTable = process.env.TOKENS_TABLE ?? "awp-cas-tokens";
const realmTable = process.env.CAS_REALM_TABLE ?? "awp-cas-cas-realm";
const dagTable = process.env.CAS_DAG_TABLE ?? "awp-cas-cas-dag";

const client = new DynamoDBClient({
  region: process.env.AWS_REGION ?? "us-east-1",
  endpoint,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "local",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "local",
  },
});

async function createTable(input: CreateTableCommandInput): Promise<void> {
  const name = input.TableName!;
  try {
    await client.send(new CreateTableCommand(input));
    console.log(`Created table: ${name}`);
  } catch (err: unknown) {
    if (err && typeof err === "object" && "name" in err && (err as { name: string }).name === "ResourceInUseException") {
      console.log(`Table already exists: ${name}`);
    } else {
      throw err;
    }
  }
}

async function main(): Promise<void> {
  console.log(`Using DynamoDB at ${endpoint}\n`);

  await createTable({
    TableName: tokensTable,
    AttributeDefinitions: [
      { AttributeName: "pk", AttributeType: "S" },
      { AttributeName: "userId", AttributeType: "S" },
      { AttributeName: "createdAt", AttributeType: "N" },
    ],
    KeySchema: [{ AttributeName: "pk", KeyType: "HASH" }],
    BillingMode: "PAY_PER_REQUEST",
    TimeToLiveSpecification: { AttributeName: "expiresAt", Enabled: true },
    GlobalSecondaryIndexes: [
      {
        IndexName: "by-user",
        KeySchema: [
          { AttributeName: "userId", KeyType: "HASH" },
          { AttributeName: "createdAt", KeyType: "RANGE" },
        ],
        Projection: { ProjectionType: "ALL" },
      },
    ],
  });

  await createTable({
    TableName: realmTable,
    AttributeDefinitions: [
      { AttributeName: "realm", AttributeType: "S" },
      { AttributeName: "key", AttributeType: "S" },
    ],
    KeySchema: [
      { AttributeName: "realm", KeyType: "HASH" },
      { AttributeName: "key", KeyType: "RANGE" },
    ],
    BillingMode: "PAY_PER_REQUEST",
    GlobalSecondaryIndexes: [
      {
        IndexName: "by-key",
        KeySchema: [
          { AttributeName: "key", KeyType: "HASH" },
          { AttributeName: "realm", KeyType: "RANGE" },
        ],
        Projection: { ProjectionType: "KEYS_ONLY" },
      },
    ],
  });

  await createTable({
    TableName: dagTable,
    AttributeDefinitions: [{ AttributeName: "key", AttributeType: "S" }],
    KeySchema: [{ AttributeName: "key", KeyType: "HASH" }],
    BillingMode: "PAY_PER_REQUEST",
  });

  console.log("\nDone. Set in .env:");
  console.log(`  DYNAMODB_ENDPOINT=${endpoint}`);
  console.log(`  TOKENS_TABLE=${tokensTable}`);
  console.log(`  CAS_REALM_TABLE=${realmTable}`);
  console.log(`  CAS_DAG_TABLE=${dagTable}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
