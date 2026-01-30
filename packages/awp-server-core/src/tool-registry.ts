/**
 * AWP Server Core - Tool Registry
 *
 * Manages tool registration and provides MCP schema conversion.
 */

import type { ZodSchema } from "zod";
import type {
  DefinedTool,
  IBufferedCasClient,
  McpToolSchema,
  McpToolsListResponse,
  ToolHandler,
} from "./types.ts";
import { ToolNotFoundError, ToolValidationError } from "./types.ts";

/**
 * Convert a Zod schema to JSON Schema
 *
 * This is a simplified implementation that handles common Zod types.
 * For production use, consider using a library like zod-to-json-schema.
 */
function zodToJsonSchema(schema: ZodSchema): Record<string, unknown> {
  // Access the internal Zod type description
  const def = (
    schema as unknown as {
      _def: {
        typeName: string;
        description?: string;
        shape?: () => Record<string, ZodSchema>;
        innerType?: ZodSchema;
        options?: ZodSchema[];
        values?: string[];
        checks?: Array<{ kind: string; value?: unknown }>;
      };
    }
  )._def;
  const typeName = def.typeName;

  switch (typeName) {
    case "ZodString": {
      const result: Record<string, unknown> = { type: "string" };
      if (def.description) result.description = def.description;
      // Handle string constraints
      if (def.checks) {
        for (const check of def.checks) {
          if (check.kind === "min") result.minLength = check.value;
          if (check.kind === "max") result.maxLength = check.value;
          if (check.kind === "email") result.format = "email";
          if (check.kind === "url") result.format = "uri";
          if (check.kind === "uuid") result.format = "uuid";
        }
      }
      return result;
    }

    case "ZodNumber": {
      const result: Record<string, unknown> = { type: "number" };
      if (def.description) result.description = def.description;
      if (def.checks) {
        for (const check of def.checks) {
          if (check.kind === "min") result.minimum = check.value;
          if (check.kind === "max") result.maximum = check.value;
          if (check.kind === "int") result.type = "integer";
        }
      }
      return result;
    }

    case "ZodBoolean": {
      const result: Record<string, unknown> = { type: "boolean" };
      if (def.description) result.description = def.description;
      return result;
    }

    case "ZodArray": {
      const itemSchema = def.innerType ? zodToJsonSchema(def.innerType) : {};
      const result: Record<string, unknown> = { type: "array", items: itemSchema };
      if (def.description) result.description = def.description;
      return result;
    }

    case "ZodObject": {
      const shape = def.shape?.() ?? {};
      const properties: Record<string, unknown> = {};
      const required: string[] = [];

      for (const [key, value] of Object.entries(shape)) {
        properties[key] = zodToJsonSchema(value);
        // Check if the field is optional
        const valueDef = (value as unknown as { _def: { typeName: string } })._def;
        if (valueDef.typeName !== "ZodOptional" && valueDef.typeName !== "ZodDefault") {
          required.push(key);
        }
      }

      const result: Record<string, unknown> = {
        type: "object",
        properties,
      };
      if (required.length > 0) {
        result.required = required;
      }
      if (def.description) result.description = def.description;
      return result;
    }

    case "ZodOptional": {
      return def.innerType ? zodToJsonSchema(def.innerType) : {};
    }

    case "ZodDefault": {
      const inner = def.innerType ? zodToJsonSchema(def.innerType) : {};
      return {
        ...inner,
        default: (def as unknown as { defaultValue: () => unknown }).defaultValue?.(),
      };
    }

    case "ZodEnum": {
      const result: Record<string, unknown> = {
        type: "string",
        enum: def.values,
      };
      if (def.description) result.description = def.description;
      return result;
    }

    case "ZodUnion": {
      const oneOf = def.options?.map((opt) => zodToJsonSchema(opt)) ?? [];
      return { oneOf };
    }

    case "ZodLiteral": {
      const value = (def as unknown as { value: unknown }).value;
      return { const: value };
    }

    case "ZodNull":
      return { type: "null" };

    case "ZodAny":
    case "ZodUnknown":
      return {};

    default:
      // Fallback for unsupported types
      return {};
  }
}

/**
 * Tool Registry
 *
 * Stores registered tools and provides methods for tool lookup,
 * MCP schema conversion, and tool invocation.
 */
export class ToolRegistry {
  private tools: Map<string, DefinedTool> = new Map();

  /**
   * Register a tool
   *
   * @param tool - The defined tool to register
   * @throws Error if a tool with the same name already exists
   */
  register(tool: DefinedTool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" is already registered`);
    }
    this.tools.set(tool.name, tool);
  }

  /**
   * Check if a tool exists
   *
   * @param name - Tool name
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get a tool by name
   *
   * @param name - Tool name
   * @throws ToolNotFoundError if tool doesn't exist
   */
  get(name: string): DefinedTool {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new ToolNotFoundError(name);
    }
    return tool;
  }

  /**
   * Get all registered tool names
   */
  getNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Create a handler instance for a tool with the given CAS client
   *
   * @param name - Tool name
   * @param cas - BufferedCasClient instance
   * @returns The handler function
   */
  createHandler(name: string, cas: IBufferedCasClient): ToolHandler {
    const tool = this.get(name);
    return tool.createHandler(cas);
  }

  /**
   * Invoke a tool with validation
   *
   * @param name - Tool name
   * @param args - Tool arguments
   * @param cas - BufferedCasClient for CAS operations
   * @returns Tool result
   */
  async invoke(name: string, args: unknown, cas: IBufferedCasClient): Promise<unknown> {
    const tool = this.get(name);

    // Validate input
    const inputResult = tool.inputSchema.safeParse(args);
    if (!inputResult.success) {
      throw new ToolValidationError(name, `Invalid input: ${inputResult.error.message}`);
    }

    // Create handler with CAS client
    const handler = tool.createHandler(cas);

    // Execute handler
    const result = await handler(inputResult.data);

    // Validate output
    const outputResult = tool.outputSchema.safeParse(result);
    if (!outputResult.success) {
      throw new ToolValidationError(name, `Invalid output: ${outputResult.error.message}`);
    }

    return outputResult.data;
  }

  /**
   * Convert a tool to MCP schema format
   *
   * @param name - Tool name
   */
  toMcpSchema(name: string): McpToolSchema {
    const tool = this.get(name);
    return {
      name: tool.name,
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
      tools.push(this.toMcpSchema(name));
    }

    return { tools };
  }

  /**
   * Get the number of registered tools
   */
  get size(): number {
    return this.tools.size;
  }

  /**
   * Clear all registered tools
   */
  clear(): void {
    this.tools.clear();
  }
}
