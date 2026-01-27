---
name: Shopping Flow
description: Complete e-commerce shopping workflow from product search to checkout
version: 1.0.0
allowed-tools:
  - search_products
  - manage_cart
  - checkout
---

# Shopping Flow Skill

This skill provides a complete e-commerce shopping experience using three tools: product search, cart management, and checkout.

## Overview

The shopping flow consists of three main steps:
1. **Search Products** - Find products by name, category, or filters
2. **Manage Cart** - Add, remove, or view items in the shopping cart
3. **Checkout** - Complete the purchase with shipping and payment details

## Usage Examples

### Example 1: Search for Products

```json
{
  "name": "search_products",
  "arguments": {
    "query": "laptop",
    "category": "electronics",
    "maxPrice": 1500
  }
}
```

**Result:**
```json
{
  "products": [
    {
      "id": "prod-001",
      "name": "ProBook Laptop 15",
      "price": 999.99,
      "category": "electronics",
      "inStock": true
    }
  ],
  "totalResults": 1
}
```

### Example 2: Add Item to Cart

```json
{
  "name": "manage_cart",
  "arguments": {
    "action": "add",
    "productId": "prod-001",
    "quantity": 1
  }
}
```

**Result:**
```json
{
  "cart": {
    "items": [
      {
        "productId": "prod-001",
        "name": "ProBook Laptop 15",
        "quantity": 1,
        "price": 999.99
      }
    ],
    "total": 999.99
  },
  "message": "Item added to cart"
}
```

### Example 3: View Cart

```json
{
  "name": "manage_cart",
  "arguments": {
    "action": "list"
  }
}
```

### Example 4: Complete Checkout

```json
{
  "name": "checkout",
  "arguments": {
    "shippingAddress": {
      "street": "123 Main St",
      "city": "Seattle",
      "state": "WA",
      "zipCode": "98101",
      "country": "USA"
    },
    "paymentMethod": "credit_card"
  }
}
```

**Result:**
```json
{
  "orderId": "order-abc123",
  "status": "confirmed",
  "estimatedDelivery": "2026-02-03T12:00:00.000Z"
}
```

## Tool Reference

### search_products

Search for products in the catalog.

**Input:**
- `query` (string, optional): Search query
- `category` (string, optional): Product category filter
- `minPrice` (number, optional): Minimum price filter
- `maxPrice` (number, optional): Maximum price filter

**Output:**
- `products` (array): List of matching products
- `totalResults` (number): Total count of results

### manage_cart

Manage the shopping cart.

**Input:**
- `action` (string, required): One of "add", "remove", "list", "clear"
- `productId` (string, optional): Product ID (required for add/remove)
- `quantity` (number, optional): Quantity (for add action)

**Output:**
- `cart` (object): Current cart state
- `message` (string): Action result message

### checkout

Complete the checkout process.

**Input:**
- `shippingAddress` (object, required): Shipping address details
- `paymentMethod` (string, required): Payment method

**Output:**
- `orderId` (string): Generated order ID
- `status` (string): Order status
- `estimatedDelivery` (string): Estimated delivery date
