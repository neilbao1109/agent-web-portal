/**
 * CAS Client for Node.js
 *
 * A streaming-capable client for Content-Addressable Storage (CAS).
 * Supports three authentication modes: User Token, Agent Token, and Ticket.
 *
 * This package provides Node.js-specific implementations:
 * - FileSystemStorageProvider for local caching
 * - Stream conversion utilities between Node.js Readable and ByteStream
 *
 * For platform-agnostic code, use @agent-web-portal/cas-client-core directly.
 */

// Re-export everything from core
export * from "@agent-web-portal/cas-client-core";

// Node.js-specific exports
export { FileSystemStorageProvider } from "./src/storage.ts";
export {
  bufferToByteStream,
  byteStreamToBuffer,
  byteStreamToReadable,
  readableToByteStream,
} from "./src/streams.ts";
