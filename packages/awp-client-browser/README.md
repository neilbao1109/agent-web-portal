# @agent-web-portal/awp-client-browser

Browser-specific AWP client with CAS-based blob exchange and IndexedDB caching.

## Overview

This package provides a browser-optimized AWP client that uses CAS (Content-Addressable Storage) for blob exchange. It includes:

- All exports from `@agent-web-portal/awp-client-core`
- `IndexedDBStorageProvider` for local CAS caching
- Browser-specific utilities and stream conversions

## Installation

```bash
npm install @agent-web-portal/awp-client-browser
```

## Usage

### Basic Usage

```typescript
import { AwpClient, IndexedDBStorageProvider } from "@agent-web-portal/awp-client-browser";

const client = new AwpClient({
  endpoint: "https://my-awp-server.com",
  casEndpoint: "https://cas.example.com/api",
  casStorage: new IndexedDBStorageProvider(),
});

// Call a tool
const result = await client.callTool("process-image", {
  image: { "cas-node": "sha256:abc123...", path: "." },
});

console.log(result.output);
console.log(result.blobs);
```

### Using the Factory Function

```typescript
import { createBrowserAwpClient } from "@agent-web-portal/awp-client-browser";

// Creates a client with IndexedDB caching enabled by default
const client = createBrowserAwpClient({
  endpoint: "https://my-awp-server.com",
  casEndpoint: "https://cas.example.com/api",
});
```

### With Authentication

```typescript
import { AwpAuth } from "@agent-web-portal/client";
import { IndexedDBKeyStorage } from "@agent-web-portal/client-browser";
import { createBrowserAwpClient } from "@agent-web-portal/awp-client-browser";

const auth = new AwpAuth({
  clientName: "My Web App",
  keyStorage: new IndexedDBKeyStorage(),
});

const client = createBrowserAwpClient({
  endpoint: "https://my-awp-server.com",
  casEndpoint: "https://cas.example.com/api",
  auth,
});
```

## Stream Utilities

The package also exports stream conversion utilities from `cas-client-browser`:

```typescript
import {
  blobToByteStream,
  byteStreamToBlob,
  readableStreamToByteStream,
  byteStreamToReadableStream,
} from "@agent-web-portal/awp-client-browser";

// Convert a File/Blob to ByteStream
const stream = blobToByteStream(file);

// Convert ByteStream back to Blob
const blob = await byteStreamToBlob(stream, "image/png");
```

## License

MIT
