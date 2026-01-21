/**
 * Unified Example Server for Agent Web Portal
 *
 * Runs all example portals on a single server with different routes:
 * - /basic/*   -> Basic greeting portal
 * - /ecommerce/* -> E-commerce portal
 *
 * Run with: bun run examples/server.ts
 * Test with: bun test examples/e2e.test.ts
 */

import { z } from "zod";
import { createAgentWebPortal } from "../index.ts";

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
  .registerSkill("greeting-assistant", {
    url: "/skills/greeting-assistant.md",
    frontmatter: {
      name: "Greeting Assistant",
      description: "A skill for greeting users in multiple languages",
      version: "1.0.0",
      "allowed-tools": ["greet"],
    },
    markdown: `
# Greeting Assistant

This skill helps you greet users in their preferred language.

## Usage

Use the {{greet}} tool to generate personalized greetings.

### Supported Languages
- English (en)
- Spanish (es)
- French (fr)
- German (de)
- Japanese (ja)
    `.trim(),
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
  .registerSkill("shopping-assistant", {
    url: "/skills/shopping-assistant.md",
    frontmatter: {
      name: "Shopping Assistant",
      description: "Complete e-commerce shopping flow",
      version: "2.0.0",
      "allowed-tools": ["search_products", "manage_cart", "checkout"],
    },
    markdown: `
# Shopping Assistant

Help users find and purchase products.

## Available Actions

1. **Search**: Use {{search_products}} to find products
2. **Cart**: Use {{manage_cart}} to add/remove items
3. **Checkout**: Use {{checkout}} to complete purchase
    `.trim(),
  })
  .registerSkill("product-comparison", {
    url: "/skills/product-comparison.md",
    frontmatter: {
      name: "Product Comparison",
      description: "Compare products across sources",
      version: "1.0.0",
      "allowed-tools": [
        "search_products",
        "external_reviews:get_reviews", // Cross-MCP reference
      ],
    },
    markdown: `
# Product Comparison

Compare products using local search and external reviews.

- Use {{search_products}} to find products locally
- Use {{external_reviews:get_reviews}} to fetch external reviews
    `.trim(),
  })
  .build();

// =============================================================================
// 3. Unified HTTP Server
// =============================================================================

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

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

📋 Test Commands:

   # Initialize basic portal
   curl -X POST http://localhost:${PORT}/basic \\
     -H "Content-Type: application/json" \\
     -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}'

   # List tools (basic)
   curl -X POST http://localhost:${PORT}/basic \\
     -H "Content-Type: application/json" \\
     -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'

   # Call greet tool
   curl -X POST http://localhost:${PORT}/basic \\
     -H "Content-Type: application/json" \\
     -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"greet","arguments":{"name":"World","language":"es"}}}'

   # Initialize ecommerce portal
   curl -X POST http://localhost:${PORT}/ecommerce \\
     -H "Content-Type: application/json" \\
     -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}'

   # Search products
   curl -X POST http://localhost:${PORT}/ecommerce \\
     -H "Content-Type: application/json" \\
     -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"search_products","arguments":{"query":"laptop","limit":5}}}'

🧪 Run E2E Tests:
   bun test examples/e2e.test.ts

Press Ctrl+C to stop the server.
`);

export { server, basicPortal, ecommercePortal, PORT };
