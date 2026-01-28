/**
 * HTTP Storage Provider
 *
 * A browser-safe storage provider that delegates presigned URL generation
 * to a server endpoint. This avoids exposing AWS credentials in the browser.
 */

import type {
  PresignedUrlOptions,
  PresignedUrlPair,
  StorageProvider,
} from "@agent-web-portal/client";

/**
 * Options for HTTP storage provider
 */
export interface HttpStorageProviderOptions {
  /** Base URL of the server (e.g., "http://localhost:3400") */
  baseUrl: string;
  /** Endpoint for preparing output blob (presigned PUT URL) */
  prepareOutputEndpoint?: string;
  /** Endpoint for preparing download (presigned GET URL) */
  prepareDownloadEndpoint?: string;
  /** Optional headers to include in requests */
  headers?: Record<string, string>;
  /** Custom fetch function */
  fetch?: typeof fetch;
}

/**
 * HTTP Storage Provider
 *
 * Delegates presigned URL generation to a server endpoint.
 * This is the recommended approach for browser-based applications
 * as it keeps AWS credentials secure on the server.
 *
 * @example
 * ```typescript
 * const storage = new HttpStorageProvider({
 *   baseUrl: "http://localhost:3400",
 * });
 *
 * // The storage provider will call:
 * // POST /api/blob/prepare-output for PUT URLs
 * // POST /api/blob/prepare-download for GET URLs
 * ```
 */
export class HttpStorageProvider implements StorageProvider {
  private baseUrl: string;
  private prepareOutputEndpoint: string;
  private prepareDownloadEndpoint: string;
  private headers: Record<string, string>;
  private fetchFn: typeof fetch;

  constructor(options: HttpStorageProviderOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.prepareOutputEndpoint = options.prepareOutputEndpoint ?? "/api/blob/prepare-download";
    this.prepareDownloadEndpoint = options.prepareDownloadEndpoint ?? "/api/blob/prepare-download";
    this.headers = options.headers ?? {};
    this.fetchFn = options.fetch ?? fetch.bind(globalThis);
  }

  /**
   * Generate a presigned GET URL for reading a blob
   *
   * For blob:// URIs, converts them directly to HTTP URLs.
   * For other URIs, calls the server endpoint to get a presigned URL.
   */
  async generatePresignedGetUrl(uri: string, _options?: PresignedUrlOptions): Promise<string> {
    // For blob:// URIs, convert directly to HTTP URL
    // blob://abc123 -> http://localhost:3400/api/blob/output/abc123
    if (uri.startsWith("blob://")) {
      const id = uri.slice("blob://".length);
      return `${this.baseUrl}/api/blob/output/${encodeURIComponent(id)}`;
    }

    // For awp:// URIs, same conversion
    if (uri.startsWith("awp://")) {
      const id = uri.slice("awp://".length);
      return `${this.baseUrl}/api/blob/output/${encodeURIComponent(id)}`;
    }

    // For HTTP(S) URLs, return as-is
    if (uri.startsWith("http://") || uri.startsWith("https://")) {
      return uri;
    }

    // For other URIs, call the server endpoint
    const response = await this.fetchFn(`${this.baseUrl}${this.prepareDownloadEndpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...this.headers,
      },
      body: JSON.stringify({
        uri,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to generate presigned GET URL: ${response.status} - ${error}`);
    }

    const result = await response.json();
    return result.url || result.presignedUrl || result.readUrl;
  }

  /**
   * Generate a presigned PUT URL for writing a blob
   */
  async generatePresignedPutUrl(
    prefix: string,
    options?: PresignedUrlOptions
  ): Promise<PresignedUrlPair> {
    const response = await this.fetchFn(`${this.baseUrl}${this.prepareOutputEndpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...this.headers,
      },
      body: JSON.stringify({
        prefix,
        contentType: options?.contentType,
        expiresIn: options?.expiresIn,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to generate presigned PUT URL: ${response.status} - ${error}`);
    }

    const result = await response.json();

    // Build the uri with blob:// prefix if the server returns just an id
    let uri = result.uri;
    if (!uri && result.id) {
      // Ensure the id has the blob:// prefix
      uri = result.id.startsWith("blob://") ? result.id : `blob://${result.id}`;
    }

    return {
      uri,
      presignedUrl: result.presignedUrl || result.writeUrl,
    };
  }

  /**
   * Check if this provider can handle the given URI
   */
  canHandle(uri: string): boolean {
    // Handle s3://, blob://, and http(s):// URIs
    return (
      uri.startsWith("s3://") ||
      uri.startsWith("blob://") ||
      uri.startsWith("http://") ||
      uri.startsWith("https://")
    );
  }
}
