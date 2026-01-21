import type {
  AgentWebPortalInstance,
  HttpRequest,
  JsonRpcErrorResponse,
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcSuccessResponse,
  McpToolsCallResponse,
} from "./types.ts";
import { ToolNotFoundError, ToolValidationError } from "./types.ts";

// JSON-RPC Error Codes
const JSONRPC_PARSE_ERROR = -32700;
const JSONRPC_INVALID_REQUEST = -32600;
const JSONRPC_METHOD_NOT_FOUND = -32601;
const JSONRPC_INVALID_PARAMS = -32602;
const JSONRPC_INTERNAL_ERROR = -32603;

/**
 * Create a JSON-RPC success response
 */
function successResponse(id: string | number, result: unknown): JsonRpcSuccessResponse {
  return {
    jsonrpc: "2.0",
    id,
    result,
  };
}

/**
 * Create a JSON-RPC error response
 */
function errorResponse(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown
): JsonRpcErrorResponse {
  return {
    jsonrpc: "2.0",
    id: id ?? 0,
    error: { code, message, data },
  };
}

/**
 * Validate that the request is a valid JSON-RPC 2.0 request
 */
function isValidJsonRpcRequest(body: unknown): body is JsonRpcRequest {
  if (typeof body !== "object" || body === null) {
    return false;
  }

  const req = body as Record<string, unknown>;

  return (
    req.jsonrpc === "2.0" &&
    typeof req.method === "string" &&
    (req.id === undefined || typeof req.id === "string" || typeof req.id === "number")
  );
}

/**
 * Create the HTTP handler for the AgentWebPortal
 *
 * Handles MCP-compatible POST requests with support for:
 * - initialize
 * - tools/list
 * - tools/call
 * - skills/list (AWP extension)
 */
export function createHttpHandler(
  portal: AgentWebPortalInstance
): (request: HttpRequest) => Promise<Response> {
  return async (request: HttpRequest): Promise<Response> => {
    // Only accept POST requests
    if (request.method !== "POST") {
      return new Response(
        JSON.stringify(
          errorResponse(null, JSONRPC_INVALID_REQUEST, "Method not allowed. Use POST.")
        ),
        {
          status: 405,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify(errorResponse(null, JSONRPC_PARSE_ERROR, "Parse error")), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Handle batch requests
    if (Array.isArray(body)) {
      const responses = await Promise.all(body.map((req) => handleSingleRequest(portal, req)));
      return new Response(JSON.stringify(responses), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Handle single request
    const response = await handleSingleRequest(portal, body);
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
}

/**
 * Handle a single JSON-RPC request
 */
async function handleSingleRequest(
  portal: AgentWebPortalInstance,
  body: unknown
): Promise<JsonRpcResponse> {
  if (!isValidJsonRpcRequest(body)) {
    return errorResponse(null, JSONRPC_INVALID_REQUEST, "Invalid Request");
  }

  const { id, method, params } = body;

  try {
    switch (method) {
      case "initialize":
        return handleInitialize(id, portal, params);

      case "tools/list":
        return handleToolsList(id, portal);

      case "tools/call":
        return await handleToolsCall(id, portal, params);

      case "skills/list":
        return handleSkillsList(id, portal);

      case "ping":
        return successResponse(id, { pong: true });

      default:
        return errorResponse(id, JSONRPC_METHOD_NOT_FOUND, `Method not found: ${method}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal error";
    return errorResponse(id, JSONRPC_INTERNAL_ERROR, message);
  }
}

/**
 * Handle initialize request
 */
function handleInitialize(
  id: string | number,
  portal: AgentWebPortalInstance,
  params?: Record<string, unknown>
): JsonRpcSuccessResponse {
  // Get server info from portal (need to cast to access internal method)
  const serverInfo = (portal as any).getServerInfo?.() ?? {
    name: "agent-web-portal",
    version: "1.0.0",
  };

  return successResponse(id, {
    protocolVersion: "2024-11-05",
    capabilities: {
      tools: {},
      // AWP extension: skills capability
      experimental: {
        skills: {},
      },
    },
    serverInfo,
  });
}

/**
 * Handle tools/list request
 */
function handleToolsList(
  id: string | number,
  portal: AgentWebPortalInstance
): JsonRpcSuccessResponse {
  return successResponse(id, portal.listTools());
}

/**
 * Handle tools/call request
 */
async function handleToolsCall(
  id: string | number,
  portal: AgentWebPortalInstance,
  params?: Record<string, unknown>
): Promise<JsonRpcResponse> {
  if (!params || typeof params.name !== "string") {
    return errorResponse(id, JSONRPC_INVALID_PARAMS, "Invalid params: 'name' is required");
  }

  const name = params.name;
  const args = params.arguments as Record<string, unknown> | undefined;

  try {
    const result = await portal.invokeTool(name, args ?? {});

    const response: McpToolsCallResponse = {
      content: [
        {
          type: "text",
          text: typeof result === "string" ? result : JSON.stringify(result),
        },
      ],
    };

    return successResponse(id, response);
  } catch (error) {
    if (error instanceof ToolNotFoundError) {
      return errorResponse(id, JSONRPC_INVALID_PARAMS, error.message);
    }

    if (error instanceof ToolValidationError) {
      const response: McpToolsCallResponse = {
        content: [{ type: "text", text: error.message }],
        isError: true,
      };
      return successResponse(id, response);
    }

    throw error;
  }
}

/**
 * Handle skills/list request (AWP extension)
 */
function handleSkillsList(
  id: string | number,
  portal: AgentWebPortalInstance
): JsonRpcSuccessResponse {
  return successResponse(id, portal.listSkills());
}
