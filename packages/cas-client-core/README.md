# @agent-web-portal/cas-client-core

Platform-agnostic core types and utilities for CAS (Content-Addressable Storage) clients.

## Overview

This package provides:

- **Type definitions** - Node types, auth types, blob references
- **Stream abstraction** - `AsyncIterable<Uint8Array>` based streaming interface
- **Blob ref utilities** - Create and parse `CasBlobRef` objects
- **Path resolution** - Resolve paths like `.` and `./path/to/file` within collections

## Installation

```bash
npm install @agent-web-portal/cas-client-core
```

## Usage

### Blob References

```typescript
import { createBlobRef, parseBlobRef, resolvePath } from "@agent-web-portal/cas-client-core";

// Create a blob reference
const ref = createBlobRef(
  "https://cas.example.com/api/cas/usr_123/ticket/tkt_abc",
  "sha256:...",
  "."
);
// { "#cas-endpoint": "...", "cas-node": "sha256:...", "path": "." }

// Parse endpoint URL
const { baseUrl, shard, ticketId } = parseEndpoint(ref["#cas-endpoint"]);
```

### Path Syntax

- `.` - The node itself (for file nodes)
- `./path/to/file` - Child path within a collection

## Platform-specific Packages

- `@agent-web-portal/cas-client-nodejs` - Node.js implementation with fs-based caching
- `@agent-web-portal/cas-client-browser` - Browser implementation with IndexedDB caching
