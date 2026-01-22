/**
 * Agent Web Portal Client SDK
 *
 * Provides a client for interacting with AWP servers, with automatic
 * blob handling through presigned URLs.
 *
 * @example
 * ```typescript
 * import { AwpClient, S3StorageProvider } from "@agent-web-portal/client";
 *
 * const client = new AwpClient({
 *   endpoint: "https://my-awp-server.com",
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
