/**
 * Node.js-specific defaults and utilities for AWP Client
 */

import * as os from "node:os";
import * as path from "node:path";
import { type AwpAuth, AwpClient, type AwpClientOptions } from "@agent-web-portal/awp-client-core";
import { FileSystemStorageProvider } from "@agent-web-portal/cas-client-nodejs";

/**
 * Options for creating a Node.js AWP client
 */
export interface NodejsAwpClientOptions {
  /** AWP server endpoint */
  endpoint: string;
  /** CAS server endpoint */
  casEndpoint: string;
  /** Auth handler (optional) */
  auth?: AwpAuth;
  /** Additional headers (optional) */
  headers?: Record<string, string>;
  /** Whether to enable CAS caching with filesystem (default: true) */
  enableCaching?: boolean;
  /** Cache directory path (default: ~/.cache/awp-cas) */
  cacheDirectory?: string;
}

/**
 * Get the default cache directory
 */
function getDefaultCacheDirectory(): string {
  const homeDir = os.homedir();
  return path.join(homeDir, ".cache", "awp-cas");
}

/**
 * Create an AWP client with Node.js defaults
 *
 * This factory function creates an AwpClient with:
 * - FileSystemStorageProvider for local CAS caching (enabled by default)
 *
 * @example
 * ```typescript
 * const client = createNodejsAwpClient({
 *   endpoint: "https://my-awp-server.com",
 *   casEndpoint: "https://cas.example.com/api",
 * });
 * ```
 */
export function createNodejsAwpClient(options: NodejsAwpClientOptions): AwpClient {
  const {
    endpoint,
    casEndpoint,
    auth,
    headers,
    enableCaching = true,
    cacheDirectory = getDefaultCacheDirectory(),
  } = options;

  const clientOptions: AwpClientOptions = {
    endpoint,
    casEndpoint,
    auth,
    headers,
  };

  // Enable filesystem caching by default
  if (enableCaching) {
    clientOptions.casStorage = new FileSystemStorageProvider(cacheDirectory);
  }

  return new AwpClient(clientOptions);
}
