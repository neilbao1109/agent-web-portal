/**
 * CAS Client for Browsers
 *
 * A streaming-capable client for Content-Addressable Storage (CAS).
 * Supports three authentication modes: User Token, Agent Token, and Ticket.
 *
 * This package provides browser-specific implementations:
 * - IndexedDBStorageProvider for local caching
 * - Stream conversion utilities between Web ReadableStream and ByteStream
 *
 * For platform-agnostic code, use @agent-web-portal/cas-client-core directly.
 */

// Re-export everything from core
export * from "@agent-web-portal/cas-client-core";

// Browser-specific exports
export { IndexedDBStorageProvider } from "./storage.ts";
export {
  arrayBufferToByteStream,
  blobToByteStream,
  byteStreamToArrayBuffer,
  byteStreamToBlob,
  byteStreamToReadableStream,
  readableStreamToByteStream,
} from "./streams.ts";
