# @agent-web-portal/awp-client-nodejs

Node.js-specific AWP client with CAS-based blob exchange and filesystem caching.

## Overview

This package provides a Node.js-optimized AWP client that uses CAS (Content-Addressable Storage) for blob exchange. It includes:

- All exports from `@agent-web-portal/awp-client-core`
- `FileSystemStorageProvider` for local CAS caching
- Node.js-specific utilities and stream conversions

## Installation

```bash
npm install @agent-web-portal/awp-client-nodejs
```

## Usage

### Basic Usage

```typescript
import { AwpClient, FileSystemStorageProvider } from "@agent-web-portal/awp-client-nodejs";

const client = new AwpClient({
  endpoint: "https://my-awp-server.com",
  casEndpoint: "https://cas.example.com/api",
  casStorage: new FileSystemStorageProvider("~/.cache/awp-cas"),
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
import { createNodejsAwpClient } from "@agent-web-portal/awp-client-nodejs";

// Creates a client with filesystem caching enabled by default
const client = createNodejsAwpClient({
  endpoint: "https://my-awp-server.com",
  casEndpoint: "https://cas.example.com/api",
});
```

### With Authentication

```typescript
import { AwpAuth } from "@agent-web-portal/client";
import { FileKeyStorage } from "@agent-web-portal/client-nodejs";
import { createNodejsAwpClient } from "@agent-web-portal/awp-client-nodejs";

const auth = new AwpAuth({
  clientName: "My AI Agent",
  keyStorage: new FileKeyStorage({ directory: "~/.awp/keys" }),
});

const client = createNodejsAwpClient({
  endpoint: "https://my-awp-server.com",
  casEndpoint: "https://cas.example.com/api",
  auth,
});
```

## Stream Utilities

The package also exports stream conversion utilities from `cas-client-nodejs`:

```typescript
import {
  bufferToByteStream,
  byteStreamToBuffer,
  readableToByteStream,
  byteStreamToReadable,
} from "@agent-web-portal/awp-client-nodejs";

// Convert Buffer to ByteStream
const stream = bufferToByteStream(buffer);

// Convert ByteStream back to Buffer
const buffer = await byteStreamToBuffer(stream);

// Convert Node.js Readable to ByteStream
const byteStream = readableToByteStream(readable);
```

## License

MIT
