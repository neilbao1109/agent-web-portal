/**
 * @agent-web-portal/client-browser
 *
 * Browser-specific storage implementations and utilities for AWP client.
 *
 * @example
 * ```typescript
 * import { AwpAuth, pollAuthStatus } from "@agent-web-portal/client";
 * import {
 *   IndexedDBKeyStorage,
 *   startBrowserAuthFlow,
 * } from "@agent-web-portal/client-browser";
 *
 * const auth = new AwpAuth({
 *   clientName: "My Web App",
 *   keyStorage: new IndexedDBKeyStorage(),
 * });
 *
 * // When auth is required:
 * const { cleanup } = startBrowserAuthFlow({
 *   authUrl: challenge.authUrl,
 *   pubkey: challenge.publicKey,
 *   onAuthorized: () => console.log("Authorized!"),
 * });
 * ```
 */

// Auth window utilities
export {
  // Types
  type AuthCompleteMessage,
  type AuthCompleteResult,
  type BrowserAuthFlowOptions,
  listenAuthComplete,
  type OpenAuthWindowOptions,
  // Functions
  openAuthWindow,
  startBrowserAuthFlow,
  watchWindowClosed,
} from "./auth-window.ts";
// Storage implementations
export { IndexedDBKeyStorage, type IndexedDBKeyStorageOptions } from "./indexed-db-storage.ts";
export { LocalStorageKeyStorage, type LocalStorageKeyStorageOptions } from "./local-storage.ts";
