/**
 * Agent Web Portal Client SDK
 *
 * Provides a client for interacting with AWP servers, with automatic
 * blob handling through presigned URLs and keypair-based authentication.
 *
 * Platform-specific storage implementations are in separate packages:
 * - @agent-web-portal/client-nodejs: FileKeyStorage
 * - @agent-web-portal/client-browser: IndexedDBKeyStorage, LocalStorageKeyStorage, auth window utilities
 * - @agent-web-portal/client-react: React hooks for auth and client
 *
 * @example
 * ```typescript
 * // Node.js usage
 * import { AwpClient, AwpAuth } from "@agent-web-portal/client";
 * import { FileKeyStorage } from "@agent-web-portal/client-nodejs";
 *
 * const auth = new AwpAuth({
 *   clientName: "My AI Agent",
 *   keyStorage: new FileKeyStorage({ directory: "~/.awp/keys" }),
 *   callbacks: {
 *     onAuthRequired: async (challenge) => {
 *       console.log("Visit:", challenge.authUrl);
 *       console.log("Code:", challenge.verificationCode);
 *       return true;
 *     },
 *   },
 * });
 *
 * // Browser usage
 * import { AwpClient, AwpAuth } from "@agent-web-portal/client";
 * import { IndexedDBKeyStorage } from "@agent-web-portal/client-browser";
 *
 * const auth = new AwpAuth({
 *   clientName: "My Web App",
 *   keyStorage: new IndexedDBKeyStorage(),
 * });
 * ```
 */

// Auth exports
export {
  // Types
  type AuthCallbacks,
  type AuthChallenge,
  type AuthChallengeResponse,
  AwpAuth,
  AwpAuthError,
  type AwpAuthOptions,
  type AwpKeyPair,
  type BuildAuthUrlParams,
  // Crypto utilities
  generateKeyPair,
  type KeyStorage,
  // Key storage implementations (in-memory only, for testing)
  MemoryKeyStorage,
  type PollAuthStatusOptions,
  type PollAuthStatusResult,
  // Standalone poll function
  pollAuthStatus,
  type SignedHeaders,
  type StoredKeyData,
  signRequest,
} from "./auth/index.ts";
// Blob interceptor exports
export {
  BlobInterceptor,
  type BlobInterceptorOptions,
  type ExtendedBlobContext,
  type ToolBlobSchema,
} from "./blob-interceptor.ts";
// Client exports
export {
  AwpClient,
  type AwpClientOptions,
  type AwpToolSchema,
  type ToolCallResult,
} from "./client.ts";
// Schema transform exports
export {
  type BlobSchemaInfo,
  extractBlobSchemaInfo,
  transformSchemaToLlmFacing,
  transformToolToLlmFacing,
} from "./schema-transform.ts";
export { S3StorageProvider, type S3StorageProviderOptions } from "./storage/s3.ts";
// Storage provider exports
export type { PresignedUrlOptions, PresignedUrlPair, StorageProvider } from "./storage/types.ts";
