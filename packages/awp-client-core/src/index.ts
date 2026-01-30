/**
 * AWP Client Core
 *
 * Platform-agnostic client with CAS-based blob exchange for Agent Web Portal.
 *
 * This package provides:
 * - AwpClient: Main client class for interacting with AWP servers
 * - CasInterceptor: Automatic CAS blob handling
 * - Types: All necessary type definitions
 *
 * Platform-specific implementations are in separate packages:
 * - @agent-web-portal/awp-client-browser: Browser with IndexedDB caching
 * - @agent-web-portal/awp-client-nodejs: Node.js with filesystem caching
 *
 * @example
 * ```typescript
 * import { AwpClient } from "@agent-web-portal/awp-client-core";
 *
 * const client = new AwpClient({
 *   endpoint: "https://my-awp-server.com",
 *   casEndpoint: "https://cas.example.com/api",
 * });
 *
 * const result = await client.callTool("process-image", {
 *   image: { "cas-node": "sha256:abc123..." },
 * });
 * ```
 */

// CAS Interceptor
export {
  type CasBlobContext,
  CasInterceptor,
  type CasInterceptorOptions,
} from "./cas-interceptor.ts";
// Client
export { AwpClient } from "./client.ts";
// Manager
export {
  AwpCasManager,
  type AwpCasManagerOptions,
  type PrefixedTool,
  type RegisteredEndpoint,
  type SkillFrontmatter,
  type SkillInfo,
} from "./manager.ts";

// Types
export type {
  // Auth types
  AuthCallbacks,
  AuthChallenge,
  AuthChallengeResponse,
  AwpAuth,
  AwpAuthOptions,
  // Client types
  AwpClientOptions,
  AwpKeyPair,
  AwpToolSchema,
  BlobDescriptors,
  // CAS blob reference types
  CasBlobRefInput,
  CasBlobRefOutput,
  CasBlobRefWithEndpoint,
  // Ticket types
  CreateTicketRequest,
  CreateTicketResponse,
  KeyStorage,
  SignedHeaders,
  StoredKeyData,
  ToolBlobSchema,
  // Tool call types
  ToolCallResult,
} from "./types.ts";
