/**
 * useAwpAuth Hook
 *
 * React hook for managing AWP authentication state with automatic
 * key storage, postMessage notifications, and polling fallback.
 */

import {
  AwpAuth,
  type AwpKeyPair,
  generateKeyPair,
  type KeyStorage,
  pollAuthStatus,
} from "@agent-web-portal/client";
import { IndexedDBKeyStorage, startBrowserAuthFlow } from "@agent-web-portal/client-browser";
import { useCallback, useEffect, useRef, useState } from "react";

// ============================================================================
// Types
// ============================================================================

/**
 * Auth state status
 */
export type AuthStatus =
  | "idle"
  | "loading"
  | "pending"
  | "polling"
  | "authenticated"
  | "failed"
  | "cancelled";

/**
 * Current auth state
 */
export interface AuthState {
  status: AuthStatus;
  /** Verification code to display to user */
  verificationCode?: string;
  /** URL for user to visit */
  authUrl?: string;
  /** Public key being authorized */
  pubkey?: string;
  /** When authorization expires */
  expiresAt?: number;
  /** Error message if failed */
  error?: string;
}

/**
 * Options for useAwpAuth hook
 */
export interface UseAwpAuthOptions {
  /** Server endpoint URL */
  endpoint: string;
  /** Client name displayed during authorization */
  clientName: string;
  /** Key storage implementation (default: IndexedDBKeyStorage) */
  storage?: KeyStorage;
  /** Polling interval in milliseconds (default: 10000) */
  pollInterval?: number;
  /** Polling timeout in milliseconds (default: 600000 = 10 minutes) */
  pollTimeout?: number;
  /** Auto-start auth if not authenticated (default: false) */
  autoAuth?: boolean;
  /** Custom fetch function */
  fetch?: typeof fetch;
}

/**
 * Result of useAwpAuth hook
 */
export interface UseAwpAuthResult {
  /** Whether currently authenticated */
  isAuthenticated: boolean;
  /** Current auth state */
  authState: AuthState;
  /** The AwpAuth instance (available when authenticated) */
  auth: AwpAuth | null;
  /** Start the authentication flow */
  startAuth: () => Promise<void>;
  /** Cancel ongoing authentication */
  cancelAuth: () => void;
  /** Logout and clear stored keys */
  logout: () => Promise<void>;
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * React hook for AWP authentication
 *
 * Manages authentication state, key storage, and auth flow with
 * postMessage notifications and polling fallback.
 *
 * @example
 * ```tsx
 * function MyApp() {
 *   const { isAuthenticated, authState, startAuth, cancelAuth } = useAwpAuth({
 *     endpoint: "https://my-server.com",
 *     clientName: "My App",
 *   });
 *
 *   if (authState.status === "pending") {
 *     return (
 *       <div>
 *         <p>Code: {authState.verificationCode}</p>
 *         <a href={authState.authUrl} target="_blank">Authorize</a>
 *         <button onClick={cancelAuth}>Cancel</button>
 *       </div>
 *     );
 *   }
 *
 *   return <button onClick={startAuth}>Login</button>;
 * }
 * ```
 */
export function useAwpAuth(options: UseAwpAuthOptions): UseAwpAuthResult {
  const {
    endpoint,
    clientName,
    storage,
    pollInterval = 10000,
    pollTimeout = 600000,
    autoAuth = false,
    fetch: fetchFn = fetch,
  } = options;

  // State
  const [authState, setAuthState] = useState<AuthState>({ status: "idle" });
  const [auth, setAuth] = useState<AwpAuth | null>(null);
  const [keyStorage] = useState<KeyStorage>(() => storage ?? new IndexedDBKeyStorage());

  // Refs for cleanup
  const abortControllerRef = useRef<AbortController | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  // Handle successful auth - defined first since startAuth depends on it
  const handleAuthSuccess = useCallback(
    async (keyPair: AwpKeyPair, expiresAt?: number) => {
      // Save keypair
      await keyStorage.save(endpoint, {
        keyPair,
        endpoint,
        clientName,
        expiresAt,
      });

      // Create AwpAuth instance
      const awpAuth = new AwpAuth({
        clientName,
        keyStorage,
        fetch: fetchFn,
      });

      setAuth(awpAuth);
      setAuthState({
        status: "authenticated",
        pubkey: keyPair.publicKey,
        expiresAt,
      });
    },
    [endpoint, clientName, keyStorage, fetchFn]
  );

  // Start auth flow
  const startAuth = useCallback(async () => {
    // Cancel any existing auth flow
    cleanupRef.current?.();
    abortControllerRef.current?.abort();

    setAuthState({ status: "loading" });

    try {
      // Generate new keypair
      const keyPair = await generateKeyPair();
      const pubkey = keyPair.publicKey;

      // Call /auth/init
      const initUrl = new URL("/auth/init", endpoint);
      const initResponse = await fetchFn(initUrl.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pubkey,
          client_name: clientName,
        }),
      });

      if (!initResponse.ok) {
        const errorText = await initResponse.text();
        throw new Error(`Auth init failed: ${errorText}`);
      }

      const initData = await initResponse.json();
      const { auth_url, verification_code, expires_in } = initData;

      // Update state with pending auth info
      setAuthState({
        status: "pending",
        verificationCode: verification_code,
        authUrl: auth_url,
        pubkey,
        expiresAt: Date.now() + expires_in * 1000,
      });

      // Set up abort controller for polling
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      // Start browser auth flow (postMessage + window close detection)
      const { cleanup: browserCleanup } = startBrowserAuthFlow({
        authUrl: auth_url,
        pubkey,
        onAuthorized: async (result) => {
          abortController.abort();
          await handleAuthSuccess(keyPair, result.expiresAt);
        },
        onCancelled: () => {
          // User closed window, continue polling
          setAuthState((prev) => ({ ...prev, status: "polling" }));
        },
      });
      cleanupRef.current = browserCleanup;

      // Start polling as fallback
      const statusUrl = new URL("/auth/status", endpoint);
      statusUrl.searchParams.set("pubkey", pubkey);

      pollAuthStatus(
        statusUrl.toString(),
        {
          interval: pollInterval,
          timeout: pollTimeout,
          signal: abortController.signal,
        },
        fetchFn
      ).then(async (result) => {
        if (result.authorized && !abortController.signal.aborted) {
          browserCleanup();
          await handleAuthSuccess(keyPair, result.expiresAt);
        } else if (!abortController.signal.aborted) {
          setAuthState({
            status: "failed",
            error: "Authorization timed out",
          });
        }
      });
    } catch (err) {
      setAuthState({
        status: "failed",
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }, [endpoint, clientName, pollInterval, pollTimeout, fetchFn, handleAuthSuccess]);

  // Check for existing valid key on mount
  useEffect(() => {
    let cancelled = false;

    async function checkExistingAuth() {
      setAuthState({ status: "loading" });

      try {
        const storedData = await keyStorage.load(endpoint);
        if (storedData && (!storedData.expiresAt || storedData.expiresAt > Date.now())) {
          // We have a valid key
          const awpAuth = new AwpAuth({
            clientName,
            keyStorage,
            fetch: fetchFn,
          });

          if (!cancelled) {
            setAuth(awpAuth);
            setAuthState({
              status: "authenticated",
              pubkey: storedData.keyPair.publicKey,
              expiresAt: storedData.expiresAt,
            });
          }
        } else {
          if (!cancelled) {
            setAuthState({ status: "idle" });
          }
        }
      } catch {
        if (!cancelled) {
          setAuthState({ status: "idle" });
        }
      }
    }

    checkExistingAuth();

    return () => {
      cancelled = true;
    };
  }, [endpoint, clientName, keyStorage, fetchFn]);

  // Handle autoAuth after initial check
  useEffect(() => {
    if (autoAuth && authState.status === "idle") {
      startAuth();
    }
  }, [autoAuth, authState.status, startAuth]);

  // Cancel auth
  const cancelAuth = useCallback(() => {
    cleanupRef.current?.();
    abortControllerRef.current?.abort();
    cleanupRef.current = null;
    abortControllerRef.current = null;
    setAuthState({ status: "cancelled" });
  }, []);

  // Logout
  const logout = useCallback(async () => {
    cleanupRef.current?.();
    abortControllerRef.current?.abort();
    cleanupRef.current = null;
    abortControllerRef.current = null;

    await keyStorage.delete(endpoint);
    setAuth(null);
    setAuthState({ status: "idle" });
  }, [endpoint, keyStorage]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupRef.current?.();
      abortControllerRef.current?.abort();
    };
  }, []);

  return {
    isAuthenticated: authState.status === "authenticated",
    authState,
    auth,
    startAuth,
    cancelAuth,
    logout,
  };
}
