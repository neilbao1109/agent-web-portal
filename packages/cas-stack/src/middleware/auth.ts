/**
 * CAS Stack - Authentication Middleware
 */

import type { AuthContext, Token, HttpRequest, CasConfig } from "../types.ts";
import { TokensDb } from "../db/tokens.ts";

export class AuthMiddleware {
  private tokensDb: TokensDb;

  constructor(config: CasConfig, tokensDb?: TokensDb) {
    this.tokensDb = tokensDb ?? new TokensDb(config);
  }

  /**
   * Parse Authorization header and validate token
   */
  async authenticate(req: HttpRequest): Promise<AuthContext | null> {
    const authHeader = req.headers.authorization ?? req.headers.Authorization;
    if (!authHeader) {
      return null;
    }

    // Parse header: "Bearer xxx" or "Ticket xxx"
    const [scheme, tokenId] = authHeader.split(" ");
    if (!scheme || !tokenId) {
      return null;
    }

    const normalizedScheme = scheme.toLowerCase();
    if (normalizedScheme !== "bearer" && normalizedScheme !== "ticket") {
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
    const tokenId = TokensDb.extractTokenId(token.pk);

    switch (token.type) {
      case "user":
        return {
          token,
          userId: token.userId,
          scope: `usr_${token.userId}`,
          canRead: true,
          canWrite: true,
          canIssueTicket: true,
        };

      case "agent":
        return {
          token,
          userId: token.userId,
          scope: `usr_${token.userId}`,
          canRead: token.permissions.read,
          canWrite: token.permissions.write,
          canIssueTicket: token.permissions.issueTicket,
        };

      case "ticket":
        return {
          token,
          userId: "", // Tickets don't have direct user context
          scope: token.scope,
          canRead: token.ticketType === "read",
          canWrite: token.ticketType === "write",
          canIssueTicket: false,
          allowedKey: token.key,
        };
    }
  }

  /**
   * Check if auth context can access the requested scope
   */
  checkScopeAccess(auth: AuthContext, requestedScope: string): boolean {
    // Resolve @me alias
    const effectiveScope =
      requestedScope === "@me" ? auth.scope : requestedScope;

    // Check if auth scope matches requested scope
    return auth.scope === effectiveScope;
  }

  /**
   * Check if auth context can read a specific key
   */
  checkReadAccess(auth: AuthContext, key: string): boolean {
    if (!auth.canRead) {
      return false;
    }

    // Read tickets may be restricted to specific keys
    if (auth.allowedKey && auth.allowedKey !== key) {
      return false;
    }

    return true;
  }

  /**
   * Check if auth context can write
   */
  checkWriteAccess(auth: AuthContext): boolean {
    return auth.canWrite;
  }

  /**
   * Resolve scope alias (@me -> actual scope)
   */
  resolveScope(auth: AuthContext, requestedScope: string): string {
    return requestedScope === "@me" ? auth.scope : requestedScope;
  }
}
