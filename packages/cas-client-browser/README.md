# @anthropic/cas-client-browser

Browser client for Content-Addressable Storage (CAS) with IndexedDB-based caching.

## Features

- **Three authentication modes**: User Token, Agent Token, Ticket
- **Streaming read/write**: Handle large files using Web ReadableStream
- **Client-side chunking**: Automatic chunking based on server-configured threshold
- **Local caching**: IndexedDBStorageProvider for caching data in browser
- **Blob references**: Create and parse `CasBlobRef` for MCP/Tool exchange

## Installation

```bash
npm install @anthropic/cas-client-browser
```

## Usage

### Basic Usage

```typescript
import { CasClient } from "@anthropic/cas-client-browser";

// Create client with user token
const cas = CasClient.fromUserToken("https://cas.example.com", "user_token");

// Or from a #cas-endpoint URL (from CasBlobRef)
const cas = CasClient.fromEndpoint("https://cas.example.com/api/cas/usr_123/ticket/tkt_abc");

// Read a file
const handle = await cas.openFile("sha256:abc123...");
console.log(handle.size, handle.contentType);

// Stream content (returns AsyncIterable<Uint8Array>)
const stream = await handle.stream();
for await (const chunk of stream) {
  // process chunk
}

// Or read to Uint8Array (small files only)
const bytes = await handle.bytes();

// Upload a file
const key = await cas.putFile(bytes, "image/png");
```

### With IndexedDB Cache

```typescript
import { CasClient, IndexedDBStorageProvider } from "@anthropic/cas-client-browser";

// Create storage provider (uses IndexedDB)
const storage = new IndexedDBStorageProvider("my-cas-cache");

// Create client with cache
const cas = CasClient.fromUserToken(
  "https://cas.example.com",
  "user_token",
  storage
);
```

### Stream Conversion

```typescript
import { byteStreamToReadableStream, readableStreamToByteStream } from "@anthropic/cas-client-browser";

// Convert ByteStream to Web ReadableStream
const stream = await handle.stream();
const webStream = byteStreamToReadableStream(stream);

// Use with fetch Response
const response = new Response(webStream);
const blob = await response.blob();

// Convert Web ReadableStream to ByteStream
const byteStream = readableStreamToByteStream(webStream);
```

## Related Packages

- `@anthropic/cas-client-core` - Platform-agnostic types and utilities
- `@anthropic/cas-client-nodejs` - Node.js implementation with filesystem caching
