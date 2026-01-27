/**
 * AWP Client
 *
 * A client for interacting with Agent Web Portal servers,
 * with automatic blob handling through presigned URLs.
 */

import type {
  BlobContext,
  McpToolAwpExtension,
  McpToolSchema,
  McpToolsListResponse,
} from "@agent-web-portal/core";
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
 * Tool call result with separated output and blobs
 * 
 * For tools with output blobs:
 * - `output` contains the non-blob output fields
 * - `blobs` contains the blob field values (permanent URIs like s3://...)
 * 
 * For tools without output blobs:
 * - `output` contains all output fields
 * - `blobs` is an empty object
 */
export interface ToolCallResult<TOutput = unknown, TBlobs = Record<string, string>> {
  /** The non-blob output data */
  output: TOutput;
  /** The blob output URIs (permanent storage URIs) */
  blobs: TBlobs;
  /** Whether the call resulted in an error */
  isError?: boolean;
}

/**
 * Tool schema with AWP blob handling applied
 * - inputSchema has output blob fields removed (they're handled by the client)
 * - outputBlobFields lists the fields that will appear in result.blobs
 */
export interface AwpToolSchema {
  name: string;
  description?: string;
  /** Input schema with output blob fields removed */
  inputSchema: Record<string, unknown>;
  /** Output blob field names (will appear in result.blobs) */
  outputBlobFields: string[];
  /** Input blob field names (require s3:// URIs in args) */
  inputBlobFields: string[];
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
 * 2. Identifies blob fields from the _awp.blob extension
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
 * console.log(result.output.metadata); // { pageCount: 10 }
 * console.log(result.blobs.thumbnail); // s3://my-bucket/output/thumb.png
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

      if (responseBody?.auth_init_endpoint) {
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
   * Extract blob fields from the _awp extension
   * @param awp - The _awp extension object from the tool schema
   * @param type - "input" or "output"
   */
  private extractBlobFieldsFromAwp(
    awp: McpToolAwpExtension | undefined,
    type: "input" | "output"
  ): string[] {
    // New simplified format: _awp.blob.input/output are string arrays
    if (!awp?.blob?.[type]) {
      return [];
    }
    return [...awp.blob[type]!];
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
      // Extract blob fields from the _awp.blob extension (simple string arrays)
      const inputBlobs = this.extractBlobFieldsFromAwp(tool._awp, "input");
      const outputBlobs = this.extractBlobFieldsFromAwp(tool._awp, "output");

      this.toolSchemaCache.set(tool.name, {
        schema: tool,
        blobSchema: {
          inputBlobs,
          outputBlobs,
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
   * The caller provides:
   * - args: Tool arguments (without output blob fields, those are handled automatically)
   *   - Input blob fields should contain permanent URIs (e.g., s3://bucket/key)
   *
   * The client:
   * - Generates presigned GET URLs for input blobs
   * - Generates presigned PUT URLs for output blobs
   * - Sends the request with the full arguments including output blob presigned URLs
   * - Returns the result split into { output, blobs }
   *
   * @param name - Tool name
   * @param args - Tool arguments (input blob fields contain s3:// URIs)
   * @param blobSchema - Optional blob schema override
   * @returns The tool result with output and blobs separated
   */
  async callTool<TOutput = unknown, TBlobs = Record<string, string>>(
    name: string,
    args: Record<string, unknown>,
    blobSchema?: ToolBlobSchema
  ): Promise<ToolCallResult<TOutput, TBlobs>> {
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

    // Build the full arguments to send to the AWP tool
    // This includes the original args plus presigned URLs for output blobs
    const fullArgs = { ...args };
    if (blobContext && effectiveBlobSchema) {
      // Add output blob presigned URLs to the arguments
      for (const field of effectiveBlobSchema.outputBlobs) {
        fullArgs[field] = blobContext.output[field];
      }
    }

    // Send the request
    const response = (await this.sendRequest("tools/call", {
      name,
      arguments: fullArgs,
      ...(blobContext && { _blobContext: blobContext }),
    })) as {
      content: Array<{ type: string; text?: string }>;
      isError?: boolean;
    };

    // Parse the result
    const textContent = response.content.find((c) => c.type === "text");
    let rawData: Record<string, unknown>;

    if (textContent?.text) {
      try {
        rawData = JSON.parse(textContent.text) as Record<string, unknown>;
      } catch {
        rawData = { text: textContent.text };
      }
    } else {
      rawData = {};
    }

    // Separate output and blobs
    const blobs: Record<string, string> = {};
    const output: Record<string, unknown> = {};

    if (effectiveBlobSchema && blobContext) {
      // Extract output blob URIs
      for (const field of effectiveBlobSchema.outputBlobs) {
        // Use the permanent URI from blobContext, not the value from the response
        blobs[field] = blobContext.outputUri[field];
      }

      // Copy non-blob fields to output
      for (const [key, value] of Object.entries(rawData)) {
        if (!effectiveBlobSchema.outputBlobs.includes(key)) {
          output[key] = value;
        }
      }
    } else {
      // No blob schema, just return everything as output
      Object.assign(output, rawData);
    }

    return {
      output: output as TOutput,
      blobs: blobs as TBlobs,
      isError: response.isError,
    };
  }

  /**
   * List available tools with AWP blob handling applied
   * 
   * Returns tool schemas where:
   * - inputSchema has output blob fields removed (they're handled by the client)
   * - inputBlobFields lists fields that require s3:// URIs
   * - outputBlobFields lists fields that will appear in result.blobs
   */
  async listTools(): Promise<{ tools: AwpToolSchema[] }> {
    await this.ensureSchemasFetched();

    const tools: AwpToolSchema[] = [];

    for (const cached of this.toolSchemaCache.values()) {
      const { schema, blobSchema } = cached;

      // Clone the inputSchema and remove output blob fields
      const inputSchema = this.removeOutputBlobsFromSchema(
        schema.inputSchema,
        blobSchema.outputBlobs
      );

      tools.push({
        name: schema.name,
        description: schema.description,
        inputSchema,
        inputBlobFields: blobSchema.inputBlobs,
        outputBlobFields: blobSchema.outputBlobs,
      });
    }

    return { tools };
  }

  /**
   * Remove output blob fields from the input schema
   * This creates a new schema without the specified fields
   */
  private removeOutputBlobsFromSchema(
    schema: Record<string, unknown>,
    outputBlobs: string[]
  ): Record<string, unknown> {
    if (outputBlobs.length === 0) {
      return schema;
    }

    const newSchema = { ...schema };

    // Remove from properties
    if (newSchema.properties && typeof newSchema.properties === "object") {
      const newProperties = { ...newSchema.properties as Record<string, unknown> };
      for (const field of outputBlobs) {
        delete newProperties[field];
      }
      newSchema.properties = newProperties;
    }

    // Remove from required array
    if (Array.isArray(newSchema.required)) {
      newSchema.required = newSchema.required.filter(
        (field: string) => !outputBlobs.includes(field)
      );
      // Remove required if empty
      if (newSchema.required.length === 0) {
        delete newSchema.required;
      }
    }

    return newSchema;
  }

  /**
   * Get the raw MCP tools list (without AWP processing)
   * Use this if you need the original server response
   */
  async listToolsRaw(): Promise<McpToolsListResponse> {
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
