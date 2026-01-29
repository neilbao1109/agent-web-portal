/**
 * CAS Stack - HTTP Router
 */

import type { HttpRequest, HttpResponse, CasConfig, AuthContext } from "./types.ts";
import { AuthMiddleware } from "./middleware/auth.ts";
import { AuthService } from "./auth/service.ts";
import { CasStorage } from "./cas/storage.ts";
import { TokensDb, OwnershipDb, DagDb } from "./db/index.ts";
import { z } from "zod";

// ============================================================================
// Request Validation Schemas
// ============================================================================

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const RefreshSchema = z.object({
  refreshToken: z.string().min(1),
});

const CreateAgentTokenSchema = z.object({
  name: z.string().min(1),
  expiresIn: z.number().positive().optional(),
  permissions: z.object({
    read: z.boolean(),
    write: z.boolean(),
    issueTicket: z.boolean(),
  }),
});

const CreateTicketSchema = z.object({
  type: z.enum(["read", "write"]),
  key: z.string().optional(),
  expiresIn: z.number().positive().optional(),
});

const ResolveSchema = z.object({
  root: z.string(),
  nodes: z.array(z.string()),
});

// ============================================================================
// Response Helpers
// ============================================================================

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
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

function binaryResponse(
  content: Buffer,
  contentType: string,
  casKey?: string
): HttpResponse {
  return {
    statusCode: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": content.length.toString(),
      ...(casKey && { "X-CAS-Key": casKey }),
      ...CORS_HEADERS,
    },
    body: content.toString("base64"),
    isBase64Encoded: true,
  };
}

function errorResponse(status: number, error: string, details?: unknown): HttpResponse {
  return jsonResponse(status, { error, details });
}

// ============================================================================
// Router
// ============================================================================

export class Router {
  private config: CasConfig;
  private authMiddleware: AuthMiddleware;
  private authService: AuthService;
  private casStorage: CasStorage;
  private tokensDb: TokensDb;
  private ownershipDb: OwnershipDb;
  private dagDb: DagDb;

  constructor(config: CasConfig) {
    this.config = config;
    this.tokensDb = new TokensDb(config);
    this.ownershipDb = new OwnershipDb(config);
    this.dagDb = new DagDb(config);
    this.authMiddleware = new AuthMiddleware(config, this.tokensDb);
    this.authService = new AuthService(config, this.tokensDb);
    this.casStorage = new CasStorage(config);
  }

  /**
   * Route request to appropriate handler
   */
  async handle(req: HttpRequest): Promise<HttpResponse> {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
      return {
        statusCode: 204,
        headers: CORS_HEADERS,
      };
    }

    try {
      // Auth routes (no auth required for some)
      if (req.path.startsWith("/auth/")) {
        return this.handleAuth(req);
      }

      // CAS routes (auth required)
      if (req.path.startsWith("/cas/")) {
        return this.handleCas(req);
      }

      // Health check
      if (req.path === "/" || req.path === "/health") {
        return jsonResponse(200, { status: "ok", service: "cas-stack" });
      }

      return errorResponse(404, "Not found");
    } catch (error: any) {
      console.error("Router error:", error);
      return errorResponse(500, error.message ?? "Internal server error");
    }
  }

  // ============================================================================
  // Auth Routes
  // ============================================================================

  private async handleAuth(req: HttpRequest): Promise<HttpResponse> {
    const path = req.path.replace("/auth", "");

    // POST /auth/login
    if (req.method === "POST" && path === "/login") {
      const body = this.parseJson(req);
      const parsed = LoginSchema.safeParse(body);
      if (!parsed.success) {
        return errorResponse(400, "Invalid request", parsed.error.issues);
      }

      try {
        const result = await this.authService.login(parsed.data);
        return jsonResponse(200, result);
      } catch (error: any) {
        return errorResponse(401, error.message ?? "Authentication failed");
      }
    }

    // POST /auth/refresh
    if (req.method === "POST" && path === "/refresh") {
      const body = this.parseJson(req);
      const parsed = RefreshSchema.safeParse(body);
      if (!parsed.success) {
        return errorResponse(400, "Invalid request", parsed.error.issues);
      }

      try {
        const result = await this.authService.refresh(parsed.data);
        return jsonResponse(200, result);
      } catch (error: any) {
        return errorResponse(401, error.message ?? "Token refresh failed");
      }
    }

    // Routes requiring auth
    const auth = await this.authMiddleware.authenticate(req);
    if (!auth) {
      return errorResponse(401, "Unauthorized");
    }

    // POST /auth/agent-token
    if (req.method === "POST" && path === "/agent-token") {
      const body = this.parseJson(req);
      const parsed = CreateAgentTokenSchema.safeParse(body);
      if (!parsed.success) {
        return errorResponse(400, "Invalid request", parsed.error.issues);
      }

      const result = await this.authService.createAgentToken(auth, parsed.data);
      return jsonResponse(201, result);
    }

    // GET /auth/agent-tokens
    if (req.method === "GET" && path === "/agent-tokens") {
      const result = await this.authService.listAgentTokens(auth);
      return jsonResponse(200, { tokens: result });
    }

    // DELETE /auth/agent-token/:id
    const agentTokenMatch = path.match(/^\/agent-token\/([^\/]+)$/);
    if (req.method === "DELETE" && agentTokenMatch) {
      const tokenId = agentTokenMatch[1]!;
      try {
        await this.authService.revokeAgentToken(auth, tokenId);
        return jsonResponse(200, { success: true });
      } catch (error: any) {
        return errorResponse(404, error.message ?? "Token not found");
      }
    }

    // POST /auth/ticket
    if (req.method === "POST" && path === "/ticket") {
      const body = this.parseJson(req);
      const parsed = CreateTicketSchema.safeParse(body);
      if (!parsed.success) {
        return errorResponse(400, "Invalid request", parsed.error.issues);
      }

      try {
        const result = await this.authService.createTicket(auth, parsed.data);
        return jsonResponse(201, result);
      } catch (error: any) {
        return errorResponse(403, error.message ?? "Cannot create ticket");
      }
    }

    // DELETE /auth/ticket/:id
    const ticketMatch = path.match(/^\/ticket\/([^\/]+)$/);
    if (req.method === "DELETE" && ticketMatch) {
      const ticketId = ticketMatch[1]!;
      try {
        await this.authService.revokeTicket(auth, ticketId);
        return jsonResponse(200, { success: true });
      } catch (error: any) {
        return errorResponse(404, error.message ?? "Ticket not found");
      }
    }

    return errorResponse(404, "Auth endpoint not found");
  }

  // ============================================================================
  // CAS Routes
  // ============================================================================

  private async handleCas(req: HttpRequest): Promise<HttpResponse> {
    // Parse path: /cas/{scope}/...
    const casMatch = req.path.match(/^\/cas\/([^\/]+)(.*)$/);
    if (!casMatch) {
      return errorResponse(404, "Invalid CAS path");
    }

    const requestedScope = casMatch[1]!;
    const subPath = casMatch[2] ?? "";

    // Authenticate
    const auth = await this.authMiddleware.authenticate(req);
    if (!auth) {
      return errorResponse(401, "Unauthorized");
    }

    // Check scope access
    if (!this.authMiddleware.checkScopeAccess(auth, requestedScope)) {
      return errorResponse(403, "Access denied to this scope");
    }

    const scope = this.authMiddleware.resolveScope(auth, requestedScope);

    // POST /cas/{scope}/resolve
    if (req.method === "POST" && subPath === "/resolve") {
      return this.handleResolve(auth, scope, req);
    }

    // PUT /cas/{scope}/node/:key
    const putNodeMatch = subPath.match(/^\/node\/(.+)$/);
    if (req.method === "PUT" && putNodeMatch) {
      const key = decodeURIComponent(putNodeMatch[1]!);
      return this.handlePutNode(auth, scope, key, req);
    }

    // GET /cas/{scope}/node/:key
    const getNodeMatch = subPath.match(/^\/node\/(.+)$/);
    if (req.method === "GET" && getNodeMatch) {
      const key = decodeURIComponent(getNodeMatch[1]!);
      return this.handleGetNode(auth, scope, key);
    }

    // GET /cas/{scope}/dag/:key
    const getDagMatch = subPath.match(/^\/dag\/(.+)$/);
    if (req.method === "GET" && getDagMatch) {
      const key = decodeURIComponent(getDagMatch[1]!);
      return this.handleGetDag(auth, scope, key);
    }

    // POST /cas/{scope}/dag (multipart upload)
    if (req.method === "POST" && subPath === "/dag") {
      return this.handlePostDag(auth, scope, req);
    }

    return errorResponse(404, "CAS endpoint not found");
  }

  /**
   * POST /cas/{scope}/resolve
   */
  private async handleResolve(
    auth: AuthContext,
    scope: string,
    req: HttpRequest
  ): Promise<HttpResponse> {
    const body = this.parseJson(req);
    const parsed = ResolveSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(400, "Invalid request", parsed.error.issues);
    }

    const { nodes } = parsed.data;

    // Check which nodes exist in this scope
    const { missing } = await this.ownershipDb.checkOwnership(scope, nodes);

    return jsonResponse(200, { missing });
  }

  /**
   * PUT /cas/{scope}/node/:key
   */
  private async handlePutNode(
    auth: AuthContext,
    scope: string,
    key: string,
    req: HttpRequest
  ): Promise<HttpResponse> {
    if (!this.authMiddleware.checkWriteAccess(auth)) {
      return errorResponse(403, "Write access denied");
    }

    // Get binary content
    const content = this.getBinaryBody(req);
    if (!content || content.length === 0) {
      return errorResponse(400, "Empty body");
    }

    const contentType =
      req.headers["content-type"] ??
      req.headers["Content-Type"] ??
      "application/octet-stream";

    // Store with hash validation
    const result = await this.casStorage.putWithKey(key, content, contentType);

    if ("error" in result) {
      return errorResponse(400, "Hash mismatch", {
        expected: result.expected,
        actual: result.actual,
      });
    }

    // Add ownership record
    const tokenId = TokensDb.extractTokenId(auth.token.pk);
    await this.ownershipDb.addOwnership(
      scope,
      result.key,
      tokenId,
      contentType,
      result.size
    );

    return jsonResponse(200, {
      key: result.key,
      size: result.size,
      contentType,
    });
  }

  /**
   * GET /cas/{scope}/node/:key
   */
  private async handleGetNode(
    auth: AuthContext,
    scope: string,
    key: string
  ): Promise<HttpResponse> {
    if (!this.authMiddleware.checkReadAccess(auth, key)) {
      return errorResponse(403, "Read access denied");
    }

    // Check ownership
    const hasAccess = await this.ownershipDb.hasOwnership(scope, key);
    if (!hasAccess) {
      return errorResponse(404, "Not found");
    }

    // Get content from S3
    const result = await this.casStorage.get(key);
    if (!result) {
      return errorResponse(404, "Content not found in storage");
    }

    return binaryResponse(result.content, result.contentType, key);
  }

  /**
   * GET /cas/{scope}/dag/:key
   */
  private async handleGetDag(
    auth: AuthContext,
    scope: string,
    key: string
  ): Promise<HttpResponse> {
    if (!this.authMiddleware.checkReadAccess(auth, key)) {
      return errorResponse(403, "Read access denied");
    }

    // Check ownership of root
    const hasAccess = await this.ownershipDb.hasOwnership(scope, key);
    if (!hasAccess) {
      return errorResponse(404, "Not found");
    }

    // Collect all DAG nodes
    const dagKeys = await this.dagDb.collectDagKeys(key);

    // For now, return a simple JSON manifest
    // TODO: Implement tar streaming
    const nodes: Record<string, { size: number; contentType: string; children: string[] }> = {};

    for (const nodeKey of dagKeys) {
      const meta = await this.dagDb.getNode(nodeKey);
      if (meta) {
        nodes[nodeKey] = {
          size: meta.size,
          contentType: meta.contentType,
          children: meta.children,
        };
      }
    }

    return jsonResponse(200, {
      root: key,
      nodes,
    });
  }

  /**
   * POST /cas/{scope}/dag (multipart upload)
   */
  private async handlePostDag(
    auth: AuthContext,
    scope: string,
    req: HttpRequest
  ): Promise<HttpResponse> {
    if (!this.authMiddleware.checkWriteAccess(auth)) {
      return errorResponse(403, "Write access denied");
    }

    // TODO: Implement multipart parsing with busboy
    // For now, return not implemented
    return errorResponse(501, "Multipart DAG upload not yet implemented");
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private parseJson(req: HttpRequest): unknown {
    if (!req.body) return {};

    const bodyStr =
      typeof req.body === "string"
        ? req.body
        : req.isBase64Encoded
          ? Buffer.from(req.body.toString(), "base64").toString("utf-8")
          : req.body.toString("utf-8");

    try {
      return JSON.parse(bodyStr);
    } catch {
      return {};
    }
  }

  private getBinaryBody(req: HttpRequest): Buffer {
    if (!req.body) return Buffer.alloc(0);

    if (Buffer.isBuffer(req.body)) {
      return req.isBase64Encoded
        ? Buffer.from(req.body.toString(), "base64")
        : req.body;
    }

    if (typeof req.body === "string") {
      return req.isBase64Encoded
        ? Buffer.from(req.body, "base64")
        : Buffer.from(req.body, "utf-8");
    }

    return Buffer.alloc(0);
  }
}
