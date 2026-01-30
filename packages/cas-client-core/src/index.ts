/**
 * CAS Client Core
 *
 * Platform-agnostic types and utilities for CAS clients
 */

// Client
export { CasClient } from "./client.ts";

// Blob reference utilities
export {
  buildEndpoint,
  createBlobRef,
  extractPaths,
  isBlobRef,
  parseEndpoint,
  resolvePath,
  resolvePathRaw,
} from "./blob-ref.ts";

// Hash utilities
export { computeChunkKeys, computeKey, extractHash, isValidKey } from "./hash.ts";

// Stream utilities
export {
  bytesAsStream,
  chunksAsStream,
  collectBytes,
  concatBytes,
  concatStreamFactories,
  concatStreams,
  needsChunking,
  sliceStream,
  splitIntoChunks,
} from "./stream.ts";

// Types
export type {
  ByteStream,
  ByteStreamFactory,
  CasAuth,
  CasBlobContext,
  CasBlobRef,
  CasClientConfig,
  CasCollectionNode,
  CasConfigResponse,
  CasFileHandle,
  CasFileNode,
  CasNode,
  CasRawChunkNode,
  CasRawCollectionNode,
  CasRawFileNode,
  CasRawNode,
  LocalStorageProvider,
  NodeKind,
  ParsedEndpoint,
  PathResolution,
  PathResolver,
  PutChunkResponse,
  PutCollectionResponse,
  PutFileResponse,
} from "./types.ts";
