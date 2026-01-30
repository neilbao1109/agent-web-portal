/**
 * CAS Stack - Authentication Middleware
 *
 * Supports two authentication methods:
 * 1. Bearer Token (User Token / Ticket) - Traditional token-based auth
 * 2. AWP Signed Requests - ECDSA P-256 signature-based auth for AI agents
 */

import { createHash } from "node:crypto";
import type { PubkeyStore } from "@agent-web-portal/auth";
import { AWP_AUTH_HEADERS, validateTimestamp, verifySignature } from "@agent-web-portal/auth";
import { TokensDb } from "../db/tokens.ts";
import type { AuthContext, CasConfig, HttpRequest, Token } from "../types.ts";

export class AuthMiddleware {
  private tokensDb: TokensDb;
  private awpPubkeyStore: PubkeyStore | null;

  constructor(config: CasConfig, tokensDb?: TokensDb, awpPubkeyStore?: PubkeyStore) {
    this.tokensDb = tokensDb ?? new TokensDb(config);
    this.awpPubkeyStore = awpPubkeyStore ?? null;
  }

  /**
   * Parse Authorization header and validate token, or verify AWP signed request
   */
  async authenticate(req: HttpRequest): Promise<AuthContext | null> {
    // First, check for AWP signed request
    if (this.hasAwpCredentials(req) && this.awpPubkeyStore) {
      return this.authenticateAwp(req);
    }

    // Fall back to Bearer token auth
    return this.authenticateBearer(req);
  }

  /**
   * Check if request has AWP authentication credentials
   */
  private hasAwpCredentials(req: HttpRequest): boolean {
    const pubkey =
      req.headers[AWP_AUTH_HEADERS.pubkey.toLowerCase()] ?? req.headers[AWP_AUTH_HEADERS.pubkey];
    return !!pubkey;
  }

  /**
   * Authenticate using AWP signed request
   */
  private async authenticateAwp(req: HttpRequest): Promise<AuthContext | null> {
    if (!this.awpPubkeyStore) {
      return null;
    }

    const pubkey =
      req.headers[AWP_AUTH_HEADERS.pubkey.toLowerCase()] ?? req.headers[AWP_AUTH_HEADERS.pubkey];
    const timestamp =
      req.headers[AWP_AUTH_HEADERS.timestamp.toLowerCase()] ??
      req.headers[AWP_AUTH_HEADERS.timestamp];
    const signature =
      req.headers[AWP_AUTH_HEADERS.signature.toLowerCase()] ??
      req.headers[AWP_AUTH_HEADERS.signature];

    if (!pubkey || !timestamp || !signature) {
      return null;
    }

    // Validate timestamp
    if (!validateTimestamp(timestamp, 300)) {
      // 5 minute max clock skew
      return null;
    }

    // Look up the pubkey
    const authorizedPubkey = await this.awpPubkeyStore.lookup(pubkey);
    if (!authorizedPubkey) {
      return null;
    }

    // Verify the signature
    // Convert HttpRequest body to string
    const body =
      typeof req.body === "string"
        ? req.body
        : req.body
          ? req.isBase64Encoded
            ? Buffer.from(req.body.toString(), "base64").toString("utf-8")
            : req.body.toString("utf-8")
          : "";

    // Build signature payload: timestamp.METHOD.path.bodyHash
    const path =
      req.path +
      (Object.keys(req.query).length > 0
        ? `?${new URLSearchParams(req.query as Record<string, string>).toString()}`
        : "");
    const bodyHash = createHash("sha256").update(body).digest("hex");
    const signaturePayload = `${timestamp}.${req.method.toUpperCase()}.${path}.${bodyHash}`;

    const isValid = await verifySignature(pubkey, signaturePayload, signature);

    if (!isValid) {
      return null;
    }

    // Build auth context for AWP client
    return this.buildAwpAuthContext(authorizedPubkey);
  }

  /**
   * Build AuthContext from authorized AWP pubkey
   */
  private buildAwpAuthContext(auth: {
    userId: string;
    pubkey: string;
    clientName: string;
  }): AuthContext {
    return {
      token: {
        pk: `awp#${auth.pubkey}`,
        type: "user", // AWP clients have user-level access
        userId: auth.userId,
        createdAt: Date.now(),
        expiresAt: Date.now() + 3600000, // 1 hour
      },
      userId: auth.userId,
      shard: `usr_${auth.userId}`,
      canRead: true,
      canWrite: true,
      canIssueTicket: true,
    };
  }

  /**
   * Authenticate using Bearer token
   */
  private async authenticateBearer(req: HttpRequest): Promise<AuthContext | null> {
    const authHeader = req.headers.authorization ?? req.headers.Authorization;
    if (!authHeader) {
      return null;
    }

    // Parse header: "Bearer xxx", "Ticket xxx", or "Agent xxx"
    const [scheme, tokenId] = authHeader.split(" ");
    if (!scheme || !tokenId) {
      return null;
    }

    const normalizedScheme = scheme.toLowerCase();
    if (
      normalizedScheme !== "bearer" &&
      normalizedScheme !== "ticket" &&
      normalizedScheme !== "agent"
    ) {
      return null;
    }

    // Get token from database
    const token = await this.tokensDb.getToken(tokenId);
    if (!token) {
      return null;
    }

    // Build auth context based on token type
    return this.buildAuthContext(token);
  }

  /**
   * Build AuthContext from token
   */
  private buildAuthContext(token: Token): AuthContext {
    switch (token.type) {
      case "user":
        return {
          token,
          userId: token.userId,
          shard: `usr_${token.userId}`,
          canRead: true,
          canWrite: true,
          canIssueTicket: true,
        };

      case "agent":
        // Agent tokens inherit all permissions from user
        return {
          token,
          userId: token.userId,
          shard: `usr_${token.userId}`,
          canRead: true,
          canWrite: true,
          canIssueTicket: true,
        };

      case "ticket":
        return {
          token,
          userId: "", // Tickets don't have direct user context
          shard: token.shard,
          canRead: true, // Tickets always have read access to scope
          canWrite: !!token.writable && !token.written, // Can write if writable and not already written
          canIssueTicket: false,
          allowedScope: token.scope,
        };
    }
  }

  /**
   * Check if auth context can access the requested shard
   */
  checkShardAccess(auth: AuthContext, requestedShard: string): boolean {
    // Resolve @me or ~ alias
    const effectiveShard = (requestedShard === "@me" || requestedShard === "~") ? auth.shard : requestedShard;

    // Check if auth shard matches requested shard
    return auth.shard === effectiveShard;
  }

  /**
   * Check if auth context can read a specific key
   * For tickets, the key must be within the allowed scope (DAG roots)
   */
  checkReadAccess(auth: AuthContext, key: string): boolean {
    if (!auth.canRead) {
      return false;
    }

    // Tickets are restricted to their scope (DAG roots)
    if (auth.allowedScope) {
      return this.isKeyInScope(key, auth.allowedScope);
    }

    return true;
  }

  /**
   * Check if a key is within the allowed scope
   * Note: This is a simplified check. Full DAG traversal would be needed
   * to verify if a key is a descendant of one of the scope roots.
   */
  private isKeyInScope(key: string, scope: string | string[]): boolean {
    const scopeArray = Array.isArray(scope) ? scope : [scope];
    // For now, check if key is one of the scope roots
    // TODO: Implement full DAG traversal check
    return scopeArray.includes(key);
  }

  /**
   * Check if auth context can write
   */
  checkWriteAccess(auth: AuthContext): boolean {
    return auth.canWrite;
  }

  /**
   * Check if ticket has writable quota available
   */
  checkWritableQuota(auth: AuthContext, size: number): boolean {
    if (!auth.canWrite) {
      return false;
    }

    if (auth.token.type !== "ticket") {
      return true; // User tokens have no quota
    }

    const ticket = auth.token;
    if (typeof ticket.writable === "object" && ticket.writable.quota) {
      return size <= ticket.writable.quota;
    }

    return true;
  }

  /**
   * Check if content type is accepted by the ticket
   */
  checkAcceptedMimeType(auth: AuthContext, contentType: string): boolean {
    if (auth.token.type !== "ticket") {
      return true; // User tokens accept all types
    }

    const ticket = auth.token;
    if (typeof ticket.writable === "object" && ticket.writable.accept) {
      return this.matchMimeType(contentType, ticket.writable.accept);
    }

    return true;
  }

  /**
   * Check if content type matches any of the accepted patterns
   */
  private matchMimeType(contentType: string, acceptPatterns: string[]): boolean {
    for (const pattern of acceptPatterns) {
      if (pattern === "*/*" || pattern === contentType) {
        return true;
      }
      // Handle wildcards like "image/*"
      if (pattern.endsWith("/*")) {
        const prefix = pattern.slice(0, -1); // "image/"
        if (contentType.startsWith(prefix)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Resolve shard alias (@me or ~ -> actual shard)
   */
  resolveShard(auth: AuthContext, requestedShard: string): string {
    return (requestedShard === "@me" || requestedShard === "~") ? auth.shard : requestedShard;
  }

  /**
   * @deprecated Use checkShardAccess instead
   */
  checkScopeAccess(auth: AuthContext, requestedScope: string): boolean {
    return this.checkShardAccess(auth, requestedScope);
  }

  /**
   * @deprecated Use resolveShard instead
   */
  resolveScope(auth: AuthContext, requestedScope: string): string {
    return this.resolveShard(auth, requestedScope);
  }
}
