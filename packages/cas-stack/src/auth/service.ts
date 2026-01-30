/**
 * CAS Stack - Auth Handlers (Cognito Integration)
 */

import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { TokensDb } from "../db/index.ts";
import type {
  AuthContext,
  CasConfig,
  CreateTicketRequest,
  CreateTicketResponse,
  LoginRequest,
  LoginResponse,
  RefreshRequest,
  RefreshResponse,
} from "../types.ts";
import { loadServerConfig } from "../types.ts";

export class AuthService {
  private cognito: CognitoIdentityProviderClient;
  private tokensDb: TokensDb;
  private config: CasConfig;

  constructor(config: CasConfig, tokensDb?: TokensDb, cognito?: CognitoIdentityProviderClient) {
    this.config = config;
    this.tokensDb = tokensDb ?? new TokensDb(config);
    this.cognito = cognito ?? new CognitoIdentityProviderClient({ region: config.cognitoRegion });
  }

  /**
   * Login with email/password
   */
  async login(request: LoginRequest): Promise<LoginResponse> {
    const authResult = await this.cognito.send(
      new InitiateAuthCommand({
        AuthFlow: "USER_PASSWORD_AUTH",
        ClientId: this.config.cognitoClientId,
        AuthParameters: {
          USERNAME: request.email,
          PASSWORD: request.password,
        },
      })
    );

    if (!authResult.AuthenticationResult) {
      throw new Error("Authentication failed");
    }

    const { AccessToken, RefreshToken, ExpiresIn } = authResult.AuthenticationResult;

    if (!AccessToken || !RefreshToken) {
      throw new Error("Missing tokens in auth response");
    }

    // Decode access token to get user info (Cognito JWT)
    const payload = this.decodeJwt(AccessToken);
    const userId = payload.sub as string;
    const email = payload.email as string;
    const name = payload.name as string | undefined;

    // Create our own user token for API access
    const userToken = await this.tokensDb.createUserToken(userId, RefreshToken, ExpiresIn ?? 3600);

    const tokenId = TokensDb.extractTokenId(userToken.pk);

    return {
      userToken: tokenId,
      refreshToken: RefreshToken,
      expiresAt: new Date(userToken.expiresAt).toISOString(),
      user: {
        id: userId,
        email,
        name,
      },
    };
  }

  /**
   * Refresh user token
   */
  async refresh(request: RefreshRequest): Promise<RefreshResponse> {
    const authResult = await this.cognito.send(
      new InitiateAuthCommand({
        AuthFlow: "REFRESH_TOKEN_AUTH",
        ClientId: this.config.cognitoClientId,
        AuthParameters: {
          REFRESH_TOKEN: request.refreshToken,
        },
      })
    );

    if (!authResult.AuthenticationResult) {
      throw new Error("Token refresh failed");
    }

    const { AccessToken, ExpiresIn } = authResult.AuthenticationResult;

    if (!AccessToken) {
      throw new Error("Missing access token in refresh response");
    }

    // Decode to get user ID
    const payload = this.decodeJwt(AccessToken);
    const userId = payload.sub as string;

    // Create new user token
    const userToken = await this.tokensDb.createUserToken(
      userId,
      request.refreshToken,
      ExpiresIn ?? 3600
    );

    const tokenId = TokensDb.extractTokenId(userToken.pk);

    return {
      userToken: tokenId,
      expiresAt: new Date(userToken.expiresAt).toISOString(),
    };
  }

  /**
   * Create ticket
   */
  async createTicket(
    auth: AuthContext,
    request: CreateTicketRequest
  ): Promise<CreateTicketResponse> {
    if (!auth.canIssueTicket) {
      throw new Error("Not authorized to issue tickets");
    }

    const issuerId = TokensDb.extractTokenId(auth.token.pk);
    const serverConfig = loadServerConfig();

    const ticket = await this.tokensDb.createTicket(
      auth.shard,
      issuerId,
      request.scope,
      serverConfig,
      {
        writable: request.writable,
        expiresIn: request.expiresIn,
      }
    );

    const ticketId = TokensDb.extractTokenId(ticket.pk);

    // Construct endpoint URL
    const endpoint = `${serverConfig.baseUrl}/api/cas/${ticket.shard}/ticket/${ticketId}`;

    return {
      id: ticketId,
      endpoint,
      expiresAt: new Date(ticket.expiresAt).toISOString(),
      shard: ticket.shard,
      scope: ticket.scope,
      writable: ticket.writable ?? false,
      config: ticket.config,
    };
  }

  /**
   * Revoke ticket
   */
  async revokeTicket(auth: AuthContext, ticketId: string): Promise<void> {
    // Verify the ticket was issued by this user or their agent
    const isOwner = await this.tokensDb.verifyTokenOwnership(ticketId, auth.userId);
    if (!isOwner) {
      throw new Error("Ticket not found or access denied");
    }

    await this.tokensDb.deleteToken(ticketId);
  }

  /**
   * Decode JWT payload (without verification - Cognito already verified)
   */
  private decodeJwt(token: string): Record<string, unknown> {
    const parts = token.split(".");
    if (parts.length !== 3 || !parts[1]) {
      throw new Error("Invalid JWT format");
    }

    const payload = Buffer.from(parts[1], "base64url").toString("utf-8");
    return JSON.parse(payload);
  }
}
