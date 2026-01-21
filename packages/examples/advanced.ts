/**
 * Advanced Example: Multiple Tools and Cross-MCP References
 *
 * This example demonstrates:
 * - Multiple tool registration
 * - Skills with multiple tool dependencies
 * - Cross-MCP tool references (mcp_alias:tool_name format)
 * - Skill validation at build time
 *
 * Run with: bun run examples/advanced.ts
 */

import { createAgentWebPortal } from "@agent-web-portal/core";
import { z } from "zod";

// =============================================================================
// 1. Define Multiple Tool Schemas
// =============================================================================

// Search Tool
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

// Cart Tool
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

// Checkout Tool
const CheckoutInputSchema = z.object({
  shippingAddress: z.string(),
  paymentMethod: z.enum(["card", "paypal", "crypto"]),
});

const CheckoutOutputSchema = z.object({
  orderId: z.string(),
  status: z.enum(["pending", "confirmed", "failed"]),
  estimatedDelivery: z.string().optional(),
});

// =============================================================================
// 2. Create Portal with Multiple Tools
// =============================================================================

// Simulated cart state
const cartItems: Map<string, number> = new Map();

const portal = createAgentWebPortal({
  name: "ecommerce-portal",
  version: "2.0.0",
  description: "E-commerce Agent Web Portal",
})
  // Search Tool
  .registerTool("search_products", {
    inputSchema: SearchInputSchema,
    outputSchema: SearchOutputSchema,
    description: "Search for products in the catalog",
    handler: async ({ query, limit }) => {
      // Simulated search results
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
  // Cart Tool
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
  // Checkout Tool
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
  // Register all skills at once
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
// 3. Start HTTP Server for E2E Testing
// =============================================================================

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

const _server = Bun.serve({
  port: PORT,
  fetch: async (req) => {
    const url = new URL(req.url);

    // Route MCP requests to the portal
    if (url.pathname === "/mcp" || url.pathname === "/") {
      return portal.handleRequest(req);
    }

    // Health check
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ status: "ok" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`
🛒 E-commerce Agent Web Portal is running!
   URL: http://localhost:${PORT}

📡 MCP Endpoints:
   POST http://localhost:${PORT}/mcp

   Available methods:
   - initialize
   - tools/list
   - tools/call
   - skills/list

🔧 Registered Tools:`);

const tools = portal.listTools();
for (const tool of tools.tools) {
  console.log(`   - ${tool.name}: ${tool.description}`);
}

console.log("\n📚 Registered Skills:");
const skills = portal.listSkills();
for (const [name, skill] of Object.entries(skills)) {
  console.log(`   - ${name}`);
  console.log(`     URL: ${skill.url}`);
  console.log(`     Tools: ${skill.frontmatter["allowed-tools"]?.join(", ")}`);
}

console.log(`
📋 E2E Test Commands:

   # Initialize
   curl -X POST http://localhost:${PORT}/mcp \\
     -H "Content-Type: application/json" \\
     -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}'

   # List tools
   curl -X POST http://localhost:${PORT}/mcp \\
     -H "Content-Type: application/json" \\
     -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'

   # List skills
   curl -X POST http://localhost:${PORT}/mcp \\
     -H "Content-Type: application/json" \\
     -d '{"jsonrpc":"2.0","id":3,"method":"skills/list"}'

   # Search products
   curl -X POST http://localhost:${PORT}/mcp \\
     -H "Content-Type: application/json" \\
     -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"search_products","arguments":{"query":"laptop","limit":5}}}'

   # Add to cart
   curl -X POST http://localhost:${PORT}/mcp \\
     -H "Content-Type: application/json" \\
     -d '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"manage_cart","arguments":{"action":"add","productId":"LAPTOP-001","quantity":2}}}'

   # Checkout
   curl -X POST http://localhost:${PORT}/mcp \\
     -H "Content-Type: application/json" \\
     -d '{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"checkout","arguments":{"shippingAddress":"123 Main St","paymentMethod":"card"}}}'

Press Ctrl+C to stop the server.
`);
