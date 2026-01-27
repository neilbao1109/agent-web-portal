/**
 * AWP Auth Module
 *
 * Provides keypair-based authentication for AWP Client.
 *
 * Platform-specific storage implementations are in separate packages:
 * - @agent-web-portal/client-nodejs: FileKeyStorage
 * - @agent-web-portal/client-browser: IndexedDBKeyStorage, LocalStorageKeyStorage
 *
 * @example
 * ```typescript
 * // For Node.js
 * import { AwpAuth } from "@agent-web-portal/client";
 * import { FileKeyStorage } from "@agent-web-portal/client-nodejs";
 *
 * // For Browser
 * import { AwpAuth } from "@agent-web-portal/client";
 * import { IndexedDBKeyStorage } from "@agent-web-portal/client-browser";
 *
 * const auth = new AwpAuth({
 *   clientName: "My AI Agent",
 *   keyStorage: new FileKeyStorage({ directory: "~/.awp/keys" }),
 *   callbacks: {
 *     onAuthRequired: async (challenge) => {
 *       console.log("Visit:", challenge.authUrl);
 *       console.log("Code:", challenge.verificationCode);
 *       return true; // proceed with authorization
 *     },
 *   },
 * });
 * ```
 */

// Main auth class
export { AwpAuth, AwpAuthError, pollAuthStatus } from "./auth.ts";

// Crypto utilities (for advanced usage)
export {
  base64urlDecode,
  base64urlEncode,
  generateKeyPair,
  hexEncode,
  sign,
  signKeyRotation,
  signRequest,
} from "./crypto.ts";

// Key storage implementations (in-memory only, for testing)
export { MemoryKeyStorage } from "./storage.ts";

// Types
export type {
  AuthCallbacks,
  AuthChallenge,
  AuthChallengeResponse,
  AuthInitResponse,
  AwpAuthOptions,
  AwpKeyPair,
  BuildAuthUrlParams,
  KeyStorage,
  PollAuthStatusOptions,
  PollAuthStatusResult,
  SignedHeaders,
  StoredKeyData,
} from "./types.ts";
