/**
 * useAwpClient Hook
 *
 * React hook for creating and using AWP client instances.
 */

import { type AwpAuth, AwpClient, type StorageProvider } from "@agent-web-portal/client";
import { useCallback, useMemo } from "react";

// ============================================================================
// Types
// ============================================================================

/**
 * Options for useAwpClient hook
 */
export interface UseAwpClientOptions {
  /** Server endpoint URL */
  endpoint: string;
  /** AwpAuth instance for authenticated requests */
  auth?: AwpAuth | null;
  /** Storage provider for blob handling */
  storage?: StorageProvider;
  /** Custom fetch function */
  fetch?: typeof fetch;
}

/**
 * Result of useAwpClient hook
 */
export interface UseAwpClientResult {
  /** The AwpClient instance */
  client: AwpClient;
  /**
   * Call a tool on the server
   * @param name Tool name
   * @param args Tool arguments
   * @returns Tool result
   */
  callTool: <T = unknown>(name: string, args: Record<string, unknown>) => Promise<T>;
  /**
   * List available tools
   * @returns Tool list response
   */
  listTools: () => ReturnType<AwpClient["listTools"]>;
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * React hook for AWP client
 *
 * Creates and manages an AwpClient instance with memoization.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { isAuthenticated, auth } = useAwpAuth({
 *     endpoint: "https://my-server.com",
 *     clientName: "My App",
 *   });
 *
 *   const { client, callTool } = useAwpClient({
 *     endpoint: "https://my-server.com",
 *     auth: isAuthenticated ? auth : undefined,
 *   });
 *
 *   const handleClick = async () => {
 *     const result = await callTool("my-tool", { arg: "value" });
 *     console.log(result);
 *   };
 *
 *   return <button onClick={handleClick}>Call Tool</button>;
 * }
 * ```
 */
export function useAwpClient(options: UseAwpClientOptions): UseAwpClientResult {
  const { endpoint, auth, storage, fetch: fetchFn } = options;

  // Memoize client creation
  const client = useMemo(() => {
    return new AwpClient({
      endpoint,
      auth: auth ?? undefined,
      storage,
      fetch: fetchFn,
    });
  }, [endpoint, auth, storage, fetchFn]);

  // Memoized callTool
  const callTool = useCallback(
    async <T = unknown>(name: string, args: Record<string, unknown>): Promise<T> => {
      return client.callTool(name, args) as Promise<T>;
    },
    [client]
  );

  // Memoized listTools
  const listTools = useCallback(async () => {
    return client.listTools();
  }, [client]);

  return {
    client,
    callTool,
    listTools,
  };
}
