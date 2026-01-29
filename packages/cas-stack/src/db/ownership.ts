/**
 * CAS Stack - Database Operations for CAS Ownership
 */

import {
  BatchGetCommand,
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import type { CasConfig, CasOwnership } from "../types.ts";

export class OwnershipDb {
  private client: DynamoDBDocumentClient;
  private tableName: string;

  constructor(config: CasConfig, client?: DynamoDBDocumentClient) {
    this.tableName = config.casOwnershipTable;
    this.client =
      client ??
      DynamoDBDocumentClient.from(new DynamoDBClient({}), {
        marshallOptions: { removeUndefinedValues: true },
      });
  }

  /**
   * Check if a scope owns a specific key
   */
  async hasOwnership(scope: string, key: string): Promise<boolean> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { scope, key },
      })
    );

    return !!result.Item;
  }

  /**
   * Get ownership record
   */
  async getOwnership(scope: string, key: string): Promise<CasOwnership | null> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { scope, key },
      })
    );

    return (result.Item as CasOwnership) ?? null;
  }

  /**
   * Check which keys a scope owns from a list
   */
  async checkOwnership(
    scope: string,
    keys: string[]
  ): Promise<{ found: string[]; missing: string[] }> {
    if (keys.length === 0) {
      return { found: [], missing: [] };
    }

    // DynamoDB BatchGet has a limit of 100 items
    const batchSize = 100;
    const found: string[] = [];

    for (let i = 0; i < keys.length; i += batchSize) {
      const batch = keys.slice(i, i + batchSize);
      const batchKeys = batch.map((key) => ({ scope, key }));

      const result = await this.client.send(
        new BatchGetCommand({
          RequestItems: {
            [this.tableName]: {
              Keys: batchKeys,
            },
          },
        })
      );

      const items = result.Responses?.[this.tableName] ?? [];
      for (const item of items) {
        found.push(item.key as string);
      }
    }

    const foundSet = new Set(found);
    const missing = keys.filter((key) => !foundSet.has(key));

    return { found, missing };
  }

  /**
   * Add ownership record
   */
  async addOwnership(
    scope: string,
    key: string,
    createdBy: string,
    contentType: string,
    size: number
  ): Promise<CasOwnership> {
    const ownership: CasOwnership = {
      scope,
      key,
      createdAt: Date.now(),
      createdBy,
      contentType,
      size,
    };

    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: ownership,
      })
    );

    return ownership;
  }

  /**
   * Remove ownership record
   */
  async removeOwnership(scope: string, key: string): Promise<void> {
    await this.client.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: { scope, key },
      })
    );
  }

  /**
   * List all keys owned by a scope (with pagination)
   */
  async listKeys(
    scope: string,
    limit: number = 100,
    startKey?: string
  ): Promise<{ keys: string[]; nextKey?: string }> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: "scope = :scope",
        ExpressionAttributeValues: {
          ":scope": scope,
        },
        Limit: limit,
        ExclusiveStartKey: startKey ? { scope, key: startKey } : undefined,
      })
    );

    const keys = (result.Items ?? []).map((item) => item.key as string);
    const nextKey = result.LastEvaluatedKey?.key as string | undefined;

    return { keys, nextKey };
  }

  /**
   * Count how many scopes reference a key (for GC)
   */
  async countReferences(key: string): Promise<number> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: "by-key",
        KeyConditionExpression: "#key = :key",
        ExpressionAttributeNames: {
          "#key": "key",
        },
        ExpressionAttributeValues: {
          ":key": key,
        },
        Select: "COUNT",
      })
    );

    return result.Count ?? 0;
  }
}
