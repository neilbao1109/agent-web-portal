/**
 * CAS Stack - Authentication Middleware
 *
 * Supports three authentication methods:
 * 1. Bearer Token (Agent Token / Ticket) - Token stored in database
 * 2. Bearer JWT (Cognito Access Token) - JWT from Cognito User Pool
 * 3. AWP Signed Requests - ECDSA P-256 signature-based auth for AI agents
 */

import { createHash } from "node:crypto";
import type { PubkeyStore } from "@agent-web-portal/auth";
import { AWP_AUTH_HEADERS, validateTimestamp, verifySignature } from "@agent-web-portal/auth";
import { TokensDb } from "../db/tokens.ts";
import type { AuthContext, CasConfig, HttpRequest, Token } from "../types.ts";

export class AuthMiddleware {
  private config: CasConfig;
  private tokensDb: TokensDb;
  private awpPubkeyStore: PubkeyStore | null;

  constructor(config: CasConfig, tokensDb?: TokensDb, awpPubkeyStore?: PubkeyStore) {
    this.config = config;
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
      realm: `usr_${auth.userId}`,
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
    const [scheme, tokenValue] = authHeader.split(" ");
    if (!scheme || !tokenValue) {
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

    // Check if it looks like a JWT (has 3 parts separated by dots)
    if (normalizedScheme === "bearer" && tokenValue.split(".").length === 3) {
      return this.authenticateJwt(tokenValue);
    }

    // Get token from database
    const token = await this.tokensDb.getToken(tokenValue);
    if (!token) {
      return null;
    }

    // Build auth context based on token type
    return this.buildAuthContext(token);
  }

  /**
   * Authenticate using Cognito JWT token
   */
  private async authenticateJwt(jwt: string): Promise<AuthContext | null> {
    try {
      // Decode JWT payload (base64url encoded)
      const parts = jwt.split(".");
      if (parts.length !== 3) {
        return null;
      }

      const payloadBase64 = parts[1]!;
      // Convert base64url to base64
      const base64 = payloadBase64.replace(/-/g, "+").replace(/_/g, "/");
      const payload = JSON.parse(Buffer.from(base64, "base64").toString("utf-8"));

      // Validate token issuer
      const expectedIssuer = `https://cognito-idp.${this.config.cognitoRegion}.amazonaws.com/${this.config.cognitoUserPoolId}`;
      if (payload.iss !== expectedIssuer) {
        console.error("[Auth] JWT issuer mismatch:", payload.iss, "expected:", expectedIssuer);
        return null;
      }

      // Validate token is not expired
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp < now) {
        console.error("[Auth] JWT expired");
        return null;
      }

      // Validate token type (access token)
      if (payload.token_use !== "access") {
        console.error("[Auth] JWT is not an access token:", payload.token_use);
        return null;
      }

      // Get user ID from sub claim
      const userId = payload.sub;
      if (!userId) {
        console.error("[Auth] JWT missing sub claim");
        return null;
      }

      // Build auth context for Cognito user
      return {
        token: {
          pk: `jwt#${userId}`,
          type: "user",
          userId,
          createdAt: (payload.iat || now) * 1000,
          expiresAt: (payload.exp || now + 3600) * 1000,
        },
        userId,
        realm: `usr_${userId}`,
        canRead: true,
        canWrite: true,
        canIssueTicket: true,
      };
    } catch (error) {
      console.error("[Auth] JWT decode error:", error);
      return null;
    }
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
          realm: `usr_${token.userId}`,
          canRead: true,
          canWrite: true,
          canIssueTicket: true,
        };

      case "agent":
        // Agent tokens inherit all permissions from user
        return {
          token,
          userId: token.userId,
          realm: `usr_${token.userId}`,
          canRead: true,
          canWrite: true,
          canIssueTicket: true,
        };

      case "ticket":
        return {
          token,
          userId: "", // Tickets don't have direct user context
          realm: token.realm,
          canRead: true, // Tickets always have read access to scope
          canWrite: !!token.writable && !token.written, // Can write if writable and not already written
          canIssueTicket: false,
          allowedScope: token.scope,
        };
    }
  }

  /**
   * Check if auth context can access the requested realm
   */
  checkRealmAccess(auth: AuthContext, requestedRealm: string): boolean {
    // Resolve @me or ~ alias
    const effectiveRealm =
      requestedRealm === "@me" || requestedRealm === "~" ? auth.realm : requestedRealm;

    // Check if auth realm matches requested realm
    return auth.realm === effectiveRealm;
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
   * Resolve realm alias (@me or ~ -> actual realm)
   */
  resolveRealm(auth: AuthContext, requestedRealm: string): string {
    return requestedRealm === "@me" || requestedRealm === "~" ? auth.realm : requestedRealm;
  }

  /**
   * @deprecated Use checkRealmAccess instead
   */
  checkScopeAccess(auth: AuthContext, requestedScope: string): boolean {
    return this.checkRealmAccess(auth, requestedScope);
  }

  /**
   * @deprecated Use resolveRealm instead
   */
  resolveScope(auth: AuthContext, requestedScope: string): string {
    return this.resolveRealm(auth, requestedScope);
  }
}
