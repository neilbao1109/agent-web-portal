/**
 * CAS Context
 *
 * Provides CAS (Content-Addressable Storage) access throughout the app.
 * Used for rendering cas:// protocol images and other CAS content.
 */

import { createContext, useContext, useMemo, useRef, useCallback, type ReactNode } from "react";
import type { AwpCasManager } from "@agent-web-portal/awp-client-browser";

/** Cached content result */
interface CachedContent {
  data: Uint8Array;
  contentType: string;
}

/** In-flight request promise */
type InflightRequest = Promise<CachedContent | null>;

/**
 * CAS Context value
 */
interface CasContextValue {
  /** CAS endpoint URL */
  casEndpoint: string | null;
  /** Whether CAS is authenticated */
  isAuthenticated: boolean;
  /** Fetch CAS content by key (uses P256 signed auth) */
  fetchCasContent: (key: string) => Promise<{ data: Uint8Array; contentType: string } | null>;
}

const CasContext = createContext<CasContextValue>({
  casEndpoint: null,
  isAuthenticated: false,
  fetchCasContent: async () => null,
});

export interface CasContextProviderProps {
  children: ReactNode;
  /** CAS endpoint URL */
  casEndpoint: string | null;
  /** Whether CAS is authenticated */
  isAuthenticated: boolean;
  /** AWP CAS Manager instance */
  manager: AwpCasManager;
}

/**
 * CasContextProvider component that provides CAS access to the app
 */
export function CasContextProvider({
  children,
  casEndpoint,
  isAuthenticated,
  manager,
}: CasContextProviderProps) {
  // Cache for fetched content (persists across renders)
  const contentCacheRef = useRef<Map<string, CachedContent>>(new Map());
  // In-flight requests to deduplicate concurrent fetches
  const inflightRef = useRef<Map<string, InflightRequest>>(new Map());
  // Store refs for stable callback
  const casEndpointRef = useRef(casEndpoint);
  const isAuthenticatedRef = useRef(isAuthenticated);
  const managerRef = useRef(manager);

  // Update refs when values change
  casEndpointRef.current = casEndpoint;
  isAuthenticatedRef.current = isAuthenticated;
  managerRef.current = manager;

  // Fetch CAS content with caching and deduplication using P256 signed auth
  const fetchCasContent = useCallback(
    async (key: string): Promise<{ data: Uint8Array; contentType: string } | null> => {
      const endpoint = casEndpointRef.current;
      const authenticated = isAuthenticatedRef.current;

      if (!endpoint || !authenticated) {
        console.warn("[CasContext] Cannot fetch CAS content: not authenticated");
        return null;
      }

      // Check cache first
      const cached = contentCacheRef.current.get(key);
      if (cached) {
        console.log("[CasContext] Cache hit for:", key);
        return cached;
      }

      // Check if there's an in-flight request for this key
      const inflight = inflightRef.current.get(key);
      if (inflight) {
        console.log("[CasContext] Waiting for in-flight request:", key);
        return inflight;
      }

      // Create new request
      const requestPromise = (async (): Promise<CachedContent | null> => {
        try {
          console.log("[CasContext] Fetching CAS content with P256 auth:", key);

          // Use AwpCasManager's fetchCasContent which handles P256 signing
          const result = await managerRef.current.fetchCasContent(endpoint, key);

          if (!result) {
            console.error("[CasContext] Failed to fetch CAS content");
            return null;
          }

          const cached: CachedContent = {
            data: result.data,
            contentType: result.contentType,
          };

          // Store in cache
          contentCacheRef.current.set(key, cached);
          console.log("[CasContext] Cached content for:", key);

          return cached;
        } catch (error) {
          console.error("[CasContext] Failed to fetch CAS content:", error);
          return null;
        } finally {
          // Remove from in-flight map
          inflightRef.current.delete(key);
        }
      })();

      // Store in in-flight map
      inflightRef.current.set(key, requestPromise);

      return requestPromise;
    },
    [] // No dependencies - uses refs for stability
  );

  const value = useMemo<CasContextValue>(() => ({
    casEndpoint,
    isAuthenticated,
    fetchCasContent,
  }), [casEndpoint, isAuthenticated, fetchCasContent]);

  return (
    <CasContext.Provider value={value}>
      {children}
    </CasContext.Provider>
  );
}

/**
 * Hook to access the CAS context
 */
export function useCas(): CasContextValue {
  return useContext(CasContext);
}

/**
 * Parse a cas:// URI to extract the key
 * @param uri - The CAS URI (e.g., "cas://sha256:abc123...")
 * @returns The CAS key (e.g., "sha256:abc123...") or null if invalid
 */
export function parseCasUri(uri: string): string | null {
  if (uri.startsWith("cas://")) {
    return uri.slice(6); // Remove "cas://" prefix
  }
  return null;
}

/**
 * Check if a URL is a CAS URI
 */
export function isCasUri(url: string): boolean {
  return url.startsWith("cas://");
}
