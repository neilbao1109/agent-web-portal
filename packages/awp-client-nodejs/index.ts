/**
 * @agent-web-portal/awp-client-nodejs
 *
 * Node.js-specific AWP client with CAS-based blob exchange and filesystem caching.
 *
 * This package provides:
 * - Re-exports from awp-client-core
 * - FileSystemStorageProvider from cas-client-nodejs for local CAS caching
 * - Node.js-specific utilities and defaults
 *
 * @example
 * ```typescript
 * import { AwpClient, FileSystemStorageProvider } from "@agent-web-portal/awp-client-nodejs";
 *
 * const client = new AwpClient({
 *   endpoint: "https://my-awp-server.com",
 *   casEndpoint: "https://cas.example.com/api",
 *   casStorage: new FileSystemStorageProvider("~/.cache/awp-cas"),
 * });
 *
 * const result = await client.callTool("process-image", {
 *   image: { "cas-node": "sha256:abc123...", path: "." },
 * });
 * ```
 */

// Re-export everything from core
export * from "@agent-web-portal/awp-client-core";

// Re-export Node.js-specific CAS utilities
export {
  bufferToByteStream,
  byteStreamToBuffer,
  byteStreamToReadable,
  FileSystemStorageProvider,
  readableToByteStream,
} from "@agent-web-portal/cas-client-nodejs";

// Node.js-specific utilities
export { createNodejsAwpClient, type NodejsAwpClientOptions } from "./src/defaults.ts";
