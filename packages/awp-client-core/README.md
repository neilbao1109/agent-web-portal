# @agent-web-portal/awp-client-core

Platform-agnostic AWP client with CAS-based blob exchange for Agent Web Portal.

## Overview

This package provides the core implementation of the AWP client that uses CAS (Content-Addressable Storage) for blob exchange instead of S3 presigned URLs.

## Installation

```bash
npm install @agent-web-portal/awp-client-core
```

For platform-specific implementations with local caching:
- Browser: `@agent-web-portal/awp-client-browser`
- Node.js: `@agent-web-portal/awp-client-nodejs`

## Usage

```typescript
import { AwpClient } from "@agent-web-portal/awp-client-core";

const client = new AwpClient({
  endpoint: "https://my-awp-server.com",
  casEndpoint: "https://cas.example.com/api",
});

// Initialize (optional, verifies connectivity)
await client.initialize();

// List available tools
const { tools } = await client.listTools();

// Call a tool with blob input
const result = await client.callTool("process-image", {
  image: { "cas-node": "sha256:abc123...", path: "." },
  options: { quality: 80 },
});

console.log(result.output);  // Non-blob output fields
console.log(result.blobs);   // { result: { "cas-node": "sha256:def456..." } }
```

## CAS Blob Exchange

This client automatically handles CAS blob exchange:

1. **Input blobs**: LLM provides `{ "cas-node": "sha256:...", path?: "." }`
2. **Client creates tickets**: Generates CAS tickets with appropriate scopes
3. **Tool receives**: `{ "#cas-endpoint": "https://...", "cas-node": "...", path: "." }`
4. **Tool returns**: `{ "cas-node": "sha256:..." }`
5. **LLM receives**: `{ "cas-node": "sha256:..." }`

## Configuration

```typescript
interface AwpClientOptions {
  // AWP server endpoint (required)
  endpoint: string;

  // CAS server endpoint (required)
  casEndpoint: string;

  // Authentication handler (optional)
  auth?: AwpAuth;

  // CAS local storage provider for caching (optional)
  casStorage?: LocalStorageProvider;

  // Additional headers (optional)
  headers?: Record<string, string>;

  // Custom fetch function (optional)
  fetch?: typeof fetch;
}
```

## License

MIT
