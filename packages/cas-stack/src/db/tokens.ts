/**
 * CAS Stack - Database Operations for Tokens
 */

import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { createDynamoDBClient } from "./client.ts";
import type {
  AgentToken,
  CasConfig,
  CasServerConfig,
  Ticket,
  Token,
  UserToken,
  WritableConfig,
} from "../types.ts";
import { loadServerConfig } from "../types.ts";

// ============================================================================
// Token ID Generation
// ============================================================================

function generateId(prefix: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `${prefix}_${timestamp}${random}`;
}

export function generateUserTokenId(): string {
  return generateId("usr");
}

export function generateAgentTokenId(): string {
  return generateId("agt");
}

export function generateTicketId(): string {
  return generateId("tkt");
}

// ============================================================================
// Token Database Operations
// ============================================================================

export class TokensDb {
  private client: DynamoDBDocumentClient;
  private tableName: string;

  constructor(config: CasConfig, client?: DynamoDBDocumentClient) {
    this.tableName = config.tokensTable;
    this.client =
      client ??
      DynamoDBDocumentClient.from(createDynamoDBClient(), {
        marshallOptions: { removeUndefinedValues: true },
      });
  }

  /**
   * Get a token by its full ID (e.g., "usr_xxx", "agt_xxx", "tkt_xxx")
   */
  async getToken(tokenId: string): Promise<Token | null> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { pk: `token#${tokenId}` },
      })
    );

    if (!result.Item) {
      return null;
    }

    // Check expiration
    if (result.Item.expiresAt && result.Item.expiresAt < Date.now()) {
      return null;
    }

    return result.Item as Token;
  }

  /**
   * Create a user token
   */
  async createUserToken(
    userId: string,
    refreshToken: string,
    expiresIn: number = 3600 // 1 hour default
  ): Promise<UserToken> {
    const tokenId = generateUserTokenId();
    const now = Date.now();
    const expiresAt = now + expiresIn * 1000;

    const token: UserToken = {
      pk: `token#${tokenId}`,
      type: "user",
      userId,
      refreshToken,
      createdAt: now,
      expiresAt,
    };

    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: token,
      })
    );

    return token;
  }

  /**
   * Create a ticket with new structure
   * Signature matches MemoryTokensDb for server compatibility.
   */
  async createTicket(
    realm: string,
    issuerId: string,
    scope: string | string[],
    writable?: WritableConfig,
    expiresIn?: number
  ): Promise<Ticket> {
    const serverConfig = loadServerConfig();
    const ticketId = generateTicketId();
    const now = Date.now();

    // Default 1 hour, capped at maxTicketTtl
    const requestedExpiresIn = expiresIn ?? 3600;
    const cappedExpiresIn = Math.min(requestedExpiresIn, serverConfig.maxTicketTtl);
    const expiresAt = now + cappedExpiresIn * 1000;

    const ticket: Ticket = {
      pk: `token#${ticketId}`,
      type: "ticket",
      realm,
      issuerId,
      scope,
      writable,
      createdAt: now,
      expiresAt,
      config: {
        chunkThreshold: serverConfig.chunkThreshold,
      },
    };

    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: ticket,
      })
    );

    return ticket;
  }

  /**
   * Get a ticket by ID
   * Returns null if not found, expired, or not a ticket type
   */
  async getTicket(ticketId: string): Promise<Ticket | null> {
    const token = await this.getToken(ticketId);
    if (!token || token.type !== "ticket") {
      return null;
    }
    return token as Ticket;
  }

  /**
   * Mark ticket as written (atomic operation)
   * Returns true if successful, false if already written
   */
  async markTicketWritten(ticketId: string, rootKey: string): Promise<boolean> {
    try {
      await this.client.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { pk: `token#${ticketId}` },
          UpdateExpression: "SET written = :rootKey",
          ConditionExpression: "attribute_not_exists(written)",
          ExpressionAttributeValues: {
            ":rootKey": rootKey,
          },
        })
      );
      return true;
    } catch (error: unknown) {
      if (
        error &&
        typeof error === "object" &&
        "name" in error &&
        error.name === "ConditionalCheckFailedException"
      ) {
        return false; // Already written
      }
      throw error;
    }
  }

  /**
   * Revert ticket write status (for failed uploads)
   */
  async revertTicketWrite(ticketId: string): Promise<void> {
    await this.client.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { pk: `token#${ticketId}` },
        UpdateExpression: "REMOVE written",
      })
    );
  }

  /**
   * Delete a token
   */
  async deleteToken(tokenId: string): Promise<void> {
    await this.client.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: { pk: `token#${tokenId}` },
      })
    );
  }

  /**
   * Verify token belongs to user (for revocation)
   */
  async verifyTokenOwnership(tokenId: string, userId: string): Promise<boolean> {
    const token = await this.getToken(tokenId);
    if (!token) return false;

    if (token.type === "user") {
      return token.userId === userId;
    }

    if (token.type === "agent") {
      return token.userId === userId;
    }

    if (token.type === "ticket") {
      // Check if the ticket was issued by this user
      const issuer = await this.getToken(token.issuerId);
      if (!issuer) return false;
      if (issuer.type === "user" || issuer.type === "agent") {
        return issuer.userId === userId;
      }
    }

    return false;
  }

  // ============================================================================
  // Agent Token Operations
  // ============================================================================

  /**
   * Create an agent token
   */
  async createAgentToken(
    userId: string,
    name: string,
    serverConfig: CasServerConfig,
    options?: {
      description?: string;
      expiresIn?: number;
    }
  ): Promise<AgentToken> {
    const tokenId = generateAgentTokenId();
    const now = Date.now();

    // Default 30 days, capped at maxAgentTokenTtl
    const requestedExpiresIn = options?.expiresIn ?? 30 * 24 * 60 * 60; // 30 days
    const expiresIn = Math.min(requestedExpiresIn, serverConfig.maxAgentTokenTtl);
    const expiresAt = now + expiresIn * 1000;

    const token: AgentToken = {
      pk: `token#${tokenId}`,
      type: "agent",
      userId,
      name,
      description: options?.description,
      createdAt: now,
      expiresAt,
    };

    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          ...token,
          // userId is already in token, used by GSI "by-user"
        },
      })
    );

    return token;
  }

  /**
   * List agent tokens for a user
   */
  async listAgentTokensByUser(userId: string): Promise<AgentToken[]> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: "by-user",
        KeyConditionExpression: "userId = :userId",
        FilterExpression: "begins_with(pk, :prefix)",
        ExpressionAttributeValues: {
          ":userId": userId,
          ":prefix": "token#agt_",
        },
      })
    );

    const now = Date.now();
    return (result.Items ?? []).filter((item) => item.expiresAt > now) as AgentToken[];
  }

  /**
   * Revoke an agent token
   */
  async revokeAgentToken(userId: string, tokenId: string): Promise<void> {
    // Verify ownership first
    const token = await this.getToken(tokenId);
    if (!token || token.type !== "agent" || token.userId !== userId) {
      throw new Error("Agent token not found or access denied");
    }

    await this.deleteToken(tokenId);
  }

  /**
   * Extract token ID from pk
   */
  static extractTokenId(pk: string): string {
    return pk.replace("token#", "");
  }
}
