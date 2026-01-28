/**
 * AWP Client
 *
 * A client for interacting with Agent Web Portal servers,
 * with automatic blob handling through presigned URLs.
 *
 * This client performs bidirectional translation between:
 * - LLM-facing format (what the LLM provides/receives)
 * - Tool-facing format (what the Tool receives/returns)
 *
 * LLM-facing (what LLM provides):
 * - Input blob: { uri: "s3://...", contentType?: "image/png" }
 * - Output blob: { accept?: "image/png" }
 *
 * Tool-facing (what Tool receives):
 * - Input blob: { url: "https://presigned...", contentType?: "image/png" }
 * - Output blob: { url: "https://presigned-put...", accept?: "image/png" }
 *
 * LLM-facing (what LLM receives in response):
 * - Output blob: { uri: "s3://...", contentType?: "image/png" }
 */

import type {
  BlobFieldDescriptor,
  LlmBlobOutputResultValue,
  McpToolAwpExtension,
  McpToolSchema,
  McpToolsListResponse,
} from "@agent-web-portal/core";
import type { AuthChallengeResponse, AwpAuth } from "./auth/index.ts";
import {
  BlobInterceptor,
  type ExtendedBlobContext,
  type ToolBlobSchema,
} from "./blob-interceptor.ts";
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
 * - `blobs` contains the blob field values in LLM-facing format: { uri, contentType? }
 *
 * For tools without output blobs:
 * - `output` contains all output fields
 * - `blobs` is an empty object
 */
export interface ToolCallResult<
  TOutput = unknown,
  TBlobs = Record<string, LlmBlobOutputResultValue>,
> {
  /** The non-blob output data */
  output: TOutput;
  /** The blob output values (LLM-facing format: { uri, contentType? }) */
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
   * Extract blob fields from the _awp extension (new format)
   * @param awp - The _awp extension object from the tool schema
   * @param type - "input" or "output"
   */
  private extractBlobFieldsFromAwp(
    awp: McpToolAwpExtension | undefined,
    type: "input" | "output"
  ): string[] {
    if (!awp?.blob) {
      return [];
    }

    // New format: _awp.blob is Record<string, { kind: 'input' | 'output', description: string }>
    const fields: string[] = [];
    for (const [fieldName, descriptor] of Object.entries(awp.blob)) {
      if (descriptor.kind === type) {
        fields.push(fieldName);
      }
    }
    return fields;
  }

  /**
   * Extract blob descriptors from the _awp extension
   * @param awp - The _awp extension object from the tool schema
   */
  private extractBlobDescriptorsFromAwp(
    awp: McpToolAwpExtension | undefined
  ): Record<string, BlobFieldDescriptor> {
    return awp?.blob ?? {};
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
      // Extract blob fields from the _awp.blob extension (new format)
      const inputBlobs = this.extractBlobFieldsFromAwp(tool._awp, "input");
      const outputBlobs = this.extractBlobFieldsFromAwp(tool._awp, "output");
      const blobDescriptors = this.extractBlobDescriptorsFromAwp(tool._awp);

      this.toolSchemaCache.set(tool.name, {
        schema: tool,
        blobSchema: {
          inputBlobs,
          outputBlobs,
          blobDescriptors,
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
   * The caller provides LLM-facing args:
   * - Input blob fields: { uri: "s3://...", contentType?: "image/png" }
   * - Output blob fields: { accept?: "image/png" } (optional, for preferred output type)
   * - Other fields: as normal
   *
   * The client:
   * 1. Transforms LLM args to Tool args (generates presigned URLs)
   * 2. Sends the request with Tool-facing arguments
   * 3. Transforms Tool result to LLM result (injects URIs)
   * 4. Returns the result split into { output, blobs }
   *
   * @param name - Tool name
   * @param args - LLM-facing tool arguments
   * @param blobSchema - Optional blob schema override
   * @returns The tool result with output and blobs separated
   */
  async callTool<TOutput = unknown, TBlobs = Record<string, LlmBlobOutputResultValue>>(
    name: string,
    args: Record<string, unknown>,
    blobSchema?: ToolBlobSchema
  ): Promise<ToolCallResult<TOutput, TBlobs>> {
    await this.ensureSchemasFetched();

    // Get blob schema
    const effectiveBlobSchema = blobSchema ?? this.toolSchemaCache.get(name)?.blobSchema;

    let blobContext: ExtendedBlobContext | undefined;
    let toolArgs = args;

    // Transform LLM args to Tool args if there are blob fields
    if (
      this.blobInterceptor &&
      effectiveBlobSchema &&
      (effectiveBlobSchema.inputBlobs.length > 0 || effectiveBlobSchema.outputBlobs.length > 0)
    ) {
      const result = await this.blobInterceptor.transformLlmArgsToToolArgs(
        args,
        effectiveBlobSchema
      );
      toolArgs = result.toolArgs;
      blobContext = result.blobContext;
    }

    // Send the request with Tool-facing arguments
    const response = (await this.sendRequest("tools/call", {
      name,
      arguments: toolArgs,
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

    // Transform Tool result to LLM result
    const blobs: Record<string, LlmBlobOutputResultValue> = {};
    const output: Record<string, unknown> = {};

    if (effectiveBlobSchema && blobContext && this.blobInterceptor) {
      // Transform the result using the blob interceptor
      const llmResult = this.blobInterceptor.transformToolResultToLlmResult(
        rawData,
        blobContext,
        effectiveBlobSchema
      );

      // Extract output blob values to the blobs object
      for (const field of effectiveBlobSchema.outputBlobs) {
        const blobValue = llmResult[field] as LlmBlobOutputResultValue | undefined;
        if (blobValue) {
          blobs[field] = blobValue;
        }
      }

      // Copy non-blob fields to output
      for (const [key, value] of Object.entries(llmResult)) {
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
   * List available tools with AWP blob handling applied (LLM-facing schema)
   *
   * Transforms Tool-facing schema to LLM-facing schema:
   * - Input blob params: { url, contentType? } -> { uri, contentType? }
   * - Output blob params: { url, accept? } -> { accept? } (url removed)
   * - Output blob result will include: { uri, contentType? }
   *
   * Returns tool schemas where:
   * - inputSchema has blob fields transformed for LLM
   * - inputBlobFields lists fields that require { uri: "s3://..." } format
   * - outputBlobFields lists fields that will appear in result.blobs
   */
  async listTools(): Promise<{ tools: AwpToolSchema[] }> {
    await this.ensureSchemasFetched();

    const tools: AwpToolSchema[] = [];

    for (const cached of this.toolSchemaCache.values()) {
      const { schema, blobSchema } = cached;

      // Transform the inputSchema for LLM-facing format
      const inputSchema = this.transformSchemaForLlm(schema.inputSchema, blobSchema);

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
   * Transform Tool-facing schema to LLM-facing schema
   *
   * Input blobs: { url, contentType? } -> { uri, contentType? }
   * Output blobs: { url, accept? } -> { accept? } (url field removed)
   */
  private transformSchemaForLlm(
    schema: Record<string, unknown>,
    blobSchema: ToolBlobSchema
  ): Record<string, unknown> {
    const allBlobFields = [...blobSchema.inputBlobs, ...blobSchema.outputBlobs];
    if (allBlobFields.length === 0) {
      return schema;
    }

    const newSchema = { ...schema };

    if (newSchema.properties && typeof newSchema.properties === "object") {
      const newProperties = { ...(newSchema.properties as Record<string, unknown>) };

      // Transform input blob fields: remove 'url', rename to 'uri'
      for (const field of blobSchema.inputBlobs) {
        const prop = newProperties[field] as Record<string, unknown> | undefined;
        if (prop && typeof prop === "object") {
          const descriptor = blobSchema.blobDescriptors?.[field];
          newProperties[field] = {
            type: "object",
            description: descriptor?.description ?? `Input blob: ${field}`,
            properties: {
              uri: {
                type: "string",
                format: "uri",
                description: "Resource identifier for the blob (e.g., s3://bucket/key)",
              },
              contentType: {
                type: "string",
                description: "MIME type of the blob content",
              },
            },
            required: ["uri"],
          };
        }
      }

      // Transform output blob fields: remove 'url', keep only 'accept'
      for (const field of blobSchema.outputBlobs) {
        const prop = newProperties[field] as Record<string, unknown> | undefined;
        if (prop && typeof prop === "object") {
          const descriptor = blobSchema.blobDescriptors?.[field];
          newProperties[field] = {
            type: "object",
            description: descriptor?.description ?? `Output blob: ${field}`,
            properties: {
              accept: {
                type: "string",
                description: "Accepted MIME types for the output",
              },
            },
          };
        }
      }

      newSchema.properties = newProperties;
    }

    // Update required array: output blob fields are no longer required for LLM
    // (the url was required for Tool, but for LLM only accept is optional)
    if (Array.isArray(newSchema.required)) {
      newSchema.required = (newSchema.required as string[]).filter(
        (field: string) => !blobSchema.outputBlobs.includes(field)
      );
      if ((newSchema.required as string[]).length === 0) {
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
