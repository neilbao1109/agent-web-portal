/**
 * Image Workshop Stack - AWP Pubkey Store (DynamoDB)
 *
 * Implements PubkeyStore interface from @agent-web-portal/auth
 * for storing authorized public keys.
 */

import type { AuthorizedPubkey, PubkeyStore } from "@agent-web-portal/auth";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { createDynamoDBClient } from "./client.ts";
import type { Config } from "../types.ts";

/**
 * DynamoDB record for authorized pubkey
 */
interface PubkeyRecord {
  pk: string; // AWP_PUBKEY#{pubkey}
  pubkey: string;
  userId: string;
  clientName: string;
  createdAt: number;
  expiresAt?: number;
  ttl?: number; // DynamoDB TTL (seconds), optional
}

/**
 * DynamoDB-backed pubkey store
 */
export class AwpPubkeyStore implements PubkeyStore {
  private client: DynamoDBDocumentClient;
  private tableName: string;

  constructor(config: Config, client?: DynamoDBDocumentClient) {
    this.tableName = config.tokensTable;
    this.client =
      client ??
      DynamoDBDocumentClient.from(createDynamoDBClient(), {
        marshallOptions: { removeUndefinedValues: true },
      });
  }

  /**
   * Look up an authorized pubkey
   */
  async lookup(pubkey: string): Promise<AuthorizedPubkey | null> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { pk: `AWP_PUBKEY#${pubkey}` },
      })
    );

    if (!result.Item) {
      return null;
    }

    const record = result.Item as PubkeyRecord;

    // Check expiration if set
    if (record.expiresAt && record.expiresAt < Date.now()) {
      // Clean up expired record
      await this.revoke(pubkey);
      return null;
    }

    // Return without internal fields
    return {
      pubkey: record.pubkey,
      userId: record.userId,
      clientName: record.clientName,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
    };
  }

  /**
   * Store an authorized pubkey
   */
  async store(auth: AuthorizedPubkey): Promise<void> {
    const record: PubkeyRecord = {
      ...auth,
      pk: `AWP_PUBKEY#${auth.pubkey}`,
      ttl: auth.expiresAt ? Math.floor(auth.expiresAt / 1000) : undefined,
    };

    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: record,
      })
    );
  }

  /**
   * Revoke a pubkey authorization
   */
  async revoke(pubkey: string): Promise<void> {
    await this.client.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: { pk: `AWP_PUBKEY#${pubkey}` },
      })
    );
  }

  /**
   * List all authorized pubkeys for a user
   */
  async listByUser(userId: string): Promise<AuthorizedPubkey[]> {
    // Query using the by-user GSI
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: "by-user",
        KeyConditionExpression: "userId = :userId",
        FilterExpression: "begins_with(pk, :prefix)",
        ExpressionAttributeValues: {
          ":userId": userId,
          ":prefix": "AWP_PUBKEY#",
        },
      })
    );

    const now = Date.now();
    const records = (result.Items ?? []) as PubkeyRecord[];

    // Filter out expired and map to AuthorizedPubkey
    return records
      .filter((r) => !r.expiresAt || r.expiresAt > now)
      .map((r) => ({
        pubkey: r.pubkey,
        userId: r.userId,
        clientName: r.clientName,
        createdAt: r.createdAt,
        expiresAt: r.expiresAt,
      }));
  }
}
