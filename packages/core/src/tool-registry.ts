import type { ZodSchema } from "zod";
import {
  type BlobDescriptorMap,
  extractBlobFields,
  extractCombinedBlobDescriptors,
} from "./blob.ts";
import type { ToolHandlerContext } from "./define-tool.ts";
import type {
  AgentWebPortalConfig,
  BlobContext,
  McpToolAwpExtension,
  McpToolSchema,
  McpToolsListResponse,
  ToolDefinition,
  ToolRegistrationOptions,
} from "./types.ts";
import { BlobContextError, ToolNotFoundError, ToolValidationError } from "./types.ts";
import { zodToJsonSchema } from "./utils/zod-to-json-schema.ts";

/**
 * Extended tool definition with blob metadata
 */
interface ToolDefinitionWithBlobs extends ToolDefinition {
  /** Blob field names in input schema */
  inputBlobs: string[];
  /** Blob field names in output schema */
  outputBlobs: string[];
  /** Combined blob descriptors for _awp.blob extension */
  blobDescriptors: BlobDescriptorMap;
}

/**
 * Attempt to parse stringified JSON arguments from XML-based MCP clients.
 *
 * Some MCP clients serialize all arguments as strings. This function attempts
 * to parse each string value as JSON, returning the coerced object.
 *
 * @param args - The original arguments (expected to be Record<string, string>)
 * @returns Coerced arguments with parsed JSON values
 */
function coerceStringifiedArgs(args: unknown): unknown {
  if (typeof args !== "object" || args === null) {
    return args;
  }

  const coerced: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args as Record<string, unknown>)) {
    if (typeof value === "string") {
      try {
        coerced[key] = JSON.parse(value);
      } catch {
        // Not valid JSON, keep as string
        coerced[key] = value;
      }
    } else {
      coerced[key] = value;
    }
  }
  return coerced;
}

/**
 * Registry for managing tools
 * Handles tool registration, validation, and invocation
 */
export class ToolRegistry {
  private tools: Map<string, ToolDefinitionWithBlobs> = new Map();
  private config: AgentWebPortalConfig = {};

  /**
   * Set runtime configuration
   * Called by AgentWebPortalBuilder.build() to apply runtime behavior options
   */
  setConfig(config: AgentWebPortalConfig): void {
    this.config = config;
  }

  /**
   * Register a new tool
   * @param name - Unique tool name
   * @param options - Tool definition including schemas and handler
   */
  registerTool<TInputSchema extends ZodSchema, TOutputSchema extends ZodSchema>(
    name: string,
    options: ToolRegistrationOptions<TInputSchema, TOutputSchema>
  ): void {
    if (this.tools.has(name)) {
      throw new Error(`Tool "${name}" is already registered`);
    }

    // Extract blob fields from schemas
    const inputBlobs = extractBlobFields(options.inputSchema);
    const outputBlobs = extractBlobFields(options.outputSchema);

    // Extract combined blob descriptors for _awp.blob extension
    const blobDescriptors = extractCombinedBlobDescriptors(
      options.inputSchema,
      options.outputSchema
    );

    this.tools.set(name, {
      inputSchema: options.inputSchema,
      outputSchema: options.outputSchema,
      handler: options.handler,
      description: options.description,
      inputBlobs,
      outputBlobs,
      blobDescriptors,
    });
  }

  /**
   * Get blob field information for a tool
   * @param name - Tool name
   * @returns Object with input and output blob field names, or undefined if tool not found
   */
  getToolBlobInfo(name: string): { inputBlobs: string[]; outputBlobs: string[] } | undefined {
    const tool = this.tools.get(name);
    if (!tool) {
      return undefined;
    }
    return {
      inputBlobs: tool.inputBlobs,
      outputBlobs: tool.outputBlobs,
    };
  }

  /**
   * Check if a tool exists
   * @param name - Tool name to check
   */
  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get a tool by name
   * @param name - Tool name
   */
  getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * Get all registered tool names
   */
  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Invoke a tool by name with validation
   * @param name - Tool name
   * @param args - Tool arguments
   * @param blobContext - Optional blob context with presigned URLs
   */
  async invokeTool(name: string, args: unknown, blobContext?: BlobContext): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new ToolNotFoundError(name);
    }

    const hasInputBlobs = tool.inputBlobs.length > 0;
    const hasOutputBlobs = tool.outputBlobs.length > 0;

    // Validate blob context if tool has blobs
    if (hasInputBlobs || hasOutputBlobs) {
      if (!blobContext) {
        throw new BlobContextError(name, "Tool requires blob context but none was provided");
      }

      // Validate input blob context
      for (const blobField of tool.inputBlobs) {
        if (!blobContext.input[blobField]) {
          throw new BlobContextError(
            name,
            `Missing presigned URL for input blob field: ${blobField}`
          );
        }
      }

      // Validate output blob context
      for (const blobField of tool.outputBlobs) {
        if (!blobContext.output[blobField]) {
          throw new BlobContextError(
            name,
            `Missing presigned URL for output blob field: ${blobField}`
          );
        }
        if (!blobContext.outputUri[blobField]) {
          throw new BlobContextError(
            name,
            `Missing permanent URI for output blob field: ${blobField}`
          );
        }
      }
    }

    // Validate input
    let inputResult = tool.inputSchema.safeParse(args);

    // If validation fails and coercion is enabled, try parsing stringified args
    if (!inputResult.success && this.config.coerceXmlClientArgs) {
      const coercedArgs = coerceStringifiedArgs(args);
      const retryResult = tool.inputSchema.safeParse(coercedArgs);
      if (retryResult.success) {
        inputResult = retryResult;
      }
    }

    if (!inputResult.success) {
      throw new ToolValidationError(name, `Invalid input: ${inputResult.error.message}`);
    }

    // Prepare handler arguments (exclude blob fields from args)
    let handlerArgs = inputResult.data;
    if (hasInputBlobs && typeof handlerArgs === "object" && handlerArgs !== null) {
      const argsWithoutBlobs = { ...handlerArgs };
      for (const blobField of tool.inputBlobs) {
        delete (argsWithoutBlobs as Record<string, unknown>)[blobField];
      }
      handlerArgs = argsWithoutBlobs;
    }

    // Prepare handler context
    const handlerContext: ToolHandlerContext = {
      blobs: {
        input: blobContext?.input ?? {},
        output: blobContext?.output ?? {},
      },
    };

    // Execute handler with context
    const result = await tool.handler(handlerArgs, handlerContext);

    // Fill in output blob URIs
    let finalResult = result;
    if (hasOutputBlobs && blobContext && typeof result === "object" && result !== null) {
      finalResult = { ...result };
      for (const blobField of tool.outputBlobs) {
        (finalResult as Record<string, unknown>)[blobField] = blobContext.outputUri[blobField];
      }
    }

    // Validate output
    const outputResult = tool.outputSchema.safeParse(finalResult);
    if (!outputResult.success) {
      throw new ToolValidationError(name, `Invalid output: ${outputResult.error.message}`);
    }

    return outputResult.data;
  }

  /**
   * Convert a tool to MCP schema format
   *
   * For tools with output blobs, the output blob fields are added to the inputSchema
   * For tools with output blobs, the output blob fields are added to the inputSchema
   * so that generic MCP clients can see they need to provide presigned writable URLs.
   * AWP-aware Agent runtimes will use _awp.blob to understand blob field types and
   * perform the necessary URI/URL translations.
   *
   * Tool-facing schema format:
   * - Input blob params: { url: string, contentType?: string }
   * - Output blob params: { url: string, accept?: string }
   *
   * @param name - Tool name
   */
  toMcpSchema(name: string): McpToolSchema | null {
    const tool = this.tools.get(name);
    if (!tool) {
      return null;
    }

    // Build the base inputSchema from the tool's input schema
    const inputSchema = zodToJsonSchema(tool.inputSchema) as {
      type?: string;
      properties?: Record<string, unknown>;
      required?: string[];
    };

    // Ensure properties object exists
    if (!inputSchema.properties) {
      inputSchema.properties = {};
    }

    // Transform input blob fields to the tool-facing format: { url: string, contentType?: string }
    for (const blobField of tool.inputBlobs) {
      const descriptor = tool.blobDescriptors[blobField];
      inputSchema.properties[blobField] = {
        type: "object",
        description: descriptor?.description ?? `Input blob: ${blobField}`,
        properties: {
          url: {
            type: "string",
            format: "uri",
            description: "Presigned readonly URL for reading the blob",
          },
          contentType: {
            type: "string",
            description: "MIME type of the blob content (similar to HTTP Content-Type header)",
          },
        },
        required: ["url"],
      };
    }

    // For output blobs, add them to inputSchema as parameters
    // Tool-facing format: { url: string, accept?: string }
    for (const blobField of tool.outputBlobs) {
      const descriptor = tool.blobDescriptors[blobField];
      inputSchema.properties[blobField] = {
        type: "object",
        description: descriptor?.description ?? `Output blob: ${blobField}`,
        properties: {
          url: {
            type: "string",
            format: "uri",
            description: "Presigned read-write URL for writing the blob",
          },
          accept: {
            type: "string",
            description: "Accepted MIME types for the output (similar to HTTP Accept header)",
          },
        },
        required: ["url"],
      };
    }

    // Ensure all blob fields are in the required array
    if (!inputSchema.required) {
      inputSchema.required = [];
    }
    for (const blobField of [...tool.inputBlobs, ...tool.outputBlobs]) {
      if (!inputSchema.required.includes(blobField)) {
        inputSchema.required.push(blobField);
      }
    }

    // Build the schema object
    const schema: McpToolSchema = {
      name,
      description: tool.description,
      inputSchema,
    };

    // Add _awp.blob extension with the new format: Record<string, { type, description }>
    const hasBlobs = Object.keys(tool.blobDescriptors).length > 0;
    if (hasBlobs) {
      const awp: McpToolAwpExtension = {
        blob: { ...tool.blobDescriptors },
      };
      schema._awp = awp;
    }

    return schema;
  }

  /**
   * Get all tools in MCP format for tools/list response
   */
  toMcpToolsList(): McpToolsListResponse {
    const tools: McpToolSchema[] = [];

    for (const name of this.tools.keys()) {
      const schema = this.toMcpSchema(name);
      if (schema) {
        tools.push(schema);
      }
    }

    return { tools };
  }

  /**
   * Clear all registered tools
   */
  clear(): void {
    this.tools.clear();
  }
}
