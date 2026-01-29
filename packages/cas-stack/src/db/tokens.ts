/**
 * CAS Stack - Database Operations for Tokens
 */

import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import type {
  AgentToken,
  CasConfig,
  Ticket,
  Token,
  TokenPermissions,
  UserToken,
} from "../types.ts";

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
      DynamoDBDocumentClient.from(new DynamoDBClient({}), {
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
   * Create an agent token
   */
  async createAgentToken(
    userId: string,
    name: string,
    permissions: TokenPermissions,
    expiresIn: number = 30 * 24 * 3600 // 30 days default
  ): Promise<AgentToken> {
    const tokenId = generateAgentTokenId();
    const now = Date.now();
    const expiresAt = now + expiresIn * 1000;

    const token: AgentToken = {
      pk: `token#${tokenId}`,
      type: "agent",
      userId,
      name,
      permissions,
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
   * Create a ticket
   */
  async createTicket(
    scope: string,
    issuerId: string,
    ticketType: "read" | "write",
    key?: string,
    expiresIn?: number
  ): Promise<Ticket> {
    const ticketId = generateTicketId();
    const now = Date.now();
    // Default: read tickets last 1 hour, write tickets last 5 minutes
    const defaultExpiry = ticketType === "read" ? 3600 : 300;
    const expiresAt = now + (expiresIn ?? defaultExpiry) * 1000;

    const ticket: Ticket = {
      pk: `token#${ticketId}`,
      type: "ticket",
      scope,
      issuerId,
      ticketType,
      key,
      createdAt: now,
      expiresAt,
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
   * List agent tokens for a user
   */
  async listAgentTokens(userId: string): Promise<AgentToken[]> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: "by-user",
        KeyConditionExpression: "userId = :userId",
        FilterExpression: "#type = :type AND expiresAt > :now",
        ExpressionAttributeNames: {
          "#type": "type",
        },
        ExpressionAttributeValues: {
          ":userId": userId,
          ":type": "agent",
          ":now": Date.now(),
        },
      })
    );

    return (result.Items ?? []) as AgentToken[];
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
  async verifyTokenOwnership(
    tokenId: string,
    userId: string
  ): Promise<boolean> {
    const token = await this.getToken(tokenId);
    if (!token) return false;

    if (token.type === "user" || token.type === "agent") {
      return token.userId === userId;
    }

    if (token.type === "ticket") {
      // Check if the ticket was issued by this user or their agent
      const issuer = await this.getToken(token.issuerId);
      if (!issuer) return false;
      if (issuer.type === "user" || issuer.type === "agent") {
        return issuer.userId === userId;
      }
    }

    return false;
  }

  /**
   * Extract token ID from pk
   */
  static extractTokenId(pk: string): string {
    return pk.replace("token#", "");
  }
}
