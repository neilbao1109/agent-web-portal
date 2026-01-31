/**
 * Image Workshop Stack - AWP Pending Auth Store (DynamoDB)
 *
 * Implements PendingAuthStore interface from @agent-web-portal/auth
 * for storing pending authorization requests during the AWP auth flow.
 */

import type { PendingAuth, PendingAuthStore } from "@agent-web-portal/auth";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import { createDynamoDBClient } from "./client.ts";
import type { Config } from "../types.ts";

/**
 * DynamoDB record for pending auth
 */
interface PendingAuthRecord {
  pk: string; // AWP_PENDING#{pubkey}
  pubkey: string;
  clientName: string;
  verificationCode: string;
  createdAt: number;
  expiresAt: number;
  ttl: number; // DynamoDB TTL (seconds)
}

/**
 * DynamoDB-backed pending auth store
 */
export class AwpPendingAuthStore implements PendingAuthStore {
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
   * Create a new pending authorization
   */
  async create(auth: PendingAuth): Promise<void> {
    const record: PendingAuthRecord = {
      ...auth,
      pk: `AWP_PENDING#${auth.pubkey}`,
      ttl: Math.floor(auth.expiresAt / 1000), // DynamoDB TTL is in seconds
    };

    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: record,
      })
    );
  }

  /**
   * Get pending authorization by pubkey
   */
  async get(pubkey: string): Promise<PendingAuth | null> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { pk: `AWP_PENDING#${pubkey}` },
      })
    );

    if (!result.Item) {
      return null;
    }

    const record = result.Item as PendingAuthRecord;

    // Check expiration
    if (record.expiresAt < Date.now()) {
      // Clean up expired record
      await this.delete(pubkey);
      return null;
    }

    // Return without internal fields
    return {
      pubkey: record.pubkey,
      clientName: record.clientName,
      verificationCode: record.verificationCode,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
    };
  }

  /**
   * Delete pending authorization
   */
  async delete(pubkey: string): Promise<void> {
    await this.client.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: { pk: `AWP_PENDING#${pubkey}` },
      })
    );
  }

  /**
   * Validate verification code for a pubkey
   */
  async validateCode(pubkey: string, code: string): Promise<boolean> {
    const pending = await this.get(pubkey);
    if (!pending) {
      return false;
    }

    return pending.verificationCode === code;
  }
}
