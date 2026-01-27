/**
 * @agent-web-portal/client-react
 *
 * React hooks and components for AWP client.
 *
 * @example
 * ```tsx
 * import { useAwpAuth, useAwpClient } from "@agent-web-portal/client-react";
 *
 * function MyApp() {
 *   const { isAuthenticated, authState, startAuth, auth } = useAwpAuth({
 *     endpoint: "https://my-server.com",
 *     clientName: "My App",
 *   });
 *
 *   const { callTool } = useAwpClient({
 *     endpoint: "https://my-server.com",
 *     auth,
 *   });
 *
 *   if (authState.status === "pending") {
 *     return (
 *       <div>
 *         <p>Code: {authState.verificationCode}</p>
 *         <a href={authState.authUrl} target="_blank">Authorize</a>
 *       </div>
 *     );
 *   }
 *
 *   return <button onClick={() => callTool("my-tool", {})}>Call</button>;
 * }
 * ```
 */

// Re-export commonly used types from client packages
export type { AwpAuth, KeyStorage, StoredKeyData } from "@agent-web-portal/client";
export type { IndexedDBKeyStorage, LocalStorageKeyStorage } from "@agent-web-portal/client-browser";
// Hooks
export {
  type AuthState,
  type AuthStatus,
  type UseAwpAuthOptions,
  type UseAwpAuthResult,
  useAwpAuth,
} from "./hooks/use-awp-auth.ts";
export {
  type UseAwpClientOptions,
  type UseAwpClientResult,
  useAwpClient,
} from "./hooks/use-awp-client.ts";
