/**
 * AWP Auth Module
 *
 * Provides keypair-based authentication for AWP Client.
 *
 * @example
 * ```typescript
 * import { AwpAuth, FileKeyStorage } from "@agent-web-portal/client";
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
export { AwpAuth, AwpAuthError } from "./auth.ts";

// Crypto utilities (for advanced usage)
export {
  base64urlDecode,
  base64urlEncode,
  generateKeyPair,
  generateNonce,
  generateVerificationCode,
  hexEncode,
  sign,
  signKeyRotation,
  signRequest,
} from "./crypto.ts";

// Key storage implementations
export {
  FileKeyStorage,
  type FileKeyStorageOptions,
  LocalStorageKeyStorage,
  type LocalStorageKeyStorageOptions,
  MemoryKeyStorage,
} from "./storage.ts";

// Types
export type {
  AuthCallbacks,
  AuthChallenge,
  AuthChallengeResponse,
  AwpAuthOptions,
  AwpKeyPair,
  KeyStorage,
  SignedHeaders,
  StoredKeyData,
} from "./types.ts";
