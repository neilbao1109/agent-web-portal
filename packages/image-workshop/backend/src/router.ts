/**
 * Image Workshop Stack - HTTP Router
 *
 * Handles authentication and AWP authorization routes.
 * MCP/tool routes are handled by awp-server-lambda.
 */

import { generateVerificationCode } from "@agent-web-portal/auth";
import { z } from "zod";
import { AwpPendingAuthStore } from "./db/awp-pending-store.ts";
import { AwpPubkeyStore } from "./db/awp-pubkey-store.ts";
import type { AuthContext, Config, HttpRequest, HttpResponse } from "./types.ts";

// ============================================================================
// Request Validation Schemas
// ============================================================================

const AwpAuthInitSchema = z.object({
  pubkey: z.string().min(1),
  client_name: z.string().min(1),
});

const AwpAuthCompleteSchema = z.object({
  pubkey: z.string().min(1),
  verification_code: z.string().min(1),
});

// ============================================================================
// Response Helpers
// ============================================================================

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "Content-Type,Authorization,X-AWP-Pubkey,X-AWP-Timestamp,X-AWP-Signature",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
};

function jsonResponse(status: number, body: unknown): HttpResponse {
  return {
    statusCode: status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
    body: JSON.stringify(body),
  };
}

function errorResponse(status: number, error: string, details?: unknown): HttpResponse {
  return jsonResponse(status, { error, details });
}

// ============================================================================
// Router
// ============================================================================

export class AuthRouter {
  private config: Config;
  private awpPendingStore: AwpPendingAuthStore;
  private awpPubkeyStore: AwpPubkeyStore;

  constructor(config: Config) {
    this.config = config;
    this.awpPendingStore = new AwpPendingAuthStore(config);
    this.awpPubkeyStore = new AwpPubkeyStore(config);
  }

  /**
   * Route request to appropriate handler
   */
  async handle(req: HttpRequest): Promise<HttpResponse | null> {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
      return {
        statusCode: 204,
        headers: CORS_HEADERS,
      };
    }

    // Health check (root level)
    if (req.path === "/" || req.path === "/health") {
      return jsonResponse(200, { status: "ok", service: "image-workshop-stack" });
    }

    // All API routes under /api prefix
    if (!req.path.startsWith("/api/")) {
      return null; // Not an API route, pass to next handler
    }

    // Strip /api prefix for internal routing
    const apiPath = req.path.slice(4);

    // Auth routes
    if (apiPath.startsWith("/auth/")) {
      return this.handleAuth({ ...req, path: apiPath });
    }

    return null; // Not handled by this router
  }

  // ============================================================================
  // Auth Routes
  // ============================================================================

  private async handleAuth(req: HttpRequest): Promise<HttpResponse> {
    const path = req.path.replace("/auth", "");

    // GET /auth/config - Public Cognito config for frontend (no auth)
    if (req.method === "GET" && path === "/config") {
      const { cognitoUserPoolId, cognitoClientId, cognitoHostedUiUrl } = this.config;
      return jsonResponse(200, {
        cognitoUserPoolId: cognitoUserPoolId ?? "",
        cognitoClientId: cognitoClientId ?? "",
        cognitoHostedUiUrl: cognitoHostedUiUrl ?? "",
      });
    }

    // POST /auth/oauth/token - Exchange authorization code for tokens
    if (req.method === "POST" && path === "/oauth/token") {
      const { cognitoHostedUiUrl, cognitoClientId } = this.config;
      if (!cognitoHostedUiUrl || !cognitoClientId) {
        return errorResponse(503, "OAuth not configured (missing Hosted UI URL or Client ID)");
      }
      const body = this.parseJson(req) as { code?: string; redirect_uri?: string };
      if (!body?.code || !body?.redirect_uri) {
        return errorResponse(400, "Missing code or redirect_uri");
      }
      const tokenBody = new URLSearchParams({
        grant_type: "authorization_code",
        client_id: cognitoClientId,
        code: body.code,
        redirect_uri: body.redirect_uri,
      });
      const tokenRes = await fetch(`${cognitoHostedUiUrl}/oauth2/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: tokenBody.toString(),
      });
      const text = await tokenRes.text();
      if (!tokenRes.ok) {
        console.error("[OAuth] Token exchange failed:", tokenRes.status, text);
        return jsonResponse(tokenRes.status, { error: "Token exchange failed", details: text });
      }
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        return errorResponse(502, "Invalid token response from Cognito");
      }
      return jsonResponse(200, data);
    }

    // ========================================================================
    // AWP Auth Routes (agent-tokens namespace)
    // ========================================================================

    // POST /auth/agent-tokens/init - Start AWP auth flow
    if (req.method === "POST" && path === "/agent-tokens/init") {
      const body = this.parseJson(req);
      const parsed = AwpAuthInitSchema.safeParse(body);
      if (!parsed.success) {
        return errorResponse(400, "Invalid request", parsed.error.issues);
      }

      try {
        const verificationCode = generateVerificationCode();
        const now = Date.now();
        const expiresIn = 600; // 10 minutes

        await this.awpPendingStore.create({
          pubkey: parsed.data.pubkey,
          clientName: parsed.data.client_name,
          verificationCode,
          createdAt: now,
          expiresAt: now + expiresIn * 1000,
        });

        // Build auth URL (points to webui)
        const baseUrl = req.headers.origin ?? req.headers.Origin ?? "";
        const authUrl = `${baseUrl}/auth/awp?pubkey=${encodeURIComponent(parsed.data.pubkey)}`;

        return jsonResponse(200, {
          auth_url: authUrl,
          verification_code: verificationCode,
          expires_in: expiresIn,
          poll_interval: 5,
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to initiate auth";
        return errorResponse(500, message);
      }
    }

    // GET /auth/agent-tokens/status - Poll for auth completion
    if (req.method === "GET" && path === "/agent-tokens/status") {
      const pubkey = req.query.pubkey;
      if (!pubkey) {
        return errorResponse(400, "Missing pubkey parameter");
      }

      const authorized = await this.awpPubkeyStore.lookup(pubkey);
      if (authorized) {
        return jsonResponse(200, {
          authorized: true,
          expires_at: authorized.expiresAt,
        });
      }

      // Check if pending auth exists
      const pending = await this.awpPendingStore.get(pubkey);
      if (!pending) {
        return jsonResponse(200, {
          authorized: false,
          error: "No pending authorization found",
        });
      }

      return jsonResponse(200, {
        authorized: false,
      });
    }

    // POST /auth/agent-tokens/complete - Complete authorization (requires user auth)
    if (req.method === "POST" && path === "/agent-tokens/complete") {
      // This endpoint requires user authentication
      const auth = await this.authenticate(req);
      if (!auth) {
        return errorResponse(401, "User authentication required");
      }

      const body = this.parseJson(req);
      const parsed = AwpAuthCompleteSchema.safeParse(body);
      if (!parsed.success) {
        return errorResponse(400, "Invalid request", parsed.error.issues);
      }

      // Validate verification code
      const isValid = await this.awpPendingStore.validateCode(
        parsed.data.pubkey,
        parsed.data.verification_code
      );
      if (!isValid) {
        return errorResponse(400, "Invalid or expired verification code");
      }

      // Get pending auth to retrieve client name
      const pending = await this.awpPendingStore.get(parsed.data.pubkey);
      if (!pending) {
        return errorResponse(400, "Pending authorization not found");
      }

      // Store authorized pubkey
      const now = Date.now();
      const expiresAt = now + 30 * 24 * 60 * 60 * 1000; // 30 days

      await this.awpPubkeyStore.store({
        pubkey: parsed.data.pubkey,
        userId: auth.userId,
        clientName: pending.clientName,
        createdAt: now,
        expiresAt,
      });

      // Clean up pending auth
      await this.awpPendingStore.delete(parsed.data.pubkey);

      return jsonResponse(200, {
        success: true,
        expires_at: expiresAt,
      });
    }

    // Routes requiring auth
    const auth = await this.authenticate(req);
    if (!auth) {
      return errorResponse(401, "Unauthorized");
    }

    // GET /auth/me - Current user info
    if (req.method === "GET" && path === "/me") {
      return jsonResponse(200, {
        userId: auth.userId,
        realm: auth.realm,
      });
    }

    // GET /auth/agent-tokens/clients - List authorized AWP clients
    if (req.method === "GET" && path === "/agent-tokens/clients") {
      const clients = await this.awpPubkeyStore.listByUser(auth.userId);
      return jsonResponse(200, {
        clients: clients.map((c) => ({
          pubkey: c.pubkey,
          clientName: c.clientName,
          createdAt: new Date(c.createdAt).toISOString(),
          expiresAt: c.expiresAt ? new Date(c.expiresAt).toISOString() : null,
        })),
      });
    }

    // DELETE /auth/agent-tokens/clients/:pubkey - Revoke AWP client
    const clientRevokeMatch = path.match(/^\/agent-tokens\/clients\/(.+)$/);
    if (req.method === "DELETE" && clientRevokeMatch) {
      const pubkey = decodeURIComponent(clientRevokeMatch[1]!);

      // Verify ownership
      const client = await this.awpPubkeyStore.lookup(pubkey);
      if (!client || client.userId !== auth.userId) {
        return errorResponse(404, "Client not found or access denied");
      }

      await this.awpPubkeyStore.revoke(pubkey);
      return jsonResponse(200, { success: true });
    }

    return errorResponse(404, "Auth endpoint not found");
  }

  // ============================================================================
  // Authentication
  // ============================================================================

  private async authenticate(req: HttpRequest): Promise<AuthContext | null> {
    const authHeader = req.headers.authorization ?? req.headers.Authorization;
    if (!authHeader) {
      return null;
    }

    // Bearer token (Cognito JWT)
    if (authHeader.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      return this.verifyBearerToken(token);
    }

    return null;
  }

  private async verifyBearerToken(token: string): Promise<AuthContext | null> {
    const { cognitoUserPoolId, cognitoRegion } = this.config;
    if (!cognitoUserPoolId || !cognitoRegion) {
      return null;
    }

    try {
      // Decode JWT payload (base64url encoded)
      const parts = token.split(".");
      if (parts.length !== 3) {
        return null;
      }

      const payloadBase64 = parts[1]!;
      // Convert base64url to base64
      const base64 = payloadBase64.replace(/-/g, "+").replace(/_/g, "/");
      const payload = JSON.parse(Buffer.from(base64, "base64").toString("utf-8"));

      // Validate token issuer
      const expectedIssuer = `https://cognito-idp.${cognitoRegion}.amazonaws.com/${cognitoUserPoolId}`;
      if (payload.iss !== expectedIssuer) {
        return null;
      }

      // Validate token is not expired
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp < now) {
        return null;
      }

      // Validate token type (access token)
      if (payload.token_use !== "access") {
        return null;
      }

      // Get user ID from sub claim
      const userId = payload.sub;
      if (!userId) {
        return null;
      }

      return {
        userId,
        realm: `usr_${userId}`,
      };
    } catch {
      return null;
    }
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private parseJson(req: HttpRequest): unknown {
    if (!req.body) return {};

    const bodyStr = typeof req.body === "string" ? req.body : req.body.toString("utf-8");

    try {
      return JSON.parse(bodyStr);
    } catch {
      return {};
    }
  }
}

/**
 * Create auth route handler for use with awp-server-lambda
 */
export function createAuthRoutes(config: Config) {
  const router = new AuthRouter(config);

  return async (
    request: Request,
    _event: unknown
  ): Promise<Response | null> => {
    const url = new URL(request.url);
    
    // Extract headers
    const headers: Record<string, string | undefined> = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });

    // Read body if present
    let body: string | undefined;
    if (request.method !== "GET" && request.method !== "HEAD") {
      body = await request.text();
    }

    const httpReq: HttpRequest = {
      method: request.method,
      path: url.pathname,
      headers,
      query: parseQueryString(url.pathname + url.search),
      body,
    };

    const response = await router.handle(httpReq);
    if (!response) {
      return null;
    }

    return new Response(response.body ?? "", {
      status: response.statusCode,
      headers: response.headers,
    });
  };
}

function parseQueryString(path: string): Record<string, string | undefined> {
  const queryIndex = path.indexOf("?");
  if (queryIndex === -1) {
    return {};
  }

  const query: Record<string, string | undefined> = {};
  const params = new URLSearchParams(path.slice(queryIndex + 1));
  for (const [key, value] of params) {
    query[key] = value;
  }
  return query;
}
