/**
 * CAS Stack - Local Development Server (Bun)
 *
 * Uses in-memory storage for local development without AWS dependencies.
 */

import { createHash } from "crypto";
import type {
  CasConfig,
  HttpRequest,
  HttpResponse,
  Token,
  UserToken,
  AgentToken,
  Ticket,
  CasOwnership,
  CasDagNode,
  TokenPermissions,
} from "./src/types.ts";

// ============================================================================
// In-Memory Storage
// ============================================================================

class MemoryTokensDb {
  private tokens = new Map<string, Token>();

  async getToken(tokenId: string): Promise<Token | null> {
    const token = this.tokens.get(`token#${tokenId}`);
    if (!token) return null;
    if (token.expiresAt < Date.now()) {
      this.tokens.delete(`token#${tokenId}`);
      return null;
    }
    return token;
  }

  async createUserToken(
    userId: string,
    refreshToken: string,
    expiresIn: number = 3600
  ): Promise<UserToken> {
    const tokenId = `usr_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const token: UserToken = {
      pk: `token#${tokenId}`,
      type: "user",
      userId,
      refreshToken,
      createdAt: Date.now(),
      expiresAt: Date.now() + expiresIn * 1000,
    };
    this.tokens.set(token.pk, token);
    return token;
  }

  async createAgentToken(
    userId: string,
    name: string,
    permissions: TokenPermissions,
    expiresIn: number = 30 * 24 * 3600
  ): Promise<AgentToken> {
    const tokenId = `agt_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const token: AgentToken = {
      pk: `token#${tokenId}`,
      type: "agent",
      userId,
      name,
      permissions,
      createdAt: Date.now(),
      expiresAt: Date.now() + expiresIn * 1000,
    };
    this.tokens.set(token.pk, token);
    return token;
  }

  async createTicket(
    scope: string,
    issuerId: string,
    ticketType: "read" | "write",
    key?: string,
    expiresIn?: number
  ): Promise<Ticket> {
    const ticketId = `tkt_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const defaultExpiry = ticketType === "read" ? 3600 : 300;
    const ticket: Ticket = {
      pk: `token#${ticketId}`,
      type: "ticket",
      scope,
      issuerId,
      ticketType,
      key,
      createdAt: Date.now(),
      expiresAt: Date.now() + (expiresIn ?? defaultExpiry) * 1000,
    };
    this.tokens.set(ticket.pk, ticket);
    return ticket;
  }

  async listAgentTokens(userId: string): Promise<AgentToken[]> {
    const now = Date.now();
    return Array.from(this.tokens.values()).filter(
      (t): t is AgentToken =>
        t.type === "agent" && t.userId === userId && t.expiresAt > now
    );
  }

  async deleteToken(tokenId: string): Promise<void> {
    this.tokens.delete(`token#${tokenId}`);
  }

  async verifyTokenOwnership(tokenId: string, userId: string): Promise<boolean> {
    const token = await this.getToken(tokenId);
    if (!token) return false;
    if (token.type === "user" || token.type === "agent") {
      return token.userId === userId;
    }
    if (token.type === "ticket") {
      const issuer = await this.getToken(token.issuerId);
      if (!issuer) return false;
      if (issuer.type === "user" || issuer.type === "agent") {
        return issuer.userId === userId;
      }
    }
    return false;
  }

  static extractTokenId(pk: string): string {
    return pk.replace("token#", "");
  }
}

class MemoryOwnershipDb {
  private ownership = new Map<string, CasOwnership>();

  private key(scope: string, casKey: string): string {
    return `${scope}#${casKey}`;
  }

  async hasOwnership(scope: string, casKey: string): Promise<boolean> {
    return this.ownership.has(this.key(scope, casKey));
  }

  async getOwnership(scope: string, casKey: string): Promise<CasOwnership | null> {
    return this.ownership.get(this.key(scope, casKey)) ?? null;
  }

  async checkOwnership(
    scope: string,
    keys: string[]
  ): Promise<{ found: string[]; missing: string[] }> {
    const found: string[] = [];
    const missing: string[] = [];
    for (const k of keys) {
      if (this.ownership.has(this.key(scope, k))) {
        found.push(k);
      } else {
        missing.push(k);
      }
    }
    return { found, missing };
  }

  async addOwnership(
    scope: string,
    casKey: string,
    createdBy: string,
    contentType: string,
    size: number
  ): Promise<CasOwnership> {
    const record: CasOwnership = {
      scope,
      key: casKey,
      createdAt: Date.now(),
      createdBy,
      contentType,
      size,
    };
    this.ownership.set(this.key(scope, casKey), record);
    return record;
  }
}

class MemoryDagDb {
  private nodes = new Map<string, CasDagNode>();

  async getNode(key: string): Promise<CasDagNode | null> {
    return this.nodes.get(key) ?? null;
  }

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
    this.nodes.set(key, node);
    return node;
  }

  async collectDagKeys(rootKey: string): Promise<string[]> {
    const visited = new Set<string>();
    const queue = [rootKey];
    while (queue.length > 0) {
      const key = queue.shift()!;
      if (visited.has(key)) continue;
      visited.add(key);
      const node = this.nodes.get(key);
      if (node?.children) {
        for (const child of node.children) {
          if (!visited.has(child)) queue.push(child);
        }
      }
    }
    return Array.from(visited);
  }
}

class MemoryCasStorage {
  private blobs = new Map<string, { content: Buffer; contentType: string }>();

  static computeHash(content: Buffer): string {
    const hash = createHash("sha256").update(content).digest("hex");
    return `sha256:${hash}`;
  }

  async exists(casKey: string): Promise<boolean> {
    return this.blobs.has(casKey);
  }

  async get(casKey: string): Promise<{ content: Buffer; contentType: string } | null> {
    return this.blobs.get(casKey) ?? null;
  }

  async put(
    content: Buffer,
    contentType: string = "application/octet-stream"
  ): Promise<{ key: string; size: number; isNew: boolean }> {
    const key = MemoryCasStorage.computeHash(content);
    const isNew = !this.blobs.has(key);
    if (isNew) {
      this.blobs.set(key, { content, contentType });
    }
    return { key, size: content.length, isNew };
  }

  async putWithKey(
    expectedKey: string,
    content: Buffer,
    contentType: string = "application/octet-stream"
  ): Promise<
    | { key: string; size: number; isNew: boolean }
    | { error: "hash_mismatch"; expected: string; actual: string }
  > {
    const actualKey = MemoryCasStorage.computeHash(content);
    if (actualKey !== expectedKey) {
      return { error: "hash_mismatch", expected: expectedKey, actual: actualKey };
    }
    return this.put(content, contentType);
  }
}

// ============================================================================
// Mock Auth Service (for local dev without Cognito)
// ============================================================================

class MockAuthService {
  private tokensDb: MemoryTokensDb;
  private users = new Map<string, { id: string; email: string; password: string; name?: string }>();

  constructor(tokensDb: MemoryTokensDb) {
    this.tokensDb = tokensDb;
    // Add a test user
    this.users.set("test@example.com", {
      id: "test-user-123",
      email: "test@example.com",
      password: "password123",
      name: "Test User",
    });
  }

  async login(email: string, password: string) {
    const user = this.users.get(email);
    if (!user || user.password !== password) {
      throw new Error("Invalid credentials");
    }

    const userToken = await this.tokensDb.createUserToken(
      user.id,
      "mock-refresh-token",
      3600
    );

    return {
      userToken: MemoryTokensDb.extractTokenId(userToken.pk),
      refreshToken: "mock-refresh-token",
      expiresAt: new Date(userToken.expiresAt).toISOString(),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    };
  }

  async refresh(refreshToken: string) {
    // In mock mode, just create a new token for test user
    const userToken = await this.tokensDb.createUserToken(
      "test-user-123",
      refreshToken,
      3600
    );

    return {
      userToken: MemoryTokensDb.extractTokenId(userToken.pk),
      expiresAt: new Date(userToken.expiresAt).toISOString(),
    };
  }

  async createAgentToken(userId: string, name: string, permissions: TokenPermissions) {
    const token = await this.tokensDb.createAgentToken(userId, name, permissions);
    const tokenId = MemoryTokensDb.extractTokenId(token.pk);
    return {
      id: tokenId,
      token: tokenId,
      name,
      permissions,
      createdAt: new Date(token.createdAt).toISOString(),
      expiresAt: new Date(token.expiresAt).toISOString(),
    };
  }

  async createTicket(
    scope: string,
    issuerId: string,
    type: "read" | "write",
    key?: string
  ) {
    const ticket = await this.tokensDb.createTicket(scope, issuerId, type, key);
    const ticketId = MemoryTokensDb.extractTokenId(ticket.pk);
    return {
      id: ticketId,
      type,
      key,
      expiresAt: new Date(ticket.expiresAt).toISOString(),
    };
  }
}

// ============================================================================
// Local Router
// ============================================================================

const tokensDb = new MemoryTokensDb();
const ownershipDb = new MemoryOwnershipDb();
const dagDb = new MemoryDagDb();
const casStorage = new MemoryCasStorage();
const authService = new MockAuthService(tokensDb);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function binaryResponse(content: Buffer, contentType: string): Response {
  return new Response(new Uint8Array(content), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": content.length.toString(),
      ...CORS_HEADERS,
    },
  });
}

function errorResponse(status: number, error: string, details?: unknown): Response {
  return jsonResponse(status, { error, details });
}

interface AuthContext {
  userId: string;
  scope: string;
  canRead: boolean;
  canWrite: boolean;
  canIssueTicket: boolean;
  tokenId: string;
  allowedKey?: string;
}

async function authenticate(req: Request): Promise<AuthContext | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;

  const [scheme, tokenId] = authHeader.split(" ");
  if (!tokenId) return null;

  const token = await tokensDb.getToken(tokenId);
  if (!token) return null;

  const id = MemoryTokensDb.extractTokenId(token.pk);

  if (token.type === "user") {
    return {
      userId: token.userId,
      scope: `usr_${token.userId}`,
      canRead: true,
      canWrite: true,
      canIssueTicket: true,
      tokenId: id,
    };
  }

  if (token.type === "agent") {
    return {
      userId: token.userId,
      scope: `usr_${token.userId}`,
      canRead: token.permissions.read,
      canWrite: token.permissions.write,
      canIssueTicket: token.permissions.issueTicket,
      tokenId: id,
    };
  }

  if (token.type === "ticket") {
    return {
      userId: "",
      scope: token.scope,
      canRead: token.ticketType === "read",
      canWrite: token.ticketType === "write",
      canIssueTicket: false,
      tokenId: id,
      allowedKey: token.key,
    };
  }

  return null;
}

// ============================================================================
// Request Handlers
// ============================================================================

async function handleAuth(req: Request, path: string): Promise<Response> {
  // POST /auth/login
  if (req.method === "POST" && path === "/login") {
    const body = await req.json() as { email?: string; password?: string };
    if (!body.email || !body.password) {
      return errorResponse(400, "Missing email or password");
    }
    try {
      const result = await authService.login(body.email, body.password);
      return jsonResponse(200, result);
    } catch (e: any) {
      return errorResponse(401, e.message);
    }
  }

  // POST /auth/refresh
  if (req.method === "POST" && path === "/refresh") {
    const body = await req.json() as { refreshToken?: string };
    if (!body.refreshToken) {
      return errorResponse(400, "Missing refreshToken");
    }
    const result = await authService.refresh(body.refreshToken);
    return jsonResponse(200, result);
  }

  // Authenticated routes
  const auth = await authenticate(req);
  if (!auth) {
    return errorResponse(401, "Unauthorized");
  }

  // POST /auth/agent-token
  if (req.method === "POST" && path === "/agent-token") {
    const body = await req.json() as { name?: string; permissions?: TokenPermissions };
    if (!body.name || !body.permissions) {
      return errorResponse(400, "Missing name or permissions");
    }
    const result = await authService.createAgentToken(
      auth.userId,
      body.name,
      body.permissions
    );
    return jsonResponse(201, result);
  }

  // GET /auth/agent-tokens
  if (req.method === "GET" && path === "/agent-tokens") {
    const tokens = await tokensDb.listAgentTokens(auth.userId);
    return jsonResponse(200, {
      tokens: tokens.map((t) => ({
        id: MemoryTokensDb.extractTokenId(t.pk),
        name: t.name,
        permissions: t.permissions,
        createdAt: new Date(t.createdAt).toISOString(),
        expiresAt: new Date(t.expiresAt).toISOString(),
      })),
    });
  }

  // DELETE /auth/agent-token/:id
  const agentTokenMatch = path.match(/^\/agent-token\/([^\/]+)$/);
  if (req.method === "DELETE" && agentTokenMatch) {
    const tokenId = agentTokenMatch[1]!;
    const isOwner = await tokensDb.verifyTokenOwnership(tokenId, auth.userId);
    if (!isOwner) {
      return errorResponse(404, "Token not found");
    }
    await tokensDb.deleteToken(tokenId);
    return jsonResponse(200, { success: true });
  }

  // POST /auth/ticket
  if (req.method === "POST" && path === "/ticket") {
    if (!auth.canIssueTicket) {
      return errorResponse(403, "Not authorized to issue tickets");
    }
    const body = await req.json() as { type?: "read" | "write"; key?: string };
    if (!body.type) {
      return errorResponse(400, "Missing type");
    }
    if (body.type === "read" && !body.key) {
      return errorResponse(400, "Read tickets require a key");
    }
    const result = await authService.createTicket(
      auth.scope,
      auth.tokenId,
      body.type,
      body.key
    );
    return jsonResponse(201, result);
  }

  // DELETE /auth/ticket/:id
  const ticketMatch = path.match(/^\/ticket\/([^\/]+)$/);
  if (req.method === "DELETE" && ticketMatch) {
    const ticketId = ticketMatch[1]!;
    const isOwner = await tokensDb.verifyTokenOwnership(ticketId, auth.userId);
    if (!isOwner) {
      return errorResponse(404, "Ticket not found");
    }
    await tokensDb.deleteToken(ticketId);
    return jsonResponse(200, { success: true });
  }

  return errorResponse(404, "Auth endpoint not found");
}

async function handleCas(req: Request, scope: string, subPath: string): Promise<Response> {
  const auth = await authenticate(req);
  if (!auth) {
    return errorResponse(401, "Unauthorized");
  }

  // Resolve @me
  const effectiveScope = scope === "@me" ? auth.scope : scope;
  if (effectiveScope !== auth.scope) {
    return errorResponse(403, "Access denied to this scope");
  }

  // POST /cas/{scope}/resolve
  if (req.method === "POST" && subPath === "/resolve") {
    const body = await req.json() as { root?: string; nodes?: string[] };
    if (!body.nodes) {
      return errorResponse(400, "Missing nodes");
    }
    const { missing } = await ownershipDb.checkOwnership(effectiveScope, body.nodes);
    return jsonResponse(200, { missing });
  }

  // PUT /cas/{scope}/node/:key
  const putNodeMatch = subPath.match(/^\/node\/(.+)$/);
  if (req.method === "PUT" && putNodeMatch) {
    if (!auth.canWrite) {
      return errorResponse(403, "Write access denied");
    }
    const key = decodeURIComponent(putNodeMatch[1]!);
    const content = Buffer.from(await req.arrayBuffer());
    if (content.length === 0) {
      return errorResponse(400, "Empty body");
    }
    const contentType = req.headers.get("Content-Type") ?? "application/octet-stream";

    const result = await casStorage.putWithKey(key, content, contentType);
    if ("error" in result) {
      return errorResponse(400, "Hash mismatch", {
        expected: result.expected,
        actual: result.actual,
      });
    }

    await ownershipDb.addOwnership(
      effectiveScope,
      result.key,
      auth.tokenId,
      contentType,
      result.size
    );

    return jsonResponse(200, {
      key: result.key,
      size: result.size,
      contentType,
    });
  }

  // GET /cas/{scope}/node/:key
  const getNodeMatch = subPath.match(/^\/node\/(.+)$/);
  if (req.method === "GET" && getNodeMatch) {
    if (!auth.canRead) {
      return errorResponse(403, "Read access denied");
    }
    const key = decodeURIComponent(getNodeMatch[1]!);

    if (auth.allowedKey && auth.allowedKey !== key) {
      return errorResponse(403, "Read access denied for this key");
    }

    const hasAccess = await ownershipDb.hasOwnership(effectiveScope, key);
    if (!hasAccess) {
      return errorResponse(404, "Not found");
    }

    const blob = await casStorage.get(key);
    if (!blob) {
      return errorResponse(404, "Content not found");
    }

    return binaryResponse(blob.content, blob.contentType);
  }

  // GET /cas/{scope}/dag/:key
  const getDagMatch = subPath.match(/^\/dag\/(.+)$/);
  if (req.method === "GET" && getDagMatch) {
    if (!auth.canRead) {
      return errorResponse(403, "Read access denied");
    }
    const key = decodeURIComponent(getDagMatch[1]!);

    const hasAccess = await ownershipDb.hasOwnership(effectiveScope, key);
    if (!hasAccess) {
      return errorResponse(404, "Not found");
    }

    const dagKeys = await dagDb.collectDagKeys(key);
    const nodes: Record<string, { size: number; contentType: string; children: string[] }> = {};

    for (const nodeKey of dagKeys) {
      const meta = await dagDb.getNode(nodeKey);
      if (meta) {
        nodes[nodeKey] = {
          size: meta.size,
          contentType: meta.contentType,
          children: meta.children,
        };
      }
    }

    return jsonResponse(200, { root: key, nodes });
  }

  // POST /cas/{scope}/dag
  if (req.method === "POST" && subPath === "/dag") {
    return errorResponse(501, "Multipart DAG upload not yet implemented");
  }

  return errorResponse(404, "CAS endpoint not found");
}

// ============================================================================
// Server
// ============================================================================

const PORT = parseInt(process.env.PORT ?? "3550", 10);

console.log(`
╔══════════════════════════════════════════════════════════════╗
║                    CAS Stack Local Server                    ║
╠══════════════════════════════════════════════════════════════╣
║  URL: http://localhost:${PORT}                                 ║
║                                                              ║
║  Test User:                                                  ║
║    Email: test@example.com                                   ║
║    Password: password123                                     ║
║                                                              ║
║  Endpoints:                                                  ║
║    POST /auth/login          - Login                         ║
║    POST /auth/agent-token    - Create agent token            ║
║    POST /auth/ticket         - Create ticket                 ║
║    POST /cas/{scope}/resolve - Check node existence          ║
║    PUT  /cas/{scope}/node/:key - Upload node                 ║
║    GET  /cas/{scope}/node/:key - Download node               ║
╚══════════════════════════════════════════════════════════════╝
`);

Bun.serve({
  port: PORT,
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;

    console.log(`[${new Date().toISOString()}] ${req.method} ${path}`);

    // CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    try {
      // Health check
      if (path === "/" || path === "/health") {
        return jsonResponse(200, { status: "ok", service: "cas-stack-local" });
      }

      // Auth routes
      if (path.startsWith("/auth/")) {
        return handleAuth(req, path.replace("/auth", ""));
      }

      // CAS routes
      const casMatch = path.match(/^\/cas\/([^\/]+)(.*)$/);
      if (casMatch) {
        const [, scope, subPath] = casMatch;
        return handleCas(req, scope!, subPath ?? "");
      }

      return errorResponse(404, "Not found");
    } catch (error: any) {
      console.error("Server error:", error);
      return errorResponse(500, error.message ?? "Internal server error");
    }
  },
});
