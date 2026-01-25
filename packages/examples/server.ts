/**
 * Unified Example Server for Agent Web Portal
 *
 * Runs all example portals on a single server with different routes:
 * - /basic/*     -> Basic greeting portal
 * - /ecommerce/* -> E-commerce portal
 * - /auth/*      -> Auth-enabled portal (for auth discovery testing)
 * - /blob/*      -> Blob-enabled portal (for blob handling testing)
 *
 * Run with: bun run examples/server.ts
 * Test with: bun test examples/e2e.test.ts
 */

import {
  type AuthHttpRequest,
  completeAuthorization,
  createAwpAuthMiddleware,
  MemoryPendingAuthStore,
  MemoryPubkeyStore,
  routeAuthRequest,
} from "@agent-web-portal/auth";
import { blob, createAgentWebPortal } from "@agent-web-portal/core";
import { z } from "zod";

// =============================================================================
// 1. Basic Greeting Portal
// =============================================================================

const GreetInputSchema = z.object({
  name: z.string().describe("The name of the person to greet"),
  language: z
    .enum(["en", "es", "fr", "de", "ja"])
    .optional()
    .default("en")
    .describe("The language for the greeting"),
});

const GreetOutputSchema = z.object({
  message: z.string().describe("The greeting message"),
  timestamp: z.string().describe("ISO timestamp of when the greeting was generated"),
});

const basicPortal = createAgentWebPortal({
  name: "greeting-portal",
  version: "1.0.0",
  description: "A simple greeting service for AI Agents",
})
  .registerTool("greet", {
    inputSchema: GreetInputSchema,
    outputSchema: GreetOutputSchema,
    description: "Generate a greeting message in various languages",
    handler: async ({ name, language }) => {
      const greetings: Record<string, string> = {
        en: `Hello, ${name}!`,
        es: `¡Hola, ${name}!`,
        fr: `Bonjour, ${name}!`,
        de: `Hallo, ${name}!`,
        ja: `こんにちは、${name}さん！`,
      };

      return {
        message: greetings[language ?? "en"] ?? greetings.en!,
        timestamp: new Date().toISOString(),
      };
    },
  })
  .registerSkills({
    "greeting-assistant": {
      url: "/skills/greeting-assistant",
      frontmatter: {
        name: "Greeting Assistant",
        description: "A skill for greeting users in multiple languages",
        version: "1.0.0",
        "allowed-tools": ["greet"],
      },
    },
  })
  .build();

// =============================================================================
// 2. E-commerce Portal
// =============================================================================

const SearchInputSchema = z.object({
  query: z.string().describe("Search query"),
  limit: z.number().optional().default(10).describe("Maximum results"),
});

const SearchOutputSchema = z.object({
  results: z.array(
    z.object({
      title: z.string(),
      url: z.string(),
      snippet: z.string(),
    })
  ),
  total: z.number(),
});

const CartInputSchema = z.object({
  action: z.enum(["add", "remove", "list", "clear"]),
  productId: z.string().optional(),
  quantity: z.number().optional().default(1),
});

const CartOutputSchema = z.object({
  success: z.boolean(),
  items: z.array(
    z.object({
      productId: z.string(),
      quantity: z.number(),
    })
  ),
  message: z.string(),
});

const CheckoutInputSchema = z.object({
  shippingAddress: z.string(),
  paymentMethod: z.enum(["card", "paypal", "crypto"]),
});

const CheckoutOutputSchema = z.object({
  orderId: z.string(),
  status: z.enum(["pending", "confirmed", "failed"]),
  estimatedDelivery: z.string().optional(),
});

// Simulated cart state
const cartItems: Map<string, number> = new Map();

const ecommercePortal = createAgentWebPortal({
  name: "ecommerce-portal",
  version: "2.0.0",
  description: "E-commerce Agent Web Portal",
})
  .registerTool("search_products", {
    inputSchema: SearchInputSchema,
    outputSchema: SearchOutputSchema,
    description: "Search for products in the catalog",
    handler: async ({ query, limit }) => {
      const mockResults = [
        {
          title: `${query} - Product A`,
          url: "/products/a",
          snippet: `Best ${query} on the market`,
        },
        {
          title: `${query} - Product B`,
          url: "/products/b",
          snippet: `Premium ${query} with warranty`,
        },
      ].slice(0, limit);

      return {
        results: mockResults,
        total: mockResults.length,
      };
    },
  })
  .registerTool("manage_cart", {
    inputSchema: CartInputSchema,
    outputSchema: CartOutputSchema,
    description: "Manage shopping cart (add, remove, list, clear items)",
    handler: async ({ action, productId, quantity }) => {
      switch (action) {
        case "add":
          if (productId) {
            const current = cartItems.get(productId) ?? 0;
            cartItems.set(productId, current + quantity!);
          }
          break;
        case "remove":
          if (productId) {
            cartItems.delete(productId);
          }
          break;
        case "clear":
          cartItems.clear();
          break;
      }

      const items = Array.from(cartItems.entries()).map(([id, qty]) => ({
        productId: id,
        quantity: qty,
      }));

      return {
        success: true,
        items,
        message: `Cart ${action} completed. ${items.length} items in cart.`,
      };
    },
  })
  .registerTool("checkout", {
    inputSchema: CheckoutInputSchema,
    outputSchema: CheckoutOutputSchema,
    description: "Complete checkout process",
    handler: async ({ shippingAddress, paymentMethod }) => {
      const orderId = `ORD-${Date.now()}`;
      cartItems.clear();

      return {
        orderId,
        status: "confirmed" as const,
        estimatedDelivery: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      };
    },
  })
  .registerSkills({
    "shopping-assistant": {
      url: "/skills/shopping-assistant",
      frontmatter: {
        name: "Shopping Assistant",
        description: "Complete e-commerce shopping flow",
        version: "2.0.0",
        "allowed-tools": ["search_products", "manage_cart", "checkout"],
      },
    },
    "product-comparison": {
      url: "/skills/product-comparison",
      frontmatter: {
        name: "Product Comparison",
        description: "Compare products across sources",
        version: "1.0.0",
        "allowed-tools": [
          "search_products",
          "external_reviews:get_reviews", // Cross-MCP reference
        ],
      },
    },
  })
  .build();

// =============================================================================
// 3. Auth-Enabled Portal (for testing auth discovery)
// =============================================================================

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// AWP Auth stores (in-memory for testing)
const pendingAuthStore = new MemoryPendingAuthStore();
const pubkeyStore = new MemoryPubkeyStore();

// AWP Auth middleware
const authMiddleware = createAwpAuthMiddleware({
  pendingAuthStore,
  pubkeyStore,
  authInitPath: "/auth/init",
  authStatusPath: "/auth/status",
  authPagePath: "/auth/page",
});

// Auth portal uses the same greeting tool
const authPortal = createAgentWebPortal({
  name: "auth-portal",
  version: "1.0.0",
  description: "Auth-enabled portal for testing",
})
  .registerTool("secure_greet", {
    inputSchema: GreetInputSchema,
    outputSchema: GreetOutputSchema,
    description: "A secure greeting that requires authentication",
    handler: async ({ name, language }) => {
      const greetings: Record<string, string> = {
        en: `Hello, ${name}! (authenticated)`,
        es: `¡Hola, ${name}! (autenticado)`,
        fr: `Bonjour, ${name}! (authentifié)`,
        de: `Hallo, ${name}! (authentifiziert)`,
        ja: `こんにちは、${name}さん！(認証済み)`,
      };

      return {
        message: greetings[language ?? "en"] ?? greetings.en!,
        timestamp: new Date().toISOString(),
      };
    },
  })
  .build();

// =============================================================================
// 4. Blob-Enabled Portal (for testing blob handling)
// =============================================================================

// Input schema with blob field
const ProcessDocumentInputSchema = z.object({
  document: blob({ mimeType: "application/pdf", description: "PDF document to process" }),
  quality: z.number().min(1).max(100).default(80).describe("Output quality (1-100)"),
});

// Output schema with blob field
const ProcessDocumentOutputSchema = z.object({
  thumbnail: blob({ mimeType: "image/png", description: "Generated thumbnail" }),
  pageCount: z.number().describe("Number of pages in the document"),
  processedAt: z.string().describe("Processing timestamp"),
});

// Import blob tracking from separate module
import { recordBlobHandlerCall } from "./blob-tracker.ts";

const blobPortal = createAgentWebPortal({
  name: "blob-portal",
  version: "1.0.0",
  description: "Portal with blob-enabled tools for testing",
})
  .registerTool("process_document", {
    inputSchema: ProcessDocumentInputSchema,
    outputSchema: ProcessDocumentOutputSchema,
    description: "Process a PDF document and generate a thumbnail",
    handler: async ({ quality }, context) => {
      // Record the blob URLs for testing
      recordBlobHandlerCall({
        toolName: "process_document",
        inputBlobs: context?.blobs.input ?? {},
        outputBlobs: context?.blobs.output ?? {},
      });

      // Simulate document processing
      return {
        pageCount: 10,
        processedAt: new Date().toISOString(),
        // thumbnail placeholder - will be overwritten by framework with permanent URI
        thumbnail: "",
      };
    },
  })
  .registerTool("simple_tool", {
    // A tool without blobs for comparison
    inputSchema: z.object({
      message: z.string().describe("A simple message"),
    }),
    outputSchema: z.object({
      echo: z.string().describe("The echoed message"),
    }),
    description: "A simple tool without blobs",
    handler: async ({ message }) => ({
      echo: `Echo: ${message}`,
    }),
  })
  .build();

// =============================================================================
// 5. Unified HTTP Server
// =============================================================================

/**
 * Route request to the appropriate portal based on path prefix
 */
async function routeRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const pathname = url.pathname;

  // Health check
  if (pathname === "/health") {
    return new Response(JSON.stringify({ status: "ok" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // Basic portal routes: /basic or /basic/mcp
  if (pathname === "/basic" || pathname === "/basic/mcp") {
    return basicPortal.handleRequest(req);
  }

  // E-commerce portal routes: /ecommerce or /ecommerce/mcp
  if (pathname === "/ecommerce" || pathname === "/ecommerce/mcp") {
    return ecommercePortal.handleRequest(req);
  }

  // Auth portal routes
  if (pathname.startsWith("/auth")) {
    // Cast Request to AuthHttpRequest (compatible at runtime)
    const authReq: AuthHttpRequest = {
      method: req.method,
      url: req.url,
      headers: req.headers,
      text: () => req.clone().text(),
      clone: () => ({
        method: req.method,
        url: req.url,
        headers: req.headers,
        text: () => req.clone().text(),
        clone: () => authReq.clone(),
      }),
    };

    // Handle AWP auth endpoints (/auth/init, /auth/status)
    const authRouteResponse = await routeAuthRequest(authReq, {
      baseUrl: `http://localhost:${PORT}`,
      pendingAuthStore,
      pubkeyStore,
      authInitPath: "/auth/init",
      authStatusPath: "/auth/status",
      authPagePath: "/auth/page",
    });
    if (authRouteResponse) {
      return authRouteResponse;
    }

    // Auth page - simple login UI for testing
    // In production, this would be a real authentication page
    if (pathname === "/auth/page") {
      return new Response(getAuthPageHtml(), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // Handle login form submission
    if (pathname === "/auth/login" && req.method === "POST") {
      const formData = await req.formData();
      const username = formData.get("username") as string;
      const password = formData.get("password") as string;
      const verificationCode = formData.get("verification_code") as string;
      const pubkey = formData.get("pubkey") as string;

      // Built-in test users
      const testUsers: Record<string, { password: string; userId: string }> = {
        test: { password: "test123", userId: "test-user-001" },
        admin: { password: "admin123", userId: "admin-user-001" },
        demo: { password: "demo", userId: "demo-user-001" },
      };

      const user = testUsers[username];
      if (!user || user.password !== password) {
        return new Response(getAuthPageHtml("Invalid username or password"), {
          status: 401,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }

      // Complete authorization
      const result = await completeAuthorization(pubkey, verificationCode, user.userId, {
        pendingAuthStore,
        pubkeyStore,
      });

      if (result.success) {
        return new Response(getAuthSuccessHtml(), {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }

      return new Response(getAuthPageHtml(result.errorDescription ?? "Authorization failed"), {
        status: 400,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // Apply auth middleware for MCP endpoint
    if (pathname === "/auth" || pathname === "/auth/mcp") {
      const authResult = await authMiddleware(authReq);
      if (!authResult.authorized) {
        return authResult.challengeResponse!;
      }
      return authPortal.handleRequest(req);
    }
  }

  // Blob portal routes: /blob or /blob/mcp
  if (pathname === "/blob" || pathname === "/blob/mcp") {
    return blobPortal.handleRequest(req);
  }

  // Root route - show available portals
  if (pathname === "/") {
    return new Response(
      JSON.stringify({
        name: "Agent Web Portal - Example Server",
        portals: {
          basic: {
            endpoint: "/basic",
            description: "Basic greeting portal",
          },
          ecommerce: {
            endpoint: "/ecommerce",
            description: "E-commerce portal with shopping cart",
          },
          auth: {
            endpoint: "/auth",
            description: "Auth-enabled portal (requires AWP authentication)",
            authInit: "/auth/init",
            authStatus: "/auth/status",
          },
          blob: {
            endpoint: "/blob",
            description: "Blob-enabled portal (for testing blob handling)",
          },
        },
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  return new Response("Not Found", { status: 404 });
}

const server = Bun.serve({
  port: PORT,
  fetch: routeRequest,
});

console.log(`
🌐 Agent Web Portal - Unified Example Server
   URL: http://localhost:${PORT}

📡 Available Portals:

   1. Basic Greeting Portal
      POST http://localhost:${PORT}/basic
      Tools: greet
      Skills: greeting-assistant

   2. E-commerce Portal
      POST http://localhost:${PORT}/ecommerce
      Tools: search_products, manage_cart, checkout
      Skills: shopping-assistant, product-comparison

   3. Auth-Enabled Portal (requires AWP authentication)
      POST http://localhost:${PORT}/auth
      Auth Init: POST http://localhost:${PORT}/auth/init
      Auth Status: GET http://localhost:${PORT}/auth/status?pubkey=...
      Auth Page: http://localhost:${PORT}/auth/page
      Tools: secure_greet
      Auth: ECDSA P-256 keypair signature
      Test Users: test/test123, admin/admin123, demo/demo

   4. Blob-Enabled Portal
      POST http://localhost:${PORT}/blob
      Tools: process_document (with blob I/O), simple_tool

📋 Test Commands:

   # Initialize basic portal
   curl -X POST http://localhost:${PORT}/basic \\
     -H "Content-Type: application/json" \\
     -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}'

   # Initiate auth flow
   curl -X POST http://localhost:${PORT}/auth/init \\
     -H "Content-Type: application/json" \\
     -d '{"pubkey":"abc.def","client_name":"Test Client"}'

🧪 Run E2E Tests:
   bun test examples/e2e.test.ts

Press Ctrl+C to stop the server.
`);

// ============================================================================
// Auth Page HTML Templates
// ============================================================================

/**
 * Generate the login page HTML
 * This is a simple test UI - in production, use your own authentication system
 */
function getAuthPageHtml(error?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AWP Authorization</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      padding: 40px;
      width: 100%;
      max-width: 400px;
    }
    h1 {
      color: #333;
      font-size: 24px;
      margin-bottom: 8px;
      text-align: center;
    }
    .subtitle {
      color: #666;
      font-size: 14px;
      text-align: center;
      margin-bottom: 30px;
    }
    .verification-code {
      background: #f0f4ff;
      border: 2px dashed #667eea;
      border-radius: 8px;
      padding: 16px;
      text-align: center;
      margin-bottom: 24px;
    }
    .verification-code label {
      display: block;
      color: #666;
      font-size: 12px;
      margin-bottom: 8px;
    }
    .verification-code .code {
      font-family: 'SF Mono', Monaco, monospace;
      font-size: 28px;
      font-weight: bold;
      color: #667eea;
      letter-spacing: 4px;
    }
    .form-group {
      margin-bottom: 20px;
    }
    label {
      display: block;
      color: #333;
      font-size: 14px;
      font-weight: 500;
      margin-bottom: 6px;
    }
    input[type="text"], input[type="password"] {
      width: 100%;
      padding: 12px 16px;
      border: 2px solid #e0e0e0;
      border-radius: 8px;
      font-size: 16px;
      transition: border-color 0.2s;
    }
    input:focus {
      outline: none;
      border-color: #667eea;
    }
    button {
      width: 100%;
      padding: 14px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    button:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
    }
    .error {
      background: #fff0f0;
      border: 1px solid #ffcdd2;
      color: #c62828;
      padding: 12px;
      border-radius: 8px;
      margin-bottom: 20px;
      font-size: 14px;
    }
    .test-users {
      margin-top: 24px;
      padding-top: 20px;
      border-top: 1px solid #eee;
    }
    .test-users h3 {
      color: #666;
      font-size: 12px;
      text-transform: uppercase;
      margin-bottom: 8px;
    }
    .test-users code {
      display: block;
      background: #f5f5f5;
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 13px;
      margin-bottom: 4px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Authorize Application</h1>
    <p class="subtitle">Enter your credentials to authorize the MCP client</p>
    
    <div class="verification-code">
      <label>Verification Code from Client</label>
      <div class="code" id="display-code">---</div>
    </div>
    
    ${error ? `<div class="error">${error}</div>` : ""}
    
    <form method="POST" action="/auth/login">
      <input type="hidden" name="verification_code" id="verification_code" value="">
      <input type="hidden" name="pubkey" id="pubkey" value="">
      
      <div class="form-group">
        <label for="username">Username</label>
        <input type="text" id="username" name="username" required autocomplete="username">
      </div>
      
      <div class="form-group">
        <label for="password">Password</label>
        <input type="password" id="password" name="password" required autocomplete="current-password">
      </div>
      
      <button type="submit">Authorize</button>
    </form>
    
    <div class="test-users">
      <h3>Test Accounts</h3>
      <code>test / test123</code>
      <code>admin / admin123</code>
      <code>demo / demo</code>
    </div>
  </div>
  
  <script>
    // Parse URL parameters
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code') || '';
    const pubkey = params.get('pubkey') || '';
    
    document.getElementById('display-code').textContent = code || '---';
    document.getElementById('verification_code').value = code;
    document.getElementById('pubkey').value = pubkey;
  </script>
</body>
</html>`;
}

/**
 * Generate the success page HTML
 */
function getAuthSuccessHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Authorization Complete</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      padding: 60px 40px;
      width: 100%;
      max-width: 400px;
      text-align: center;
    }
    .checkmark {
      width: 80px;
      height: 80px;
      background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 24px;
    }
    .checkmark svg {
      width: 40px;
      height: 40px;
      stroke: white;
      stroke-width: 3;
      fill: none;
    }
    h1 {
      color: #333;
      font-size: 24px;
      margin-bottom: 12px;
    }
    p {
      color: #666;
      font-size: 16px;
      line-height: 1.5;
    }
    .note {
      margin-top: 24px;
      padding: 16px;
      background: #f0fdf4;
      border-radius: 8px;
      color: #166534;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="checkmark">
      <svg viewBox="0 0 24 24">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
    </div>
    <h1>Authorization Complete!</h1>
    <p>The MCP client has been authorized. You can close this window and return to your application.</p>
    <div class="note">
      The client is now polling for authorization status and will automatically detect this approval.
    </div>
  </div>
</body>
</html>`;
}

export { server, basicPortal, ecommercePortal, authPortal, blobPortal, pendingAuthStore, pubkeyStore, PORT };
