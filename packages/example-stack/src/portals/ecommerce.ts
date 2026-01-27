/**
 * E-commerce Portal
 *
 * Demonstrates shopping cart, product search, and checkout functionality.
 */

import { createAgentWebPortal } from "@agent-web-portal/core";
import { z } from "zod";

// =============================================================================
// Schemas
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

// =============================================================================
// Cart State (in-memory for demo)
// =============================================================================

const cartItems: Map<string, number> = new Map();

// =============================================================================
// Portal Definition
// =============================================================================

export const ecommercePortal = createAgentWebPortal({
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
  .build();
