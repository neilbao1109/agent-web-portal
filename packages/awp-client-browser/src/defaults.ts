/**
 * Browser-specific defaults and utilities for AWP Client
 */

import { type AwpAuth, AwpClient, type AwpClientOptions } from "@agent-web-portal/awp-client-core";
import { IndexedDBStorageProvider } from "@agent-web-portal/cas-client-browser";

/**
 * Options for creating a browser AWP client
 */
export interface BrowserAwpClientOptions {
  /** AWP server endpoint */
  endpoint: string;
  /** CAS server endpoint */
  casEndpoint: string;
  /** Auth handler (optional) */
  auth?: AwpAuth;
  /** Additional headers (optional) */
  headers?: Record<string, string>;
  /** Whether to enable CAS caching with IndexedDB (default: true) */
  enableCaching?: boolean;
  /** IndexedDB database name for CAS cache (default: "cas-cache") */
  cacheDatabaseName?: string;
}

/**
 * Create an AWP client with browser defaults
 *
 * This factory function creates an AwpClient with:
 * - IndexedDBStorageProvider for local CAS caching (enabled by default)
 *
 * @example
 * ```typescript
 * const client = createBrowserAwpClient({
 *   endpoint: "https://my-awp-server.com",
 *   casEndpoint: "https://cas.example.com/api",
 * });
 * ```
 */
export function createBrowserAwpClient(options: BrowserAwpClientOptions): AwpClient {
  const {
    endpoint,
    casEndpoint,
    auth,
    headers,
    enableCaching = true,
    cacheDatabaseName = "cas-cache",
  } = options;

  const clientOptions: AwpClientOptions = {
    endpoint,
    casEndpoint,
    auth,
    headers,
  };

  // Enable IndexedDB caching by default
  if (enableCaching) {
    clientOptions.casStorage = new IndexedDBStorageProvider(cacheDatabaseName);
  }

  return new AwpClient(clientOptions);
}
