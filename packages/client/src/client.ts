/**
 * AWP Client
 *
 * A client for interacting with Agent Web Portal servers,
 * with automatic blob handling through presigned URLs.
 */

import type { BlobContext, McpToolSchema, McpToolsListResponse } from "@agent-web-portal/core";
import type { AuthChallengeResponse, AwpAuth } from "./auth/index.ts";
import { BlobInterceptor, type ToolBlobSchema } from "./blob-interceptor.ts";
import type { StorageProvider } from "./storage/types.ts";

/**
 * Options for AWP client
 */
export interface AwpClientOptions {
  /** The endpoint URL of the AWP server */
  endpoint: string;
  /** Storage provider for blob handling (optional if no blob tools are used) */
  storage?: StorageProvider;
  /** Auth handler for authentication (optional) */
  auth?: AwpAuth;
  /** Default prefix for output blobs */
  outputPrefix?: string;
  /** Custom fetch function (for testing or custom HTTP handling) */
  fetch?: typeof fetch;
  /** Additional headers to include in requests */
  headers?: Record<string, string>;
}

/**
 * Tool call result
 */
export interface ToolCallResult<T = unknown> {
  /** The result data */
  data: T;
  /** Whether the call resulted in an error */
  isError?: boolean;
}

/**
 * Cached tool schema with blob information
 */
interface CachedToolSchema {
  schema: McpToolSchema;
  blobSchema: ToolBlobSchema;
}

/**
 * AWP Client
 *
 * Provides a high-level interface for calling AWP tools with automatic
 * blob handling. The client:
 *
 * 1. Fetches tool schemas from the server
 * 2. Identifies blob fields from x-awp-blob markers
 * 3. Generates presigned URLs for input and output blobs
 * 4. Sends the request with blob context
 * 5. Returns results with permanent URIs
 *
 * @example
 * ```typescript
 * const client = new AwpClient({
 *   endpoint: "https://my-awp-server.com",
 *   storage: new S3StorageProvider({
 *     region: "us-east-1",
 *     bucket: "my-bucket",
 *   }),
 * });
 *
 * // Call a tool
 * const result = await client.callTool("process-document", {
 *   document: "s3://my-bucket/input/doc.pdf",
 *   options: { quality: 80 },
 * });
 *
 * console.log(result.data.thumbnail); // s3://my-bucket/output/thumb.png
 * ```
 */
export class AwpClient {
  private endpoint: string;
  private storage: StorageProvider | null;
  private auth: AwpAuth | null;
  private blobInterceptor: BlobInterceptor | null;
  private fetchFn: typeof fetch;
  private headers: Record<string, string>;
  private toolSchemaCache: Map<string, CachedToolSchema> = new Map();
  private schemasFetched = false;
  private requestId = 0;

  constructor(options: AwpClientOptions) {
    this.endpoint = options.endpoint.replace(/\/$/, ""); // Remove trailing slash
    this.storage = options.storage ?? null;
    this.auth = options.auth ?? null;
    this.fetchFn = options.fetch ?? fetch;
    this.headers = options.headers ?? {};

    // Only create blob interceptor if storage is provided
    this.blobInterceptor = options.storage
      ? new BlobInterceptor({
          storage: options.storage,
          outputPrefix: options.outputPrefix,
        })
      : null;
  }

  /**
   * Send a JSON-RPC request to the server
   */
  private async sendRequest(method: string, params?: Record<string, unknown>): Promise<unknown> {
    const id = ++this.requestId;
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params,
    });

    // Get auth headers if auth is configured
    let authHeaders: Record<string, string> = {};
    if (this.auth && (await this.auth.hasValidKey(this.endpoint))) {
      authHeaders = await this.auth.sign(this.endpoint, "POST", this.endpoint, body);
    }

    const doRequest = async (): Promise<Response> => {
      return this.fetchFn(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...this.headers,
          ...authHeaders,
        },
        body,
      });
    };

    let response = await doRequest();

    // Handle 401 with auth flow
    if (response.status === 401 && this.auth) {
      const responseBody = (await response
        .json()
        .catch(() => null)) as AuthChallengeResponse | null;

      if (responseBody?.auth_endpoint) {
        // Start authorization flow
        const shouldRetry = await this.auth.handleUnauthorized(this.endpoint, responseBody);

        if (shouldRetry) {
          // User completed authorization, retry with new key
          authHeaders = await this.auth.sign(this.endpoint, "POST", this.endpoint, body);
          response = await doRequest();

          if (response.ok) {
            this.auth.notifyAuthSuccess(this.endpoint);
          } else if (response.status === 401) {
            const error = new Error("Authorization failed - verification code may be incorrect");
            this.auth.notifyAuthFailed(this.endpoint, error);
          }
        }
      }
    }

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
    }

    const result = (await response.json()) as {
      jsonrpc: "2.0";
      id: number;
      result?: unknown;
      error?: { code: number; message: string; data?: unknown };
    };

    if (result.error) {
      throw new Error(`RPC error: ${result.error.message}`);
    }

    return result.result;
  }

  /**
   * Extract blob fields from a JSON Schema
   */
  private extractBlobFieldsFromSchema(schema: Record<string, unknown>): string[] {
    const blobFields: string[] = [];

    const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;
    if (!properties) {
      return blobFields;
    }

    for (const [key, value] of Object.entries(properties)) {
      if (value && typeof value === "object" && "x-awp-blob" in value) {
        blobFields.push(key);
      }
    }

    return blobFields;
  }

  /**
   * Fetch and cache tool schemas from the server
   */
  private async ensureSchemasFetched(): Promise<void> {
    if (this.schemasFetched) {
      return;
    }

    const response = (await this.sendRequest("tools/list")) as McpToolsListResponse;

    for (const tool of response.tools) {
      const inputBlobs = this.extractBlobFieldsFromSchema(
        tool.inputSchema as Record<string, unknown>
      );

      // Note: We don't have output schema in the standard MCP tools/list response
      // For now, we'll need to either:
      // 1. Add an AWP extension to include output schema
      // 2. Have the server return blob info separately
      // 3. Let the caller provide blob info
      // For this implementation, we'll use an empty array for output blobs
      // and let the server handle output blob filling

      this.toolSchemaCache.set(tool.name, {
        schema: tool,
        blobSchema: {
          inputBlobs,
          outputBlobs: [], // Will be filled by the server
        },
      });
    }

    this.schemasFetched = true;
  }

  /**
   * Get blob schema for a tool
   */
  async getToolBlobSchema(toolName: string): Promise<ToolBlobSchema | undefined> {
    await this.ensureSchemasFetched();
    return this.toolSchemaCache.get(toolName)?.blobSchema;
  }

  /**
   * Set blob schema for a tool manually
   * Useful when the client knows the output blob fields
   */
  setToolBlobSchema(toolName: string, blobSchema: ToolBlobSchema): void {
    const cached = this.toolSchemaCache.get(toolName);
    if (cached) {
      cached.blobSchema = blobSchema;
    } else {
      this.toolSchemaCache.set(toolName, {
        schema: { name: toolName, inputSchema: {} },
        blobSchema,
      });
    }
  }

  /**
   * Call a tool with automatic blob handling
   *
   * @param name - Tool name
   * @param args - Tool arguments
   * @param blobSchema - Optional blob schema override
   * @returns The tool result
   */
  async callTool<T = unknown>(
    name: string,
    args: Record<string, unknown>,
    blobSchema?: ToolBlobSchema
  ): Promise<ToolCallResult<T>> {
    await this.ensureSchemasFetched();

    // Get blob schema
    const effectiveBlobSchema = blobSchema ?? this.toolSchemaCache.get(name)?.blobSchema;

    let blobContext: BlobContext | undefined;

    // Prepare blob context if there are blob fields and blob interceptor is available
    if (
      this.blobInterceptor &&
      effectiveBlobSchema &&
      (effectiveBlobSchema.inputBlobs.length > 0 || effectiveBlobSchema.outputBlobs.length > 0)
    ) {
      blobContext = await this.blobInterceptor.prepareBlobContext(args, effectiveBlobSchema);
    }

    // Send the request
    const response = (await this.sendRequest("tools/call", {
      name,
      arguments: args,
      ...(blobContext && { _blobContext: blobContext }),
    })) as {
      content: Array<{ type: string; text?: string }>;
      isError?: boolean;
    };

    // Parse the result
    const textContent = response.content.find((c) => c.type === "text");
    let data: T;

    if (textContent?.text) {
      try {
        data = JSON.parse(textContent.text) as T;
      } catch {
        data = textContent.text as unknown as T;
      }
    } else {
      data = undefined as unknown as T;
    }

    return {
      data,
      isError: response.isError,
    };
  }

  /**
   * List available tools
   */
  async listTools(): Promise<McpToolsListResponse> {
    await this.ensureSchemasFetched();
    return {
      tools: Array.from(this.toolSchemaCache.values()).map((c) => c.schema),
    };
  }

  /**
   * Initialize the client connection
   * This is optional but can be used to verify connectivity
   */
  async initialize(): Promise<void> {
    await this.sendRequest("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: "@agent-web-portal/client",
        version: "0.1.0",
      },
    });

    // Fetch tool schemas
    await this.ensureSchemasFetched();
  }
}
