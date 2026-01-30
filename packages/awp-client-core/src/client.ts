/**
 * AWP Client with CAS Blob Exchange
 *
 * A client for interacting with Agent Web Portal servers,
 * with automatic blob handling through CAS (Content-Addressable Storage).
 *
 * This client performs bidirectional translation between:
 * - LLM-facing format (what the LLM provides/receives)
 * - Tool-facing format (what the Tool receives/returns)
 *
 * LLM-facing (what LLM provides):
 * - Input blob: { "cas-node": "sha256:...", path?: "." }
 * - Output blob: { accept?: "image/png" }
 *
 * Tool-facing (what Tool receives):
 * - Input blob: { "#cas-endpoint": "https://...", "cas-node": "sha256:...", path: "." }
 * - Output blob: { "#cas-endpoint": "https://...", accept?: "image/png" }
 *
 * LLM-facing (what LLM receives in response):
 * - Output blob: { "cas-node": "sha256:...", path?: "." }
 */

import type { LocalStorageProvider } from "@agent-web-portal/cas-client-core";
import type {
  BlobDescriptors,
  McpToolAwpExtension,
  McpToolSchema,
  McpToolsListResponse,
} from "@agent-web-portal/core";
import { type CasBlobContext, CasInterceptor } from "./cas-interceptor.ts";
import type {
  AuthChallengeResponse,
  AwpAuth,
  AwpClientOptions,
  AwpToolSchema,
  CasBlobRefOutput,
  CreateTicketResponse,
  ToolBlobSchema,
  ToolCallResult,
} from "./types.ts";

/**
 * Cached tool schema with blob information
 */
interface CachedToolSchema {
  schema: McpToolSchema;
  blobSchema: ToolBlobSchema;
}

/**
 * AWP Client with CAS Blob Exchange
 *
 * Provides a high-level interface for calling AWP tools with automatic
 * CAS-based blob handling. The client:
 *
 * 1. Fetches tool schemas from the server
 * 2. Identifies blob fields from the _awp.blob extension
 * 3. Creates CAS tickets for input and output blobs
 * 4. Sends the request with #cas-endpoint injected
 * 5. Returns results with CAS node references
 *
 * @example
 * ```typescript
 * const client = new AwpClient({
 *   endpoint: "https://my-awp-server.com",
 *   casEndpoint: "https://cas.example.com/api",
 * });
 *
 * // Call a tool
 * const result = await client.callTool("process-image", {
 *   image: { "cas-node": "sha256:abc123..." },
 *   options: { quality: 80 },
 * });
 *
 * console.log(result.output.metadata); // { width: 800, height: 600 }
 * console.log(result.blobs.result); // { "cas-node": "sha256:def456..." }
 * ```
 */
export class AwpClient {
  private endpoint: string;
  private casEndpoint: string;
  private auth: AwpAuth | null;
  private casStorage?: LocalStorageProvider;
  private casInterceptor: CasInterceptor;
  private fetchFn: typeof fetch;
  private headers: Record<string, string>;
  private toolSchemaCache: Map<string, CachedToolSchema> = new Map();
  private schemasFetched = false;
  private requestId = 0;

  constructor(options: AwpClientOptions) {
    this.endpoint = options.endpoint.replace(/\/$/, "");
    this.casEndpoint = options.casEndpoint.replace(/\/$/, "");
    this.auth = options.auth ?? null;
    this.casStorage = options.casStorage;
    // Bind fetch to globalThis to prevent "Illegal invocation" in browsers
    this.fetchFn = options.fetch ?? fetch.bind(globalThis);
    this.headers = options.headers ?? {};

    // Create CAS interceptor
    this.casInterceptor = new CasInterceptor({
      casEndpoint: this.casEndpoint,
      createTicket: (scope, writable) => this.createCasTicket(scope, writable),
    });
  }

  // ============================================================================
  // CAS Ticket Management
  // ============================================================================

  /**
   * Create a CAS ticket for blob access
   */
  private async createCasTicket(
    scope: string | string[],
    writable: boolean
  ): Promise<CreateTicketResponse> {
    const res = await this.fetchFn(`${this.casEndpoint}/auth/ticket`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...this.headers,
        ...(await this.getAuthHeaders()),
      },
      body: JSON.stringify({
        scope,
        writable,
      }),
    });

    if (!res.ok) {
      throw new Error(`Failed to create CAS ticket: ${res.status}`);
    }

    return res.json() as Promise<CreateTicketResponse>;
  }

  /**
   * Get auth headers if auth is configured
   */
  private async getAuthHeaders(): Promise<Record<string, string>> {
    if (!this.auth || !(await this.auth.hasValidKey(this.casEndpoint))) {
      return {};
    }
    return this.auth.sign(this.casEndpoint, "POST", this.casEndpoint, "");
  }

  // ============================================================================
  // JSON-RPC Communication
  // ============================================================================

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
      console.error(`[AwpClient] RPC error:`, result.error);
      throw new Error(`RPC error: ${result.error.message}`);
    }

    return result.result;
  }

  // ============================================================================
  // Schema Management
  // ============================================================================

  /**
   * Extract blob fields from the _awp extension
   */
  private extractBlobFieldsFromAwp(
    awp: McpToolAwpExtension | undefined,
    type: "input" | "output"
  ): string[] {
    if (!awp?.blob) {
      return [];
    }
    return Object.keys(awp.blob[type] ?? {});
  }

  /**
   * Extract blob descriptors from the _awp extension
   */
  private extractBlobDescriptorsFromAwp(awp: McpToolAwpExtension | undefined): BlobDescriptors {
    return awp?.blob ?? { input: {}, output: {} };
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

  // ============================================================================
  // Tool Calling
  // ============================================================================

  /**
   * Call a tool with automatic CAS blob handling
   *
   * The caller provides LLM-facing args:
   * - Input blob fields: { "cas-node": "sha256:...", path?: "." }
   * - Output blob fields: { accept?: "image/png" }
   * - Other fields: as normal
   *
   * The client:
   * 1. Creates CAS tickets and injects #cas-endpoint
   * 2. Sends the request with Tool-facing arguments
   * 3. Extracts CAS node references from the result
   * 4. Returns the result split into { output, blobs }
   */
  async callTool<TOutput = unknown, TBlobs = Record<string, CasBlobRefOutput>>(
    name: string,
    args: Record<string, unknown>,
    blobSchema?: ToolBlobSchema
  ): Promise<ToolCallResult<TOutput, TBlobs>> {
    await this.ensureSchemasFetched();

    // Get blob schema
    const effectiveBlobSchema = blobSchema ?? this.toolSchemaCache.get(name)?.blobSchema;

    let blobContext: CasBlobContext | undefined;
    let toolArgs = args;

    // Transform LLM args to Tool args if there are blob fields
    if (
      effectiveBlobSchema &&
      (effectiveBlobSchema.inputBlobs.length > 0 || effectiveBlobSchema.outputBlobs.length > 0)
    ) {
      const result = await this.casInterceptor.transformLlmArgsToToolArgs(
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
    if (effectiveBlobSchema && blobContext) {
      const { output, blobs } = this.casInterceptor.transformToolResultToLlmResult(
        rawData,
        blobContext,
        effectiveBlobSchema
      );

      return {
        output: output as TOutput,
        blobs: blobs as TBlobs,
        isError: response.isError,
      };
    }

    // No blob schema, just return everything as output
    return {
      output: rawData as TOutput,
      blobs: {} as TBlobs,
      isError: response.isError,
    };
  }

  // ============================================================================
  // Tool Listing
  // ============================================================================

  /**
   * List available tools with LLM-facing schema (for AI agents)
   *
   * Transforms Tool-facing schema to LLM-facing schema:
   * - Input blob params: CasBlobRefInput format
   * - Output blob params: { accept? } format
   */
  async listTools(): Promise<{ tools: AwpToolSchema[] }> {
    return this.listToolsForLlm();
  }

  /**
   * List available tools with LLM-facing schema
   */
  async listToolsForLlm(): Promise<{ tools: AwpToolSchema[] }> {
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
   * Transform Tool-facing schema to LLM-facing schema for CAS
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

      // Transform input blob fields to CAS format
      for (const field of blobSchema.inputBlobs) {
        const description = blobSchema.blobDescriptors?.input?.[field];
        newProperties[field] = {
          type: "object",
          description: description ?? `Input blob: ${field}`,
          properties: {
            "cas-node": {
              type: "string",
              description: "CAS node key (sha256:...)",
            },
            path: {
              type: "string",
              description:
                'Path within the node ("." for node itself, "./path/to/file" for collection children)',
              default: ".",
            },
          },
          required: ["cas-node"],
        };
      }

      // Transform output blob fields
      for (const field of blobSchema.outputBlobs) {
        const description = blobSchema.blobDescriptors?.output?.[field];
        newProperties[field] = {
          type: "object",
          description: description ?? `Output blob: ${field}`,
          properties: {
            accept: {
              type: "string",
              description: "Accepted MIME types for the output",
            },
          },
        };
      }

      newSchema.properties = newProperties;
    }

    // Update required array: output blob fields are not required for LLM
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
   * List available tools with Tool-facing schema (for debugging/MCP clients)
   */
  async listToolsForTool(): Promise<McpToolsListResponse> {
    await this.ensureSchemasFetched();
    return {
      tools: Array.from(this.toolSchemaCache.values()).map((c) => c.schema),
    };
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  /**
   * Initialize the client connection
   */
  async initialize(): Promise<void> {
    await this.sendRequest("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: "@agent-web-portal/awp-client-core",
        version: "0.0.1",
      },
    });

    await this.ensureSchemasFetched();
  }

  // ============================================================================
  // CAS Client Access
  // ============================================================================

  /**
   * Get the CAS endpoint
   */
  getCasEndpoint(): string {
    return this.casEndpoint;
  }

  /**
   * Get the CAS storage provider
   */
  getCasStorage(): LocalStorageProvider | undefined {
    return this.casStorage;
  }
}
