/**
 * @agent-web-portal/awp-client-browser
 *
 * Browser-specific AWP client with CAS-based blob exchange and IndexedDB caching.
 *
 * This package provides:
 * - Re-exports from awp-client-core
 * - IndexedDBStorageProvider from cas-client-browser for local CAS caching
 * - Browser-specific utilities and defaults
 *
 * @example
 * ```typescript
 * import { AwpClient, IndexedDBStorageProvider } from "@agent-web-portal/awp-client-browser";
 *
 * const client = new AwpClient({
 *   endpoint: "https://my-awp-server.com",
 *   casEndpoint: "https://cas.example.com/api",
 *   casStorage: new IndexedDBStorageProvider(),
 * });
 *
 * const result = await client.callTool("process-image", {
 *   image: { "cas-node": "sha256:abc123...", path: "." },
 * });
 * ```
 */

// Re-export everything from core
export * from "@agent-web-portal/awp-client-core";

// Re-export browser-specific CAS utilities
export {
  arrayBufferToByteStream,
  blobToByteStream,
  byteStreamToArrayBuffer,
  byteStreamToBlob,
  byteStreamToReadableStream,
  IndexedDBStorageProvider,
  readableStreamToByteStream,
} from "@agent-web-portal/cas-client-browser";

// Browser-specific utilities
export { type BrowserAwpClientOptions, createBrowserAwpClient } from "./defaults.ts";
