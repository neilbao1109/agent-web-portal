/**
 * AWP Server Core - MCP Protocol Handler
 *
 * Handles MCP JSON-RPC requests for tools/list and tools/call.
 */

import type { ServerPortal } from "./portal.ts";
import type {
  JsonRpcRequest,
  JsonRpcResponse,
  McpToolsCallParams,
  McpToolsCallResponse,
  McpToolsListResponse,
} from "./types.ts";
import { ToolNotFoundError, ToolValidationError } from "./types.ts";

/**
 * MCP JSON-RPC error codes
 */
const MCP_ERROR_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  // Custom error codes
  TOOL_NOT_FOUND: -32000,
  TOOL_VALIDATION_ERROR: -32001,
  CAS_ERROR: -32002,
} as const;

/**
 * MCP Handler
 *
 * Processes JSON-RPC requests according to the MCP protocol.
 */
export class McpHandler {
  private portal: ServerPortal;

  constructor(portal: ServerPortal) {
    this.portal = portal;
  }

  /**
   * Handle an HTTP request
   *
   * @param request - Incoming HTTP request
   * @returns HTTP response
   */
  async handle(request: Request): Promise<Response> {
    // Only accept POST requests
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      // Parse request body
      const body = (await request.json()) as unknown;

      // Validate JSON-RPC structure
      if (!this.isValidJsonRpcRequest(body)) {
        return this.createJsonResponse({
          jsonrpc: "2.0",
          id: (body as { id?: unknown }).id ?? null,
          error: {
            code: MCP_ERROR_CODES.INVALID_REQUEST,
            message: "Invalid JSON-RPC request",
          },
        } as JsonRpcResponse);
      }

      const rpcRequest = body as JsonRpcRequest;

      // Handle the request
      const response = await this.handleRpcRequest(rpcRequest);

      return this.createJsonResponse(response);
    } catch (error) {
      // Handle JSON parse errors
      if (error instanceof SyntaxError) {
        return this.createJsonResponse({
          jsonrpc: "2.0",
          id: null,
          error: {
            code: MCP_ERROR_CODES.PARSE_ERROR,
            message: "Parse error",
          },
        } as unknown as JsonRpcResponse);
      }

      // Handle other errors
      return this.createJsonResponse({
        jsonrpc: "2.0",
        id: null,
        error: {
          code: MCP_ERROR_CODES.INTERNAL_ERROR,
          message: error instanceof Error ? error.message : "Internal error",
        },
      } as unknown as JsonRpcResponse);
    }
  }

  /**
   * Handle a JSON-RPC request
   */
  private async handleRpcRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    const { id, method, params } = request;

    try {
      switch (method) {
        case "initialize":
          return this.handleInitialize(id);

        case "tools/list":
          return this.handleToolsList(id);

        case "tools/call":
          return await this.handleToolsCall(id, params as unknown as McpToolsCallParams);

        default:
          return {
            jsonrpc: "2.0",
            id,
            error: {
              code: MCP_ERROR_CODES.METHOD_NOT_FOUND,
              message: `Method not found: ${method}`,
            },
          };
      }
    } catch (error) {
      return this.createErrorResponse(id, error);
    }
  }

  /**
   * Handle initialize request
   */
  private handleInitialize(id: string | number): JsonRpcResponse {
    const config = this.portal.getConfig();

    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2024-11-05",
        serverInfo: {
          name: config.name,
          version: config.version ?? "1.0.0",
        },
        capabilities: {
          tools: {},
        },
      },
    };
  }

  /**
   * Handle tools/list request
   */
  private handleToolsList(id: string | number): JsonRpcResponse {
    const toolsList: McpToolsListResponse = this.portal.listTools();

    return {
      jsonrpc: "2.0",
      id,
      result: toolsList,
    };
  }

  /**
   * Handle tools/call request
   */
  private async handleToolsCall(
    id: string | number,
    params: McpToolsCallParams
  ): Promise<JsonRpcResponse> {
    if (!params?.name) {
      return {
        jsonrpc: "2.0",
        id,
        error: {
          code: MCP_ERROR_CODES.INVALID_PARAMS,
          message: "Missing required parameter: name",
        },
      };
    }

    const { name, arguments: args, _casBlobContext } = params;

    // Execute the tool
    const result = await this.portal.executeTool(name, args ?? {}, _casBlobContext);

    // Format response
    const callResponse: McpToolsCallResponse = {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };

    return {
      jsonrpc: "2.0",
      id,
      result: callResponse,
    };
  }

  /**
   * Create an error response from an exception
   */
  private createErrorResponse(id: string | number, error: unknown): JsonRpcResponse {
    if (error instanceof ToolNotFoundError) {
      return {
        jsonrpc: "2.0",
        id,
        error: {
          code: MCP_ERROR_CODES.TOOL_NOT_FOUND,
          message: error.message,
        },
      };
    }

    if (error instanceof ToolValidationError) {
      return {
        jsonrpc: "2.0",
        id,
        error: {
          code: MCP_ERROR_CODES.TOOL_VALIDATION_ERROR,
          message: error.message,
        },
      };
    }

    // Generic error
    return {
      jsonrpc: "2.0",
      id,
      error: {
        code: MCP_ERROR_CODES.INTERNAL_ERROR,
        message: error instanceof Error ? error.message : "Internal error",
        data: error instanceof Error ? { stack: error.stack } : undefined,
      },
    };
  }

  /**
   * Validate JSON-RPC request structure
   */
  private isValidJsonRpcRequest(body: unknown): body is JsonRpcRequest {
    if (typeof body !== "object" || body === null) {
      return false;
    }

    const obj = body as Record<string, unknown>;

    return (
      obj.jsonrpc === "2.0" &&
      typeof obj.method === "string" &&
      (obj.id === undefined || typeof obj.id === "string" || typeof obj.id === "number")
    );
  }

  /**
   * Create a JSON response
   */
  private createJsonResponse(data: JsonRpcResponse): Response {
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }
}
