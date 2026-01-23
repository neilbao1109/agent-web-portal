/**
 * Agent Web Portal Client SDK
 *
 * Provides a client for interacting with AWP servers, with automatic
 * blob handling through presigned URLs and keypair-based authentication.
 *
 * @example
 * ```typescript
 * import { AwpClient, AwpAuth, FileKeyStorage, S3StorageProvider } from "@agent-web-portal/client";
 *
 * // Create auth handler
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
 * const client = new AwpClient({
 *   endpoint: "https://my-awp-server.com",
 *   auth,
 *   storage: new S3StorageProvider({
 *     region: "us-east-1",
 *     bucket: "my-bucket",
 *   }),
 * });
 *
 * // Call a tool with automatic blob handling
 * const result = await client.callTool("process-document", {
 *   document: "s3://my-bucket/input/doc.pdf",
 *   options: { quality: 80 },
 * });
 *
 * console.log(result.thumbnail); // s3://my-bucket/output/thumb.png
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
  // Key storage implementations
  FileKeyStorage,
  // Crypto utilities
  generateKeyPair,
  generateNonce,
  type KeyStorage,
  LocalStorageKeyStorage,
  MemoryKeyStorage,
  type SignedHeaders,
  type StoredKeyData,
  signRequest,
} from "./auth/index.ts";
// Blob interceptor exports
export {
  BlobInterceptor,
  type BlobInterceptorOptions,
  type ToolBlobSchema,
} from "./blob-interceptor.ts";
// Client exports
export { AwpClient, type AwpClientOptions } from "./client.ts";
export { S3StorageProvider, type S3StorageProviderOptions } from "./storage/s3.ts";
// Storage provider exports
export type { PresignedUrlPair, StorageProvider } from "./storage/types.ts";
