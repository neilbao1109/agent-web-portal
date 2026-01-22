import type { ZodSchema } from "zod";
import type {
  AgentWebPortalConfig,
  McpToolSchema,
  McpToolsListResponse,
  ToolDefinition,
  ToolRegistrationOptions,
} from "./types.ts";
import { ToolNotFoundError, ToolValidationError } from "./types.ts";
import { zodToJsonSchema } from "./utils/zod-to-json-schema.ts";

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
  private tools: Map<string, ToolDefinition> = new Map();
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

    this.tools.set(name, {
      inputSchema: options.inputSchema,
      outputSchema: options.outputSchema,
      handler: options.handler,
      description: options.description,
    });
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
   */
  async invokeTool(name: string, args: unknown): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new ToolNotFoundError(name);
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

    // Execute handler
    const result = await tool.handler(inputResult.data);

    // Validate output
    const outputResult = tool.outputSchema.safeParse(result);
    if (!outputResult.success) {
      throw new ToolValidationError(name, `Invalid output: ${outputResult.error.message}`);
    }

    return outputResult.data;
  }

  /**
   * Convert a tool to MCP schema format
   * @param name - Tool name
   */
  toMcpSchema(name: string): McpToolSchema | null {
    const tool = this.tools.get(name);
    if (!tool) {
      return null;
    }

    return {
      name,
      description: tool.description,
      inputSchema: zodToJsonSchema(tool.inputSchema),
    };
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
