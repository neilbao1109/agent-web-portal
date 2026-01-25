/**
 * E2E Test Suite for Agent Web Portal
 *
 * Run tests with:
 *   bun test examples/e2e.test.ts
 *
 * The server (examples/server.ts) is started as a background process.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Subprocess } from "bun";

const PORT = 3456; // Use a different port for tests to avoid conflicts
const BASE_URL = `http://localhost:${PORT}`;

let serverProcess: Subprocess;

// Start server as background process before tests
beforeAll(async () => {
  // Start the server as a subprocess with custom PORT
  // Use import.meta.dir to get the correct directory for server.ts
  const serverDir = import.meta.dir;
  serverProcess = Bun.spawn(["bun", "run", "server.ts"], {
    cwd: serverDir,
    env: { ...process.env, PORT: String(PORT) },
    stdout: "inherit",
    stderr: "inherit",
  });

  // Wait for server to be ready
  const maxRetries = 30;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(`${BASE_URL}/health`);
      if (response.ok) {
        return; // Server is ready
      }
    } catch {
      // Server not ready yet, wait and retry
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error("Server failed to start within timeout");
});

afterAll(() => {
  serverProcess?.kill();
});

// Response type for JSON-RPC
interface JsonRpcResult {
  jsonrpc: string;
  id: number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

// Helper to make JSON-RPC requests
async function jsonRpc(
  path: string,
  method: string,
  params?: Record<string, unknown>,
  id = 1
): Promise<JsonRpcResult> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params,
    }),
  });

  return response.json() as Promise<JsonRpcResult>;
}

// =============================================================================
// Server Health Tests
// =============================================================================

describe("Server Health", () => {
  test("health endpoint returns ok", async () => {
    const response = await fetch(`${BASE_URL}/health`);
    const result = (await response.json()) as { status: string };

    expect(response.status).toBe(200);
    expect(result.status).toBe("ok");
  });

  test("root endpoint returns portal list", async () => {
    const response = await fetch(`${BASE_URL}/`);
    const result = (await response.json()) as any;

    expect(response.status).toBe(200);
    expect(result.portals.basic).toBeDefined();
    expect(result.portals.ecommerce).toBeDefined();
  });

  test("unknown route returns 404", async () => {
    const response = await fetch(`${BASE_URL}/unknown`);
    expect(response.status).toBe(404);
  });
});

// =============================================================================
// Basic Portal Tests (/basic)
// =============================================================================

describe("Basic Portal (/basic)", () => {
  const path = "/basic";

  test("initialize returns server info", async () => {
    const result = await jsonRpc(path, "initialize");

    expect(result.jsonrpc).toBe("2.0");
    expect(result.id).toBe(1);
    expect(result.result.protocolVersion).toBe("2024-11-05");
    expect(result.result.serverInfo.name).toBe("greeting-portal");
    expect(result.result.capabilities.tools).toBeDefined();
    expect(result.result.capabilities.experimental?.skills).toBeDefined();
  });

  test("tools/list returns registered tools", async () => {
    const result = await jsonRpc(path, "tools/list");

    expect(result.result.tools).toBeArray();
    expect(result.result.tools.length).toBeGreaterThan(0);

    const greetTool = result.result.tools.find((t: any) => t.name === "greet");
    expect(greetTool).toBeDefined();
    expect(greetTool.description).toContain("greeting");
    expect(greetTool.inputSchema).toBeDefined();
  });

  test("skills/list returns registered skills", async () => {
    const result = await jsonRpc(path, "skills/list");

    expect(result.result).toBeDefined();
    expect(result.result["greeting-assistant"]).toBeDefined();
    expect(result.result["greeting-assistant"].url).toBe("/skills/greeting-assistant");
    expect(result.result["greeting-assistant"].frontmatter["allowed-tools"]).toContain("greet");
  });

  test("tools/call invokes greet tool (English)", async () => {
    const result = await jsonRpc(path, "tools/call", {
      name: "greet",
      arguments: { name: "World", language: "en" },
    });

    expect(result.result.content).toBeArray();
    expect(result.result.content[0].type).toBe("text");

    const content = JSON.parse(result.result.content[0].text);
    expect(content.message).toBe("Hello, World!");
    expect(content.timestamp).toBeDefined();
  });

  test("tools/call with Spanish greeting", async () => {
    const result = await jsonRpc(path, "tools/call", {
      name: "greet",
      arguments: { name: "Mundo", language: "es" },
    });

    const content = JSON.parse(result.result.content[0].text);
    expect(content.message).toBe("¡Hola, Mundo!");
  });

  test("tools/call with French greeting", async () => {
    const result = await jsonRpc(path, "tools/call", {
      name: "greet",
      arguments: { name: "Monde", language: "fr" },
    });

    const content = JSON.parse(result.result.content[0].text);
    expect(content.message).toBe("Bonjour, Monde!");
  });

  test("tools/call with Japanese greeting", async () => {
    const result = await jsonRpc(path, "tools/call", {
      name: "greet",
      arguments: { name: "世界", language: "ja" },
    });

    const content = JSON.parse(result.result.content[0].text);
    expect(content.message).toBe("こんにちは、世界さん！");
  });

  test("tools/call with invalid tool returns error", async () => {
    const result = await jsonRpc(path, "tools/call", {
      name: "nonexistent_tool",
      arguments: {},
    });

    expect(result.error).toBeDefined();
    expect(result.error!.message).toContain("Tool not found");
  });

  test("ping returns pong", async () => {
    const result = await jsonRpc(path, "ping");
    expect(result.result.pong).toBe(true);
  });

  test("unknown method returns error", async () => {
    const result = await jsonRpc(path, "unknown/method");

    expect(result.error).toBeDefined();
    expect(result.error!.code).toBe(-32601);
    expect(result.error!.message).toContain("Method not found");
  });
});

// =============================================================================
// E-commerce Portal Tests (/ecommerce)
// =============================================================================

describe("E-commerce Portal (/ecommerce)", () => {
  const path = "/ecommerce";

  test("initialize returns ecommerce server info", async () => {
    const result = await jsonRpc(path, "initialize");

    expect(result.result.serverInfo.name).toBe("ecommerce-portal");
    expect(result.result.serverInfo.version).toBe("2.0.0");
  });

  test("tools/list returns all ecommerce tools", async () => {
    const result = await jsonRpc(path, "tools/list");

    const toolNames = result.result.tools.map((t: any) => t.name);
    expect(toolNames).toContain("search_products");
    expect(toolNames).toContain("manage_cart");
    expect(toolNames).toContain("checkout");
  });

  test("skills/list returns skills with cross-MCP references", async () => {
    const result = await jsonRpc(path, "skills/list");

    // Shopping assistant skill
    expect(result.result["shopping-assistant"]).toBeDefined();
    expect(result.result["shopping-assistant"].frontmatter["allowed-tools"]).toEqual([
      "search_products",
      "manage_cart",
      "checkout",
    ]);

    // Product comparison skill with cross-MCP reference
    expect(result.result["product-comparison"]).toBeDefined();
    expect(result.result["product-comparison"].frontmatter["allowed-tools"]).toContain(
      "external_reviews:get_reviews"
    );
  });

  test("search_products tool works", async () => {
    const result = await jsonRpc(path, "tools/call", {
      name: "search_products",
      arguments: { query: "laptop", limit: 5 },
    });

    const content = JSON.parse(result.result.content[0].text);
    expect(content.results).toBeArray();
    expect(content.results[0].title).toContain("laptop");
    expect(content.total).toBeGreaterThan(0);
  });

  test("manage_cart add and list flow", async () => {
    // Clear cart first
    await jsonRpc(path, "tools/call", {
      name: "manage_cart",
      arguments: { action: "clear" },
    });

    // Add item to cart
    const addResult = await jsonRpc(path, "tools/call", {
      name: "manage_cart",
      arguments: { action: "add", productId: "TEST-001", quantity: 2 },
    });

    const addContent = JSON.parse(addResult.result.content[0].text);
    expect(addContent.success).toBe(true);
    expect(addContent.items).toHaveLength(1);
    expect(addContent.items[0].productId).toBe("TEST-001");
    expect(addContent.items[0].quantity).toBe(2);

    // List cart
    const listResult = await jsonRpc(path, "tools/call", {
      name: "manage_cart",
      arguments: { action: "list" },
    });

    const listContent = JSON.parse(listResult.result.content[0].text);
    expect(listContent.items).toHaveLength(1);
  });

  test("manage_cart remove item", async () => {
    // Clear and add item
    await jsonRpc(path, "tools/call", {
      name: "manage_cart",
      arguments: { action: "clear" },
    });
    await jsonRpc(path, "tools/call", {
      name: "manage_cart",
      arguments: { action: "add", productId: "REMOVE-TEST", quantity: 1 },
    });

    // Remove item
    const result = await jsonRpc(path, "tools/call", {
      name: "manage_cart",
      arguments: { action: "remove", productId: "REMOVE-TEST" },
    });

    const content = JSON.parse(result.result.content[0].text);
    expect(content.success).toBe(true);
    expect(content.items).toHaveLength(0);
  });

  test("checkout flow works", async () => {
    // Add item first
    await jsonRpc(path, "tools/call", {
      name: "manage_cart",
      arguments: { action: "add", productId: "CHECKOUT-TEST", quantity: 1 },
    });

    // Checkout
    const result = await jsonRpc(path, "tools/call", {
      name: "checkout",
      arguments: {
        shippingAddress: "123 Test St",
        paymentMethod: "card",
      },
    });

    const content = JSON.parse(result.result.content[0].text);
    expect(content.orderId).toMatch(/^ORD-\d+$/);
    expect(content.status).toBe("confirmed");
    expect(content.estimatedDelivery).toBeDefined();
  });

  test("batch JSON-RPC requests work", async () => {
    const response = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([
        { jsonrpc: "2.0", id: 1, method: "tools/list" },
        { jsonrpc: "2.0", id: 2, method: "skills/list" },
        { jsonrpc: "2.0", id: 3, method: "ping" },
      ]),
    });

    const results = (await response.json()) as JsonRpcResult[];
    expect(results).toBeArray();
    expect(results).toHaveLength(3);
    expect(results[0]!.id).toBe(1);
    expect(results[1]!.id).toBe(2);
    expect(results[2]!.id).toBe(3);
  });
});

// =============================================================================
// Error Handling Tests
// =============================================================================

describe("Error Handling", () => {
  const path = "/basic";

  test("invalid JSON returns parse error", async () => {
    const response = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ invalid json }",
    });

    const result = (await response.json()) as JsonRpcResult;
    expect(result.error!.code).toBe(-32700);
    expect(result.error!.message).toBe("Parse error");
  });

  test("invalid JSON-RPC request returns error", async () => {
    const response = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notJsonRpc: true }),
    });

    const result = (await response.json()) as JsonRpcResult;
    expect(result.error!.code).toBe(-32600);
    expect(result.error!.message).toBe("Invalid Request");
  });

  test("GET request returns method not allowed", async () => {
    const response = await fetch(`${BASE_URL}${path}`, {
      method: "GET",
    });

    expect(response.status).toBe(405);
  });

  test("tools/call with missing name returns error", async () => {
    const result = await jsonRpc(path, "tools/call", {
      arguments: { name: "test" },
    });

    expect(result.error!.code).toBe(-32602);
    expect(result.error!.message).toContain("'name' is required");
  });

  test("tools/call with validation error returns isError", async () => {
    const result = await jsonRpc(path, "tools/call", {
      name: "greet",
      arguments: { name: 123 }, // Should be string
    });

    expect(result.result.isError).toBe(true);
    expect(result.result.content[0].text).toContain("validation");
  });
});

// =============================================================================
// Cross-Portal Isolation Tests
// =============================================================================

describe("Portal Isolation", () => {
  test("basic portal cannot access ecommerce tools", async () => {
    const result = await jsonRpc("/basic", "tools/call", {
      name: "search_products",
      arguments: { query: "test" },
    });

    expect(result.error).toBeDefined();
    expect(result.error!.message).toContain("Tool not found");
  });

  test("ecommerce portal cannot access basic tools", async () => {
    const result = await jsonRpc("/ecommerce", "tools/call", {
      name: "greet",
      arguments: { name: "test" },
    });

    expect(result.error).toBeDefined();
    expect(result.error!.message).toContain("Tool not found");
  });

  test("each portal has independent tool lists", async () => {
    const basicTools = await jsonRpc("/basic", "tools/list");
    const ecommerceTools = await jsonRpc("/ecommerce", "tools/list");

    const basicToolNames = basicTools.result.tools.map((t: any) => t.name);
    const ecommerceToolNames = ecommerceTools.result.tools.map((t: any) => t.name);

    expect(basicToolNames).toContain("greet");
    expect(basicToolNames).not.toContain("search_products");

    expect(ecommerceToolNames).toContain("search_products");
    expect(ecommerceToolNames).not.toContain("greet");
  });
});

// =============================================================================
// AWP Auth Discovery Tests (/auth)
// =============================================================================

describe("AWP Auth Discovery (/auth)", () => {
  const authPath = "/auth";
  const authInitPath = "/auth/init";
  const authStatusPath = "/auth/status";
  const authLoginPath = "/auth/login";
  const authPagePath = "/auth/page";

  // Test keypair for signing requests
  let testPublicKey: string;
  let testPrivateKey: CryptoKey;

  // Generate test keypair before tests
  beforeAll(async () => {
    const keyPair = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"]
    );
    const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
    testPublicKey = `${publicJwk.x}.${publicJwk.y}`;
    testPrivateKey = keyPair.privateKey;
  });

  // Helper to sign a payload
  async function signPayload(payload: string): Promise<string> {
    const encoder = new TextEncoder();
    const signature = await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      testPrivateKey,
      encoder.encode(payload)
    );
    const base64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
    return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  // Helper to hash body
  async function hashBody(body: string): Promise<string> {
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(body));
    const base64 = btoa(String.fromCharCode(...new Uint8Array(hashBuffer)));
    return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  describe("Auth Init Endpoint", () => {
    test("returns verification code for valid pubkey", async () => {
      const response = await fetch(`${BASE_URL}${authInitPath}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pubkey: testPublicKey,
          client_name: "E2E Test Client",
        }),
      });

      expect(response.status).toBe(200);

      const result = (await response.json()) as any;
      expect(result.auth_url).toBeDefined();
      expect(result.verification_code).toMatch(/^[A-Z0-9]{3}-[A-Z0-9]{3}$/);
      expect(result.expires_in).toBe(600);
      expect(result.poll_interval).toBe(5);
    });

    test("rejects invalid pubkey format", async () => {
      const response = await fetch(`${BASE_URL}${authInitPath}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pubkey: "invalid-format",
          client_name: "Test Client",
        }),
      });

      expect(response.status).toBe(400);
    });
  });

  describe("Auth Status Endpoint", () => {
    test("returns authorized: false for pending auth", async () => {
      // First init
      await fetch(`${BASE_URL}${authInitPath}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pubkey: "pending.key",
          client_name: "Test",
        }),
      });

      // Check status
      const response = await fetch(`${BASE_URL}${authStatusPath}?pubkey=pending.key`);
      expect(response.status).toBe(200);

      const result = (await response.json()) as any;
      expect(result.authorized).toBe(false);
    });
  });

  describe("Auth Page", () => {
    test("returns login page HTML", async () => {
      const response = await fetch(`${BASE_URL}${authPagePath}`);
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toContain("text/html");

      const html = await response.text();
      expect(html).toContain("Authorize Application");
      expect(html).toContain("test / test123");
    });

    test("displays verification code from URL params", async () => {
      const response = await fetch(`${BASE_URL}${authPagePath}?code=ABC-123&pubkey=test.key`);
      expect(response.status).toBe(200);

      const html = await response.text();
      // The code is displayed via JavaScript, so we check the hidden input
      expect(html).toContain('id="verification_code"');
      expect(html).toContain('id="pubkey"');
    });
  });

  describe("Auth Login Flow", () => {
    test("completes auth with valid credentials and verification code", async () => {
      // Step 1: Init auth
      const initResponse = await fetch(`${BASE_URL}${authInitPath}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pubkey: testPublicKey,
          client_name: "E2E Test Client",
        }),
      });
      const initResult = (await initResponse.json()) as any;
      const verificationCode = initResult.verification_code;

      // Step 2: Login with test user credentials
      const formData = new FormData();
      formData.append("username", "test");
      formData.append("password", "test123");
      formData.append("verification_code", verificationCode);
      formData.append("pubkey", testPublicKey);

      const loginResponse = await fetch(`${BASE_URL}${authLoginPath}`, {
        method: "POST",
        body: formData,
      });
      expect(loginResponse.status).toBe(200);

      const html = await loginResponse.text();
      expect(html).toContain("Authorization Complete");

      // Step 3: Check status
      const statusResponse = await fetch(`${BASE_URL}${authStatusPath}?pubkey=${encodeURIComponent(testPublicKey)}`);
      const statusResult = (await statusResponse.json()) as any;
      expect(statusResult.authorized).toBe(true);
    });

    test("rejects invalid credentials", async () => {
      const formData = new FormData();
      formData.append("username", "test");
      formData.append("password", "wrongpassword");
      formData.append("verification_code", "ABC-123");
      formData.append("pubkey", "test.key");

      const response = await fetch(`${BASE_URL}${authLoginPath}`, {
        method: "POST",
        body: formData,
      });
      expect(response.status).toBe(401);

      const html = await response.text();
      expect(html).toContain("Invalid username or password");
    });

    test("rejects invalid verification code", async () => {
      // Init auth first
      await fetch(`${BASE_URL}${authInitPath}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pubkey: "wrong.code.key",
          client_name: "Test",
        }),
      });

      // Login with wrong verification code
      const formData = new FormData();
      formData.append("username", "test");
      formData.append("password", "test123");
      formData.append("verification_code", "WRONG-CODE");
      formData.append("pubkey", "wrong.code.key");

      const response = await fetch(`${BASE_URL}${authLoginPath}`, {
        method: "POST",
        body: formData,
      });
      expect(response.status).toBe(400);
    });
  });

  describe("401 Challenge Response", () => {
    test("returns 401 without credentials", async () => {
      const response = await fetch(`${BASE_URL}${authPath}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
        }),
      });

      expect(response.status).toBe(401);
    });

    test("includes WWW-Authenticate header", async () => {
      const response = await fetch(`${BASE_URL}${authPath}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
        }),
      });

      const wwwAuth = response.headers.get("WWW-Authenticate");
      expect(wwwAuth).not.toBeNull();
      expect(wwwAuth).toContain("AWP");
    });

    test("includes auth_init_endpoint in body", async () => {
      const response = await fetch(`${BASE_URL}${authPath}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
        }),
      });

      const result = (await response.json()) as any;
      expect(result.error).toBe("unauthorized");
      expect(result.auth_init_endpoint).toBe("/auth/init");
    });
  });

  describe("Authenticated Requests", () => {
    test("succeeds with valid signature", async () => {
      // First complete auth flow via login
      const initResponse = await fetch(`${BASE_URL}${authInitPath}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pubkey: testPublicKey,
          client_name: "Signed Request Test",
        }),
      });
      const { verification_code } = (await initResponse.json()) as any;

      // Complete auth via login form
      const formData = new FormData();
      formData.append("username", "test");
      formData.append("password", "test123");
      formData.append("verification_code", verification_code);
      formData.append("pubkey", testPublicKey);

      await fetch(`${BASE_URL}${authLoginPath}`, {
        method: "POST",
        body: formData,
      });

      // Now make signed request
      const body = JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
      });
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const bodyHash = await hashBody(body);
      const payload = `${timestamp}.POST./auth.${bodyHash}`;
      const signature = await signPayload(payload);

      const response = await fetch(`${BASE_URL}${authPath}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-AWP-Pubkey": testPublicKey,
          "X-AWP-Timestamp": timestamp,
          "X-AWP-Signature": signature,
        },
        body,
      });

      expect(response.status).toBe(200);
      const result = (await response.json()) as JsonRpcResult;
      expect(result.result).toBeDefined();
      expect(result.result.tools).toBeArray();
    });

    test("can call tools with valid signature", async () => {
      const body = JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "secure_greet",
          arguments: { name: "SignedUser", language: "en" },
        },
      });
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const bodyHash = await hashBody(body);
      const payload = `${timestamp}.POST./auth.${bodyHash}`;
      const signature = await signPayload(payload);

      const response = await fetch(`${BASE_URL}${authPath}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-AWP-Pubkey": testPublicKey,
          "X-AWP-Timestamp": timestamp,
          "X-AWP-Signature": signature,
        },
        body,
      });

      expect(response.status).toBe(200);
      const result = (await response.json()) as JsonRpcResult;
      expect(result.result.content).toBeArray();
      const content = JSON.parse(result.result.content[0].text);
      expect(content.message).toContain("SignedUser");
      expect(content.message).toContain("authenticated");
    });
  });

  describe("Path Exclusions", () => {
    test("auth/init does not require auth", async () => {
      const response = await fetch(`${BASE_URL}${authInitPath}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pubkey: "test.pubkey",
          client_name: "Test",
        }),
      });
      // Should return 200, not 401
      expect(response.status).toBe(200);
    });

    test("auth/status does not require auth", async () => {
      const response = await fetch(`${BASE_URL}${authStatusPath}?pubkey=test`);
      // Should return 200, not 401
      expect(response.status).toBe(200);
    });

    test("health check does not require auth (root level)", async () => {
      const response = await fetch(`${BASE_URL}/health`);
      expect(response.status).toBe(200);
    });
  });
});

// =============================================================================
// Blob Handling Tests (/blob)
// =============================================================================

describe("Blob Handling (/blob)", () => {
  const blobPath = "/blob";

  describe("Blob Schema in tools/list", () => {
    test("marks blob fields with x-awp-blob", async () => {
      const result = await jsonRpc(blobPath, "tools/list");

      expect(result.result.tools).toBeArray();

      // Find the process_document tool
      const processDocTool = result.result.tools.find((t: any) => t.name === "process_document");
      expect(processDocTool).toBeDefined();

      // Check input schema has x-awp-blob marker for document field
      const inputSchema = processDocTool.inputSchema;
      expect(inputSchema.properties.document).toBeDefined();
      expect(inputSchema.properties.document["x-awp-blob"]).toBeDefined();
      expect(inputSchema.properties.document["x-awp-blob"].mimeType).toBe("application/pdf");
    });

    test("includes blob metadata in schema", async () => {
      const result = await jsonRpc(blobPath, "tools/list");

      const processDocTool = result.result.tools.find((t: any) => t.name === "process_document");
      const blobMeta = processDocTool.inputSchema.properties.document["x-awp-blob"];

      expect(blobMeta.mimeType).toBe("application/pdf");
      expect(blobMeta.description).toBe("PDF document to process");
    });

    test("simple_tool has no blob markers", async () => {
      const result = await jsonRpc(blobPath, "tools/list");

      const simpleTool = result.result.tools.find((t: any) => t.name === "simple_tool");
      expect(simpleTool).toBeDefined();

      // Check that message field does not have x-awp-blob
      expect(simpleTool.inputSchema.properties.message).toBeDefined();
      expect(simpleTool.inputSchema.properties.message["x-awp-blob"]).toBeUndefined();
    });
  });

  describe("Blob Context Validation", () => {
    test("requires blob context for blob tools", async () => {
      // Call process_document without _blobContext
      const result = await jsonRpc(blobPath, "tools/call", {
        name: "process_document",
        arguments: {
          document: "mock://input/test.pdf",
          quality: 80,
        },
        // No _blobContext provided
      });

      // Should return an error about missing blob context
      expect(result.result.isError).toBe(true);
      expect(result.result.content[0].text).toContain("blob context");
    });

    test("validates input blob presigned URLs", async () => {
      // Call with incomplete input blob context
      const result = await jsonRpc(blobPath, "tools/call", {
        name: "process_document",
        arguments: {
          document: "mock://input/test.pdf",
          quality: 80,
        },
        _blobContext: {
          input: {}, // Missing document presigned URL
          output: {
            thumbnail: "https://mock.storage/put/thumbnail",
          },
          outputUri: {
            thumbnail: "mock://output/thumb.png",
          },
        },
      });

      expect(result.result.isError).toBe(true);
      expect(result.result.content[0].text).toContain("document");
    });

    test("validates output blob presigned URLs", async () => {
      // Call with incomplete output blob context
      const result = await jsonRpc(blobPath, "tools/call", {
        name: "process_document",
        arguments: {
          document: "mock://input/test.pdf",
          quality: 80,
        },
        _blobContext: {
          input: {
            document: "https://mock.storage/get/test.pdf",
          },
          output: {}, // Missing thumbnail presigned URL
          outputUri: {
            thumbnail: "mock://output/thumb.png",
          },
        },
      });

      expect(result.result.isError).toBe(true);
      expect(result.result.content[0].text).toContain("thumbnail");
    });

    test("validates output blob permanent URIs", async () => {
      // Call with missing outputUri
      const result = await jsonRpc(blobPath, "tools/call", {
        name: "process_document",
        arguments: {
          document: "mock://input/test.pdf",
          quality: 80,
        },
        _blobContext: {
          input: {
            document: "https://mock.storage/get/test.pdf",
          },
          output: {
            thumbnail: "https://mock.storage/put/thumbnail",
          },
          outputUri: {}, // Missing thumbnail permanent URI
        },
      });

      expect(result.result.isError).toBe(true);
      expect(result.result.content[0].text).toContain("thumbnail");
    });
  });

  describe("Blob Processing", () => {
    test("processes blob tool with valid context", async () => {
      const result = await jsonRpc(blobPath, "tools/call", {
        name: "process_document",
        arguments: {
          document: "mock://input/test.pdf",
          quality: 90,
        },
        _blobContext: {
          input: {
            document: "https://mock.storage/get/test.pdf?sig=abc",
          },
          output: {
            thumbnail: "https://mock.storage/put/thumbnail?sig=xyz",
          },
          outputUri: {
            thumbnail: "mock://output/generated-thumb.png",
          },
        },
      });

      expect(result.result.isError).toBeUndefined();
      expect(result.result.content).toBeArray();
      expect(result.result.content[0].type).toBe("text");
    });

    test("returns permanent URIs for output blobs", async () => {
      const expectedUri = "mock://output/my-thumbnail-123.png";

      const result = await jsonRpc(blobPath, "tools/call", {
        name: "process_document",
        arguments: {
          document: "mock://input/doc.pdf",
          quality: 85,
        },
        _blobContext: {
          input: {
            document: "https://mock.storage/get/doc.pdf",
          },
          output: {
            thumbnail: "https://mock.storage/put/thumb",
          },
          outputUri: {
            thumbnail: expectedUri,
          },
        },
      });

      const content = JSON.parse(result.result.content[0].text);

      // The output should contain the permanent URI
      expect(content.thumbnail).toBe(expectedUri);
      expect(content.pageCount).toBe(10); // From the mock handler
      expect(content.processedAt).toBeDefined();
    });

    test("simple tool works without blob context", async () => {
      // simple_tool has no blob fields, should work without _blobContext
      const result = await jsonRpc(blobPath, "tools/call", {
        name: "simple_tool",
        arguments: {
          message: "Hello, World!",
        },
      });

      expect(result.result.isError).toBeUndefined();

      const content = JSON.parse(result.result.content[0].text);
      expect(content.echo).toBe("Echo: Hello, World!");
    });

    test("blob tool processes with custom quality parameter", async () => {
      // Test that the handler receives the non-blob arguments correctly
      // by verifying the tool executes successfully with various quality values
      const result = await jsonRpc(blobPath, "tools/call", {
        name: "process_document",
        arguments: {
          document: "mock://input/quality-test.pdf",
          quality: 95, // Custom quality value
        },
        _blobContext: {
          input: {
            document: "https://mock.storage/get/quality-test.pdf",
          },
          output: {
            thumbnail: "https://mock.storage/put/quality-thumb",
          },
          outputUri: {
            thumbnail: "mock://output/quality-thumb.png",
          },
        },
      });

      expect(result.result.isError).toBeUndefined();

      const content = JSON.parse(result.result.content[0].text);
      // Verify the tool executed successfully
      expect(content.pageCount).toBe(10);
      expect(content.processedAt).toBeDefined();
      expect(content.thumbnail).toBe("mock://output/quality-thumb.png");
    });
  });
});
