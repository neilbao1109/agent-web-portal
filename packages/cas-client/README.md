# @anthropic/cas-client-nodejs

Node.js client for Content-Addressable Storage (CAS) with filesystem-based caching.

## Features

- **Three authentication modes**: User Token, Agent Token, Ticket
- **Streaming read/write**: Handle large files using AsyncIterable streams
- **Client-side chunking**: Automatic chunking based on server-configured threshold
- **Local caching**: FileSystemStorageProvider for caching data on disk
- **Collection support**: Upload directory-like structures with hard link support
- **Blob references**: Create and parse `CasBlobRef` for MCP/Tool exchange

## Installation

```bash
npm install @anthropic/cas-client-nodejs
```

## Usage

### Basic Usage

```typescript
import { CasClient } from "@anthropic/cas-client-nodejs";

// Create client with user token
const cas = CasClient.fromUserToken("https://cas.example.com", "user_token");

// Or from a #cas-endpoint URL (from CasBlobRef)
const cas = CasClient.fromEndpoint("https://cas.example.com/api/cas/usr_123/ticket/tkt_abc");

// Or from a CasBlobContext (in Tool handlers)
const cas = CasClient.fromContext(context.cas);

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

### With Local Cache

```typescript
import { CasClient, FileSystemStorageProvider } from "@anthropic/cas-client-nodejs";

const storage = new FileSystemStorageProvider("/tmp/cas-cache");
const cas = CasClient.fromContext(context.cas, storage);

// Subsequent reads will use cache
const handle = await cas.openFile("sha256:abc123...");
```

### Upload Collection

```typescript
const key = await cas.putCollection(async (path) => {
  if (path === "/") {
    return { type: "collection", children: ["image.png", "data.json"] };
  }
  if (path === "/image.png") {
    return { type: "file", content: imageBuffer, contentType: "image/png" };
  }
  if (path === "/data.json") {
    return { type: "file", content: jsonBuffer, contentType: "application/json" };
  }
  return null;
});
```

### Hard Links

```typescript
const key = await cas.putCollection(async (path) => {
  if (path === "/") {
    return { type: "collection", children: ["original.png", "copy.png"] };
  }
  if (path === "/original.png") {
    return { type: "file", content: buffer, contentType: "image/png" };
  }
  if (path === "/copy.png") {
    // Link to existing key - no data duplication
    return { type: "link", target: "sha256:abc123..." };
  }
  return null;
});
```

## API

### CasClient

#### Static Factory Methods

- `CasClient.fromUserToken(endpoint, token)` - Create client with user token
- `CasClient.fromAgentToken(endpoint, token)` - Create client with agent token
- `CasClient.fromTicket(endpoint, ticketId)` - Create client with ticket
- `CasClient.fromContext(context, storage?)` - Create client from CasBlobContext

#### Read Methods

- `getNode(key)` - Get application layer node (CasNode)
- `getRawNode(key)` - Get storage layer node (CasRawNode)
- `openFile(key)` - Open file for streaming read
- `getChunkStream(key)` - Get chunk data as stream

#### Write Methods

- `putFile(content, contentType)` - Upload file (auto-chunks)
- `putCollection(resolver)` - Upload collection structure

### CasFileHandle

- `key` - CAS key
- `size` - Total size in bytes
- `contentType` - MIME type
- `stream()` - Get readable stream
- `buffer()` - Read to buffer
- `slice(start, end)` - Range read

### LocalStorageProvider

Interface for local caching. Use `FileSystemStorageProvider` for file-based cache.

## License

MIT
