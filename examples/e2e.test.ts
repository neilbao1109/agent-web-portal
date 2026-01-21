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
  serverProcess = Bun.spawn(["bun", "run", "examples/server.ts"], {
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
    expect(result.result["greeting-assistant"].url).toBe("/skills/greeting-assistant.md");
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
