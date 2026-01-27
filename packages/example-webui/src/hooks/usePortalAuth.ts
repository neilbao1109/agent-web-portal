/**
 * usePortalAuth Hook
 *
 * Portal-specific auth hook that wraps @agent-web-portal/client-react
 * with the specific requirements of the examples UI.
 */

import {
  type AwpKeyPair,
  generateKeyPair as generateAwpKeyPair,
  pollAuthStatus,
} from "@agent-web-portal/client";
import {
  IndexedDBKeyStorage,
  listenAuthComplete,
  openAuthWindow,
  watchWindowClosed,
} from "@agent-web-portal/client-browser";
import { useCallback, useEffect, useRef, useState } from "react";

// ============================================================================
// Types
// ============================================================================

export type PortalAuthStatus =
  | "none"
  | "loading"
  | "pending"
  | "polling"
  | "authenticated"
  | "failed";

export interface PortalAuthState {
  status: PortalAuthStatus;
  verificationCode?: string;
  authPageUrl?: string;
  pubkey?: string;
  error?: string;
  expiresAt?: number;
}

export interface UsePortalAuthOptions {
  endpoint: string;
  isAuthPortal: boolean;
  clientName?: string;
  pollInterval?: number;
  apiBase?: string;
}

export interface UsePortalAuthResult {
  authState: PortalAuthState;
  keyPair: AwpKeyPair | null;
  startAuth: (authInitEndpoint: string) => Promise<void>;
  openAuthPage: () => void;
  logout: () => Promise<void>;
  signRequest: (method: string, url: string, body: string) => Promise<Record<string, string>>;
  isAuthenticated: boolean;
}

// ============================================================================
// Storage
// ============================================================================

const storage = new IndexedDBKeyStorage();

// ============================================================================
// Crypto Helpers
// ============================================================================

async function base64urlEncode(data: Uint8Array): Promise<string> {
  const base64 = btoa(String.fromCharCode(...data));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hashBody(body: string): Promise<string> {
  const bodyBytes = new TextEncoder().encode(body);
  const hashBuffer = await crypto.subtle.digest("SHA-256", bodyBytes);
  return base64urlEncode(new Uint8Array(hashBuffer));
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function usePortalAuth(options: UsePortalAuthOptions): UsePortalAuthResult {
  const {
    endpoint,
    isAuthPortal,
    clientName = "AWP UI Test",
    pollInterval = 10000,
    apiBase = "",
  } = options;

  const [authState, setAuthState] = useState<PortalAuthState>({ status: "none" });
  const [keyPair, setKeyPair] = useState<AwpKeyPair | null>(null);

  // Refs for cleanup
  const abortControllerRef = useRef<AbortController | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  // Check for stored key on mount or endpoint change
  useEffect(() => {
    if (!isAuthPortal) {
      setAuthState({ status: "none" });
      return;
    }

    const checkStoredKey = async () => {
      setAuthState({ status: "loading" });

      try {
        const stored = await storage.load(endpoint);
        if (stored && (!stored.expiresAt || stored.expiresAt > Date.now())) {
          setKeyPair(stored.keyPair);
          setAuthState({
            status: "authenticated",
            pubkey: stored.keyPair.publicKey,
            expiresAt: stored.expiresAt,
          });
        } else {
          setKeyPair(null);
          setAuthState({ status: "none" });
        }
      } catch {
        setKeyPair(null);
        setAuthState({ status: "none" });
      }
    };

    checkStoredKey();

    // Cleanup on endpoint change
    return () => {
      cleanupRef.current?.();
      abortControllerRef.current?.abort();
    };
  }, [endpoint, isAuthPortal]);

  // Start auth flow
  const startAuth = useCallback(
    async (authInitEndpoint: string) => {
      // Cancel any existing auth flow
      cleanupRef.current?.();
      abortControllerRef.current?.abort();

      setAuthState({ status: "pending" });

      try {
        // Generate key pair using client package
        const newKeyPair = await generateAwpKeyPair();
        setKeyPair(newKeyPair);
        const pubkey = newKeyPair.publicKey;

        // Call auth/init
        const authInitUrl = authInitEndpoint.startsWith("/")
          ? `${apiBase}${authInitEndpoint}`
          : authInitEndpoint;

        const initRes = await fetch(authInitUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pubkey,
            client_name: clientName,
          }),
        });

        if (!initRes.ok) {
          throw new Error(`Auth init failed: ${initRes.status}`);
        }

        const initData = await initRes.json();
        const { verification_code, auth_url, expires_in } = initData;

        setAuthState({
          status: "pending",
          verificationCode: verification_code,
          authPageUrl: auth_url,
          pubkey,
          expiresAt: Date.now() + (expires_in ?? 300) * 1000,
        });
      } catch (err) {
        setAuthState({
          status: "failed",
          error: err instanceof Error ? err.message : "Auth initialization failed",
        });
      }
    },
    [apiBase, clientName]
  );

  // Open auth page and start listening
  const openAuthPage = useCallback(() => {
    if (!authState.authPageUrl || !authState.pubkey || !keyPair) {
      return;
    }

    const pubkey = authState.pubkey;

    // Add verification code to URL
    const url = new URL(authState.authPageUrl);
    if (authState.verificationCode) {
      url.searchParams.set("code", authState.verificationCode);
    }

    // Open auth window
    const authWindow = openAuthWindow(url.toString());

    // Set up abort controller for polling
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // Update status
    setAuthState((prev: PortalAuthState) => ({ ...prev, status: "polling" as const }));

    // Listen for postMessage
    const cleanupListener = listenAuthComplete(
      pubkey,
      async (result: { authorized: boolean; expiresAt?: number }) => {
        if (result.authorized) {
          abortController.abort();
          cleanupWatch();
          await handleAuthSuccess(result.expiresAt);
        }
      }
    );

    // Watch for window close
    const cleanupWatch = watchWindowClosed(authWindow, () => {
      // User closed window, continue polling
    });

    cleanupRef.current = () => {
      cleanupListener();
      cleanupWatch();
    };

    // Start polling as fallback
    const statusUrl = `${apiBase}/auth/status?pubkey=${encodeURIComponent(pubkey)}`;

    pollAuthStatus(statusUrl, {
      interval: pollInterval,
      signal: abortController.signal,
    }).then(async (result) => {
      if (result.authorized && !abortController.signal.aborted) {
        cleanupRef.current?.();
        await handleAuthSuccess(result.expiresAt);
      }
    });

    async function handleAuthSuccess(expiresAt?: number) {
      if (!keyPair) return;

      const finalExpiresAt = expiresAt ?? Date.now() + 24 * 60 * 60 * 1000;

      // Save to storage
      await storage.save(endpoint, {
        keyPair,
        endpoint,
        clientName,
        expiresAt: finalExpiresAt,
      });

      setAuthState({
        status: "authenticated",
        pubkey,
        expiresAt: finalExpiresAt,
      });
    }
  }, [authState, keyPair, endpoint, clientName, apiBase, pollInterval]);

  // Logout
  const logout = useCallback(async () => {
    cleanupRef.current?.();
    abortControllerRef.current?.abort();

    await storage.delete(endpoint);
    setKeyPair(null);
    setAuthState({ status: "none" });
  }, [endpoint]);

  // Sign request
  const signRequest = useCallback(
    async (method: string, url: string, body: string): Promise<Record<string, string>> => {
      if (!keyPair) {
        throw new Error("No key pair available");
      }

      const timestamp = Math.floor(Date.now() / 1000).toString();
      const pubkeyB64 = keyPair.publicKey;

      // Get path from URL
      const urlObj = new URL(url, window.location.origin);
      const path = urlObj.pathname;

      // Hash the body
      const bodyHashValue = await hashBody(body);

      // Create signature payload: timestamp.METHOD.path.bodyHash
      const payload = `${timestamp}.${method.toUpperCase()}.${path}.${bodyHashValue}`;
      const payloadBytes = new TextEncoder().encode(payload);

      // Parse the public key to get x and y for JWK format
      const [x, y] = keyPair.publicKey.split(".");
      const d = keyPair.privateKey;

      // Import private key from JWK
      const privateKeyJwk: JsonWebKey = {
        kty: "EC",
        crv: "P-256",
        x,
        y,
        d,
      };

      const privateKey = await crypto.subtle.importKey(
        "jwk",
        privateKeyJwk,
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["sign"]
      );

      // Sign
      const signature = await crypto.subtle.sign(
        { name: "ECDSA", hash: "SHA-256" },
        privateKey,
        payloadBytes
      );
      const signatureB64 = await base64urlEncode(new Uint8Array(signature));

      return {
        "X-AWP-Pubkey": pubkeyB64,
        "X-AWP-Timestamp": timestamp,
        "X-AWP-Signature": signatureB64,
      };
    },
    [keyPair]
  );

  return {
    authState,
    keyPair,
    startAuth,
    openAuthPage,
    logout,
    signRequest,
    isAuthenticated: authState.status === "authenticated",
  };
}
