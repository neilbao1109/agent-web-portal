/**
 * CAS Stack - HTTP Router
 */

import { generateVerificationCode } from "@agent-web-portal/auth";
import { z } from "zod";
import { AuthService } from "./auth/service.ts";
import { CasStorage } from "./cas/storage.ts";
import { AwpPendingAuthStore, AwpPubkeyStore, OwnershipDb, TokensDb } from "./db/index.ts";
import { McpHandler } from "./mcp/handler.ts";
import { AuthMiddleware } from "./middleware/auth.ts";
import type {
  AuthContext,
  CasConfig,
  CasConfigResponse,
  HttpRequest,
  HttpResponse,
} from "./types.ts";
import { loadServerConfig } from "./types.ts";

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

const AwpAuthInitSchema = z.object({
  pubkey: z.string().min(1),
  client_name: z.string().min(1),
});

const AwpAuthCompleteSchema = z.object({
  pubkey: z.string().min(1),
  verification_code: z.string().min(1),
});

// New CreateTicketSchema with updated structure
const CreateTicketSchema = z.object({
  scope: z.union([z.string(), z.array(z.string())]),
  writable: z
    .union([
      z.boolean(),
      z.object({
        quota: z.number().positive().optional(),
        accept: z.array(z.string()).optional(),
      }),
    ])
    .optional(),
  expiresIn: z.number().positive().optional(),
});

const ResolveSchema = z.object({
  root: z.string(),
  nodes: z.array(z.string()),
});

// New schemas for CAS node operations
const PutFileSchema = z.object({
  chunks: z.array(z.string()),
  contentType: z.string(),
});

const PutCollectionSchema = z.object({
  children: z.record(z.string()),
});

// Agent Token schema
const CreateAgentTokenSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  expiresIn: z.number().positive().optional(),
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

function binaryResponse(content: Buffer, contentType: string, casKey?: string): HttpResponse {
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
  private awpPendingStore: AwpPendingAuthStore;
  private awpPubkeyStore: AwpPubkeyStore;
  private mcpHandler: McpHandler;

  constructor(config: CasConfig) {
    this.config = config;
    this.tokensDb = new TokensDb(config);
    this.ownershipDb = new OwnershipDb(config);
    this.awpPendingStore = new AwpPendingAuthStore(config);
    this.awpPubkeyStore = new AwpPubkeyStore(config);
    this.authMiddleware = new AuthMiddleware(config, this.tokensDb, this.awpPubkeyStore);
    this.authService = new AuthService(config, this.tokensDb);
    this.casStorage = new CasStorage(config);
    this.mcpHandler = new McpHandler(config, loadServerConfig());
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
      // Health check (root level)
      if (req.path === "/" || req.path === "/health") {
        return jsonResponse(200, { status: "ok", service: "cas-stack" });
      }

      // All API routes under /api prefix
      if (!req.path.startsWith("/api/")) {
        return errorResponse(404, "Not found");
      }

      // Strip /api prefix for internal routing
      const apiPath = req.path.slice(4); // Remove "/api"

      // Config endpoint (no auth required)
      if (apiPath === "/cas/config" && req.method === "GET") {
        return this.handleGetConfig();
      }

      // Auth routes (no auth required for some)
      if (apiPath.startsWith("/auth/")) {
        return this.handleAuth({ ...req, path: apiPath });
      }

      // MCP endpoint (requires Agent Token auth)
      if (apiPath === "/mcp" && req.method === "POST") {
        return this.handleMcp({ ...req, path: apiPath });
      }

      // CAS routes (auth required)
      if (apiPath.startsWith("/cas/")) {
        return this.handleCas({ ...req, path: apiPath });
      }

      return errorResponse(404, "Not found");
    } catch (error: any) {
      console.error("Router error:", error);
      return errorResponse(500, error.message ?? "Internal server error");
    }
  }

  // ============================================================================
  // MCP Route
  // ============================================================================

  private async handleMcp(req: HttpRequest): Promise<HttpResponse> {
    // Authenticate - prefer Agent Token but allow User Token too
    const auth = await this.authMiddleware.authenticate(req);
    if (!auth) {
      return errorResponse(401, "Authentication required. Use Agent Token or User Token.");
    }

    // Must have ticket issuing capability
    if (!auth.canIssueTicket) {
      return errorResponse(403, "Agent or User token required for MCP access");
    }

    return this.mcpHandler.handle(req, auth);
  }

  // ============================================================================
  // Config Route
  // ============================================================================

  private handleGetConfig(): HttpResponse {
    const serverConfig = loadServerConfig();
    const response: CasConfigResponse = {
      chunkThreshold: serverConfig.chunkThreshold,
      maxCollectionChildren: serverConfig.maxCollectionChildren,
      maxPayloadSize: serverConfig.maxPayloadSize,
    };
    return jsonResponse(200, response);
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

        // Build auth URL (points to cas-webui)
        const baseUrl = req.headers.origin ?? req.headers.Origin ?? "";
        const authUrl = `${baseUrl}/auth/awp?pubkey=${encodeURIComponent(parsed.data.pubkey)}`;

        return jsonResponse(200, {
          auth_url: authUrl,
          verification_code: verificationCode,
          expires_in: expiresIn,
          poll_interval: 5,
        });
      } catch (error: any) {
        return errorResponse(500, error.message ?? "Failed to initiate auth");
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
      const auth = await this.authMiddleware.authenticate(req);
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
    const auth = await this.authMiddleware.authenticate(req);
    if (!auth) {
      return errorResponse(401, "Unauthorized");
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

    // POST /auth/ticket
    if (req.method === "POST" && path === "/ticket") {
      const body = this.parseJson(req);
      const parsed = CreateTicketSchema.safeParse(body);
      if (!parsed.success) {
        return errorResponse(400, "Invalid request", parsed.error.issues);
      }

      try {
        const serverConfig = loadServerConfig();
        const ticket = await this.tokensDb.createTicket(
          auth.realm,
          TokensDb.extractTokenId(auth.token.pk),
          parsed.data.scope,
          serverConfig,
          {
            writable: parsed.data.writable,
            expiresIn: parsed.data.expiresIn,
          }
        );

        const ticketId = TokensDb.extractTokenId(ticket.pk);
        // Build endpoint URL for #cas-endpoint
        const endpoint = `${serverConfig.baseUrl}/api/cas/${ticket.realm}/ticket/${ticketId}`;

        return jsonResponse(201, {
          id: ticketId,
          endpoint,
          expiresAt: new Date(ticket.expiresAt).toISOString(),
          realm: ticket.realm,
          scope: ticket.scope,
          writable: ticket.writable ?? false,
          config: ticket.config,
        });
      } catch (error: any) {
        return errorResponse(403, error.message ?? "Cannot create ticket");
      }
    }

    // DELETE /auth/ticket/:id
    const ticketMatch = path.match(/^\/ticket\/([^/]+)$/);
    if (req.method === "DELETE" && ticketMatch) {
      const ticketId = ticketMatch[1]!;
      try {
        await this.authService.revokeTicket(auth, ticketId);
        return jsonResponse(200, { success: true });
      } catch (error: any) {
        return errorResponse(404, error.message ?? "Ticket not found");
      }
    }

    // ========================================================================
    // Agent Token Management Routes
    // ========================================================================

    // POST /auth/tokens - Create agent token
    if (req.method === "POST" && path === "/tokens") {
      const body = this.parseJson(req);
      console.log("[CAS] Create agent token - body:", JSON.stringify(body));
      const parsed = CreateAgentTokenSchema.safeParse(body);
      if (!parsed.success) {
        console.log("[CAS] Validation failed:", JSON.stringify(parsed.error.issues));
        return errorResponse(400, "Invalid request", parsed.error.issues);
      }

      try {
        const serverConfig = loadServerConfig();
        const token = await this.tokensDb.createAgentToken(
          auth.userId,
          parsed.data.name,
          serverConfig,
          {
            description: parsed.data.description,
            expiresIn: parsed.data.expiresIn,
          }
        );

        const tokenId = TokensDb.extractTokenId(token.pk);
        return jsonResponse(201, {
          id: tokenId,
          name: token.name,
          description: token.description,
          expiresAt: new Date(token.expiresAt).toISOString(),
          createdAt: new Date(token.createdAt).toISOString(),
        });
      } catch (error: any) {
        return errorResponse(403, error.message ?? "Cannot create agent token");
      }
    }

    // GET /auth/tokens - List agent tokens
    if (req.method === "GET" && path === "/tokens") {
      const tokens = await this.tokensDb.listAgentTokensByUser(auth.userId);
      return jsonResponse(200, {
        tokens: tokens.map((t) => ({
          id: TokensDb.extractTokenId(t.pk),
          name: t.name,
          description: t.description,
          expiresAt: new Date(t.expiresAt).toISOString(),
          createdAt: new Date(t.createdAt).toISOString(),
        })),
      });
    }

    // DELETE /auth/tokens/:id - Revoke agent token
    const agentTokenMatch = path.match(/^\/tokens\/([^/]+)$/);
    if (req.method === "DELETE" && agentTokenMatch) {
      const tokenId = agentTokenMatch[1]!;
      try {
        await this.tokensDb.revokeAgentToken(auth.userId, tokenId);
        return jsonResponse(200, { success: true });
      } catch (error: any) {
        return errorResponse(404, error.message ?? "Agent token not found");
      }
    }

    return errorResponse(404, "Auth endpoint not found");
  }

  // ============================================================================
  // CAS Routes
  // ============================================================================

  private async handleCas(req: HttpRequest): Promise<HttpResponse> {
    // Parse path: /cas/{realm}/...
    const casMatch = req.path.match(/^\/cas\/([^/]+)(.*)$/);
    if (!casMatch) {
      return errorResponse(404, "Invalid CAS path");
    }

    const requestedRealm = casMatch[1]!;
    const subPath = casMatch[2] ?? "";

    // Authenticate
    const auth = await this.authMiddleware.authenticate(req);
    if (!auth) {
      return errorResponse(401, "Unauthorized");
    }

    // Check realm access
    if (!this.authMiddleware.checkRealmAccess(auth, requestedRealm)) {
      return errorResponse(403, "Access denied to this realm");
    }

    const realm = this.authMiddleware.resolveRealm(auth, requestedRealm);

    // POST /cas/{realm}/resolve
    if (req.method === "POST" && subPath === "/resolve") {
      return this.handleResolve(auth, realm, req);
    }

    // GET /cas/{realm}/nodes - List all nodes
    if (req.method === "GET" && subPath === "/nodes") {
      return this.handleListNodes(auth, realm, req);
    }

    // PUT /cas/{realm}/chunk/:key - Upload chunk (client-side chunking)
    const putChunkMatch = subPath.match(/^\/chunk\/(.+)$/);
    if (req.method === "PUT" && putChunkMatch) {
      const key = decodeURIComponent(putChunkMatch[1]!);
      return this.handlePutChunk(auth, realm, key, req);
    }

    // GET /cas/{realm}/chunk/:key - Get chunk data
    const getChunkMatch = subPath.match(/^\/chunk\/(.+)$/);
    if (req.method === "GET" && getChunkMatch) {
      const key = decodeURIComponent(getChunkMatch[1]!);
      return this.handleGetChunk(auth, realm, key);
    }

    // PUT /cas/{realm}/file - Upload file node (references chunks)
    if (req.method === "PUT" && subPath === "/file") {
      return this.handlePutFile(auth, realm, req);
    }

    // PUT /cas/{realm}/collection - Upload collection node
    if (req.method === "PUT" && subPath === "/collection") {
      return this.handlePutCollection(auth, realm, req);
    }

    // GET /cas/{realm}/node/:key - Get application layer node
    const getNodeMatch = subPath.match(/^\/node\/(.+)$/);
    if (req.method === "GET" && getNodeMatch) {
      const key = decodeURIComponent(getNodeMatch[1]!);
      return this.handleGetNode(auth, realm, key);
    }

    // GET /cas/{realm}/raw/:key - Get storage layer node
    const getRawMatch = subPath.match(/^\/raw\/(.+)$/);
    if (req.method === "GET" && getRawMatch) {
      const key = decodeURIComponent(getRawMatch[1]!);
      return this.handleGetRawNode(auth, realm, key);
    }

    // Legacy: PUT /cas/{realm}/node/:key (for backward compatibility)
    const putNodeMatch = subPath.match(/^\/node\/(.+)$/);
    if (req.method === "PUT" && putNodeMatch) {
      const key = decodeURIComponent(putNodeMatch[1]!);
      return this.handlePutChunk(auth, realm, key, req);
    }

    // Legacy: GET /cas/{realm}/dag/:key
    const getDagMatch = subPath.match(/^\/dag\/(.+)$/);
    if (req.method === "GET" && getDagMatch) {
      const key = decodeURIComponent(getDagMatch[1]!);
      return this.handleGetDag(auth, realm, key);
    }

    return errorResponse(404, "CAS endpoint not found");
  }

  /**
   * POST /cas/{realm}/resolve
   */
  private async handleResolve(
    auth: AuthContext,
    realm: string,
    req: HttpRequest
  ): Promise<HttpResponse> {
    const body = this.parseJson(req);
    const parsed = ResolveSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(400, "Invalid request", parsed.error.issues);
    }

    const { nodes } = parsed.data;

    // Check which nodes exist in this realm
    const { missing } = await this.ownershipDb.checkOwnership(realm, nodes);

    return jsonResponse(200, { missing });
  }

  /**
   * GET /cas/{realm}/nodes - List all nodes for a realm
   */
  private async handleListNodes(
    auth: AuthContext,
    realm: string,
    req: HttpRequest
  ): Promise<HttpResponse> {
    const url = new URL(req.path, "http://localhost");
    const limit = Math.min(Number.parseInt(url.searchParams.get("limit") ?? "100", 10), 1000);
    const startKey = url.searchParams.get("startKey") ?? undefined;

    const result = await this.ownershipDb.listOwnership(realm, limit, startKey);

    return jsonResponse(200, result);
  }

  /**
   * PUT /cas/{realm}/chunk/:key - Upload chunk data
   */
  private async handlePutChunk(
    auth: AuthContext,
    realm: string,
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

    // Check quota if applicable
    if (!this.authMiddleware.checkWritableQuota(auth, content.length)) {
      return errorResponse(413, "Quota exceeded");
    }

    const contentType =
      req.headers["content-type"] ?? req.headers["Content-Type"] ?? "application/octet-stream";

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
    await this.ownershipDb.addOwnership(realm, result.key, tokenId, contentType, result.size);

    return jsonResponse(200, {
      key: result.key,
      size: result.size,
    });
  }

  /**
   * GET /cas/{realm}/chunk/:key - Get chunk binary data
   */
  private async handleGetChunk(
    auth: AuthContext,
    realm: string,
    key: string
  ): Promise<HttpResponse> {
    if (!this.authMiddleware.checkReadAccess(auth, key)) {
      return errorResponse(403, "Read access denied");
    }

    // Check ownership
    const hasAccess = await this.ownershipDb.hasOwnership(realm, key);
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
   * PUT /cas/{realm}/file - Upload file node
   */
  private async handlePutFile(
    auth: AuthContext,
    realm: string,
    req: HttpRequest
  ): Promise<HttpResponse> {
    if (!this.authMiddleware.checkWriteAccess(auth)) {
      return errorResponse(403, "Write access denied");
    }

    const body = this.parseJson(req);
    const parsed = PutFileSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(400, "Invalid request", parsed.error.issues);
    }

    const { chunks, contentType } = parsed.data;

    // Check accepted MIME type
    if (!this.authMiddleware.checkAcceptedMimeType(auth, contentType)) {
      return errorResponse(415, "Content type not accepted");
    }

    // Verify all chunks exist
    for (const chunkKey of chunks) {
      const hasChunk = await this.ownershipDb.hasOwnership(realm, chunkKey);
      if (!hasChunk) {
        return errorResponse(400, `Chunk not found: ${chunkKey}`);
      }
    }

    // Calculate total size from chunks
    let totalSize = 0;
    for (const chunkKey of chunks) {
      const meta = await this.casStorage.getMetadata(chunkKey);
      if (meta) {
        totalSize += meta.size;
      }
    }

    // Create file node and store its metadata
    const fileNodeData = JSON.stringify({
      kind: "file",
      chunks,
      contentType,
      size: totalSize,
    });
    const fileNodeBuffer = Buffer.from(fileNodeData, "utf-8");
    const result = await this.casStorage.put(fileNodeBuffer, "application/json");

    // Add ownership
    const tokenId = TokensDb.extractTokenId(auth.token.pk);
    await this.ownershipDb.addOwnership(realm, result.key, tokenId, contentType, totalSize);

    // Mark ticket as written if applicable
    if (auth.token.type === "ticket") {
      const ticketId = TokensDb.extractTokenId(auth.token.pk);
      const marked = await this.tokensDb.markTicketWritten(ticketId, result.key);
      if (!marked) {
        // Already written - this shouldn't happen if canWrite check passed
        return errorResponse(403, "Ticket already consumed");
      }
    }

    return jsonResponse(200, { key: result.key });
  }

  /**
   * PUT /cas/{realm}/collection - Upload collection node
   */
  private async handlePutCollection(
    auth: AuthContext,
    realm: string,
    req: HttpRequest
  ): Promise<HttpResponse> {
    if (!this.authMiddleware.checkWriteAccess(auth)) {
      return errorResponse(403, "Write access denied");
    }

    const body = this.parseJson(req);
    const parsed = PutCollectionSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(400, "Invalid request", parsed.error.issues);
    }

    const { children } = parsed.data;
    const serverConfig = loadServerConfig();

    // Check children count
    if (Object.keys(children).length > serverConfig.maxCollectionChildren) {
      return errorResponse(400, `Too many children (max ${serverConfig.maxCollectionChildren})`);
    }

    // Verify all children exist
    for (const [name, childKey] of Object.entries(children)) {
      const hasChild = await this.ownershipDb.hasOwnership(realm, childKey);
      if (!hasChild) {
        return errorResponse(400, `Child not found: ${name} -> ${childKey}`);
      }
    }

    // Calculate total size from children
    let totalSize = 0;
    for (const childKey of Object.values(children)) {
      const ownership = await this.ownershipDb.getOwnership(realm, childKey);
      if (ownership) {
        totalSize += ownership.size;
      }
    }

    // Create collection node
    const collectionNodeData = JSON.stringify({
      kind: "collection",
      children,
      size: totalSize,
    });
    const collectionNodeBuffer = Buffer.from(collectionNodeData, "utf-8");
    const result = await this.casStorage.put(collectionNodeBuffer, "application/json");

    // Add ownership
    const tokenId = TokensDb.extractTokenId(auth.token.pk);
    await this.ownershipDb.addOwnership(
      realm,
      result.key,
      tokenId,
      "application/vnd.cas.collection",
      totalSize
    );

    // Mark ticket as written if applicable
    if (auth.token.type === "ticket") {
      const ticketId = TokensDb.extractTokenId(auth.token.pk);
      const marked = await this.tokensDb.markTicketWritten(ticketId, result.key);
      if (!marked) {
        return errorResponse(403, "Ticket already consumed");
      }
    }

    return jsonResponse(200, { key: result.key });
  }

  /**
   * GET /cas/{realm}/node/:key - Get application layer node (CasNode)
   */
  private async handleGetNode(
    auth: AuthContext,
    realm: string,
    key: string
  ): Promise<HttpResponse> {
    if (!this.authMiddleware.checkReadAccess(auth, key)) {
      return errorResponse(403, "Read access denied");
    }

    // Check ownership
    const hasAccess = await this.ownershipDb.hasOwnership(realm, key);
    if (!hasAccess) {
      return errorResponse(404, "Not found");
    }

    // Get raw node first
    const rawNode = await this.getRawNodeData(key);
    if (!rawNode) {
      return errorResponse(404, "Node not found");
    }

    // Expand to application layer view
    const node = await this.expandToAppNode(rawNode, realm, auth);

    return jsonResponse(200, node);
  }

  /**
   * GET /cas/{realm}/raw/:key - Get storage layer node (CasRawNode)
   */
  private async handleGetRawNode(
    auth: AuthContext,
    realm: string,
    key: string
  ): Promise<HttpResponse> {
    if (!this.authMiddleware.checkReadAccess(auth, key)) {
      return errorResponse(403, "Read access denied");
    }

    // Check ownership
    const hasAccess = await this.ownershipDb.hasOwnership(realm, key);
    if (!hasAccess) {
      return errorResponse(404, "Not found");
    }

    // Get raw node
    const rawNode = await this.getRawNodeData(key);
    if (!rawNode) {
      return errorResponse(404, "Node not found");
    }

    return jsonResponse(200, rawNode);
  }

  /**
   * Get raw node data from storage
   */
  private async getRawNodeData(key: string): Promise<any | null> {
    const result = await this.casStorage.get(key);
    if (!result) {
      return null;
    }

    // Check if it's a structured node (JSON) or raw chunk
    if (result.contentType === "application/json") {
      try {
        const data = JSON.parse(result.content.toString("utf-8"));
        return { ...data, key };
      } catch {
        // Not a structured node, treat as chunk
      }
    }

    // Raw chunk
    return {
      kind: "chunk",
      key,
      size: result.content.length,
    };
  }

  /**
   * Expand raw node to application layer node
   */
  private async expandToAppNode(rawNode: any, realm: string, auth: AuthContext): Promise<any> {
    if (rawNode.kind === "file") {
      return {
        kind: "file",
        key: rawNode.key,
        size: rawNode.size,
        contentType: rawNode.contentType,
      };
    }

    if (rawNode.kind === "collection") {
      const expandedChildren: Record<string, any> = {};
      for (const [name, childKey] of Object.entries(rawNode.children as Record<string, string>)) {
        const childRaw = await this.getRawNodeData(childKey);
        if (childRaw) {
          expandedChildren[name] = await this.expandToAppNode(childRaw, realm, auth);
        }
      }
      return {
        kind: "collection",
        key: rawNode.key,
        size: rawNode.size,
        children: expandedChildren,
      };
    }

    // Chunk nodes are not exposed in app layer
    return rawNode;
  }

  /**
   * GET /cas/{realm}/dag/:key (legacy, for backward compatibility)
   */
  private async handleGetDag(auth: AuthContext, realm: string, key: string): Promise<HttpResponse> {
    if (!this.authMiddleware.checkReadAccess(auth, key)) {
      return errorResponse(403, "Read access denied");
    }

    // Check ownership of root
    const hasAccess = await this.ownershipDb.hasOwnership(realm, key);
    if (!hasAccess) {
      return errorResponse(404, "Not found");
    }

    // Collect all DAG nodes and content types
    const nodes: Record<string, any> = {};
    const contentTypes: Record<string, string> = {};

    const collectNodes = async (nodeKey: string): Promise<void> => {
      if (nodes[nodeKey]) return; // Already visited

      const rawNode = await this.getRawNodeData(nodeKey);
      if (!rawNode) return;

      nodes[nodeKey] = rawNode;

      if (rawNode.kind === "file" && rawNode.contentType) {
        contentTypes[nodeKey] = rawNode.contentType;
      }

      if (rawNode.kind === "collection" && rawNode.children) {
        for (const childKey of Object.values(rawNode.children as Record<string, string>)) {
          await collectNodes(childKey);
        }
      }

      if (rawNode.kind === "file" && rawNode.chunks) {
        for (const chunkKey of rawNode.chunks) {
          await collectNodes(chunkKey);
        }
      }
    };

    await collectNodes(key);

    return jsonResponse(200, {
      root: key,
      nodes,
      contentTypes,
    });
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private parseJson(req: HttpRequest): unknown {
    if (!req.body) return {};

    // Body is already decoded by handler, just convert to string
    const bodyStr = typeof req.body === "string" ? req.body : req.body.toString("utf-8");

    try {
      return JSON.parse(bodyStr);
    } catch {
      return {};
    }
  }

  private getBinaryBody(req: HttpRequest): Buffer {
    if (!req.body) return Buffer.alloc(0);

    // Body is already decoded by handler
    if (Buffer.isBuffer(req.body)) {
      return req.body;
    }

    if (typeof req.body === "string") {
      return Buffer.from(req.body, "utf-8");
    }

    return Buffer.alloc(0);
  }
}
