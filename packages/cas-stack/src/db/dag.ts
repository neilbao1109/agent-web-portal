/**
 * CAS Stack - Database Operations for DAG Metadata
 */

import {
  BatchGetCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import type { CasConfig, CasDagNode } from "../types.ts";

export class DagDb {
  private client: DynamoDBDocumentClient;
  private tableName: string;

  constructor(config: CasConfig, client?: DynamoDBDocumentClient) {
    this.tableName = config.casDagTable;
    this.client =
      client ??
      DynamoDBDocumentClient.from(new DynamoDBClient({}), {
        marshallOptions: { removeUndefinedValues: true },
      });
  }

  /**
   * Get DAG node metadata
   */
  async getNode(key: string): Promise<CasDagNode | null> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { key },
      })
    );

    return (result.Item as CasDagNode) ?? null;
  }

  /**
   * Get multiple DAG nodes
   */
  async getNodes(keys: string[]): Promise<Map<string, CasDagNode>> {
    if (keys.length === 0) {
      return new Map();
    }

    const nodes = new Map<string, CasDagNode>();
    const batchSize = 100;

    for (let i = 0; i < keys.length; i += batchSize) {
      const batch = keys.slice(i, i + batchSize);
      const batchKeys = batch.map((key) => ({ key }));

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
        nodes.set(item.key as string, item as CasDagNode);
      }
    }

    return nodes;
  }

  /**
   * Store DAG node metadata
   */
  async putNode(
    key: string,
    children: string[],
    contentType: string,
    size: number
  ): Promise<CasDagNode> {
    const node: CasDagNode = {
      key,
      children,
      contentType,
      size,
      createdAt: Date.now(),
    };

    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: node,
      })
    );

    return node;
  }

  /**
   * Check if a node exists
   */
  async exists(key: string): Promise<boolean> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { key },
        ProjectionExpression: "#key",
        ExpressionAttributeNames: {
          "#key": "key",
        },
      })
    );

    return !!result.Item;
  }

  /**
   * Traverse DAG and collect all node keys
   */
  async collectDagKeys(rootKey: string): Promise<string[]> {
    const visited = new Set<string>();
    const queue = [rootKey];

    while (queue.length > 0) {
      const key = queue.shift()!;
      if (visited.has(key)) continue;
      visited.add(key);

      const node = await this.getNode(key);
      if (node?.children) {
        for (const child of node.children) {
          if (!visited.has(child)) {
            queue.push(child);
          }
        }
      }
    }

    return Array.from(visited);
  }
}
