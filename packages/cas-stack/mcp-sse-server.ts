#!/usr/bin/env bun
/**
 * CAS MCP Server - HTTP SSE transport for GitHub Copilot
 *
 * This server provides an HTTP endpoint that supports MCP over SSE.
 *
 * Usage:
 *   CAS_ENDPOINT=http://localhost:3550 CAS_AGENT_TOKEN=agt_xxx PORT=3450 bun run mcp-sse-server.ts
 */

// Configuration from environment
const PORT = parseInt(process.env.PORT || "3450", 10);
const CAS_ENDPOINT = process.env.CAS_ENDPOINT || "http://localhost:3550";
const CAS_AGENT_TOKEN = process.env.CAS_AGENT_TOKEN || "";

if (!CAS_AGENT_TOKEN) {
  console.error("Error: CAS_AGENT_TOKEN environment variable is required");
  process.exit(1);
}

// MCP Tool definitions
const MCP_TOOLS = [
  {
    name: "cas_get_ticket",
    description:
      "Get a CAS access ticket for reading or writing blobs. " +
      "Returns an endpoint URL that can be used with cas_read/cas_write.",
    inputSchema: {
      type: "object",
      properties: {
        scope: {
          oneOf: [
            { type: "string", description: "DAG root key to access" },
            { type: "array", items: { type: "string" }, description: "Multiple DAG root keys" },
          ],
          description: "The scope (DAG root keys) to access",
        },
        writable: {
          type: "boolean",
          description: "Whether write access is needed",
          default: false,
        },
        expiresIn: {
          type: "number",
          description: "Ticket expiration in seconds (default: 3600 for read, 300 for write)",
        },
      },
      required: ["scope"],
    },
  },
  {
    name: "cas_read",
    description:
      "Read a blob from CAS using a ticket endpoint. " +
      "Returns the blob content as text or base64.",
    inputSchema: {
      type: "object",
      properties: {
        endpoint: {
          type: "string",
          description: "The CAS endpoint URL from ticket",
        },
        key: {
          type: "string",
          description: "The CAS node key",
        },
        path: {
          type: "string",
          description: "Path within the node ('.' for file itself, './path' for collection child)",
          default: ".",
        },
      },
      required: ["endpoint", "key"],
    },
  },
  {
    name: "cas_write",
    description:
      "Write content to CAS using a writable ticket endpoint. " +
      "Returns the CAS key of the uploaded blob.",
    inputSchema: {
      type: "object",
      properties: {
        endpoint: {
          type: "string",
          description: "The CAS endpoint URL from a writable ticket",
        },
        content: {
          type: "string",
          description: "Content to upload (text or base64)",
        },
        contentType: {
          type: "string",
          description: "MIME type of the content",
          default: "text/plain",
        },
        isBase64: {
          type: "boolean",
          description: "Whether content is base64 encoded",
          default: false,
        },
      },
      required: ["endpoint", "content"],
    },
  },
  {
    name: "cas_list_nodes",
    description: "List all CAS nodes in your storage scope.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Maximum number of nodes to return",
          default: 100,
        },
      },
    },
  },
];

// API request helper
async function apiRequest(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = `${CAS_ENDPOINT}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${CAS_AGENT_TOKEN}`,
    ...(options.headers as Record<string, string>),
  };

  return fetch(url, {
    ...options,
    headers,
  });
}

// Tool handlers
async function handleGetTicket(params: {
  scope: string | string[];
  writable?: boolean;
  expiresIn?: number;
}): Promise<{ endpoint: string; expiresAt: string; scope: string | string[] }> {
  const response = await apiRequest("/api/auth/ticket", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      scope: params.scope,
      writable: params.writable || false,
      expiresIn: params.expiresIn,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Failed to get ticket: ${response.status}`);
  }

  const data = await response.json();
  const endpoint = `${CAS_ENDPOINT}/api/cas/${data.id}`;

  return {
    endpoint,
    expiresAt: data.expiresAt,
    scope: data.scope,
  };
}

async function handleRead(params: {
  endpoint: string;
  key: string;
  path?: string;
}): Promise<{ content: string; contentType: string; size: number }> {
  const path = params.path || ".";
  const url = path === "."
    ? `${params.endpoint}/node/${encodeURIComponent(params.key)}`
    : `${params.endpoint}/node/${encodeURIComponent(params.key)}/${path}`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${CAS_AGENT_TOKEN}` },
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Failed to read: ${response.status}`);
  }

  const contentType = response.headers.get("Content-Type") || "application/octet-stream";
  const buffer = await response.arrayBuffer();
  const content = Buffer.from(buffer);

  if (contentType.startsWith("text/") || contentType === "application/json") {
    return {
      content: content.toString("utf-8"),
      contentType,
      size: content.length,
    };
  }

  return {
    content: content.toString("base64"),
    contentType,
    size: content.length,
  };
}

async function handleWrite(params: {
  endpoint: string;
  content: string;
  contentType?: string;
  isBase64?: boolean;
}): Promise<{ key: string; size: number }> {
  const contentType = params.contentType || "text/plain";
  const content = params.isBase64
    ? Buffer.from(params.content, "base64")
    : Buffer.from(params.content, "utf-8");

  const chunkResponse = await fetch(`${params.endpoint}/chunk/temp`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${CAS_AGENT_TOKEN}`,
      "Content-Type": "application/octet-stream",
    },
    body: content,
  });

  if (!chunkResponse.ok) {
    const err = await chunkResponse.json().catch(() => ({}));
    throw new Error(err.error || `Failed to upload chunk: ${chunkResponse.status}`);
  }

  const chunkData = await chunkResponse.json();
  const chunkKey = chunkData.key;

  const fileResponse = await fetch(`${params.endpoint}/file`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${CAS_AGENT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chunks: [chunkKey],
      contentType,
    }),
  });

  if (!fileResponse.ok) {
    const err = await fileResponse.json().catch(() => ({}));
    throw new Error(err.error || `Failed to create file: ${fileResponse.status}`);
  }

  const fileData = await fileResponse.json();
  return {
    key: fileData.key,
    size: content.length,
  };
}

async function handleListNodes(params: {
  limit?: number;
}): Promise<{ nodes: Array<{ key: string; contentType?: string; size: number; createdAt: number }> }> {
  const limit = params.limit || 100;
  const response = await apiRequest(`/api/cas/@me/nodes?limit=${limit}`);

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Failed to list nodes: ${response.status}`);
  }

  const data = await response.json();
  return { nodes: data.nodes || [] };
}

// MCP message handling
interface McpMessage {
  jsonrpc: "2.0";
  id?: string | number;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code: number; message: string };
}

async function handleMcpMessage(message: McpMessage): Promise<McpMessage | null> {
  const { id, method, params } = message;

  if (!method) return null; // Not a request

  try {
    switch (method) {
      case "initialize":
        return {
          jsonrpc: "2.0",
          id: id!,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: { tools: {} },
            serverInfo: { name: "cas-mcp-server", version: "1.0.0" },
          },
        };

      case "notifications/initialized":
        return null; // No response for notifications

      case "tools/list":
        return {
          jsonrpc: "2.0",
          id: id!,
          result: { tools: MCP_TOOLS },
        };

      case "tools/call": {
        const toolParams = params as { name: string; arguments?: Record<string, unknown> };
        const toolName = toolParams.name;
        const toolArgs = toolParams.arguments || {};

        let result: unknown;
        switch (toolName) {
          case "cas_get_ticket":
            result = await handleGetTicket(toolArgs as Parameters<typeof handleGetTicket>[0]);
            break;
          case "cas_read":
            result = await handleRead(toolArgs as Parameters<typeof handleRead>[0]);
            break;
          case "cas_write":
            result = await handleWrite(toolArgs as Parameters<typeof handleWrite>[0]);
            break;
          case "cas_list_nodes":
            result = await handleListNodes(toolArgs as Parameters<typeof handleListNodes>[0]);
            break;
          default:
            throw new Error(`Unknown tool: ${toolName}`);
        }

        return {
          jsonrpc: "2.0",
          id: id!,
          result: {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          },
        };
      }

      default:
        return {
          jsonrpc: "2.0",
          id: id!,
          error: { code: -32601, message: `Method not found: ${method}` },
        };
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      jsonrpc: "2.0",
      id: id!,
      error: { code: -32000, message },
    };
  }
}

// HTTP Server with SSE support
const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    // CORS headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // SSE endpoint for MCP
    if (url.pathname === "/sse" && req.method === "GET") {
      // Create a new SSE stream for this client
      const stream = new ReadableStream({
        start(controller) {
          // Send initial endpoint message
          const endpointMessage = JSON.stringify({
            jsonrpc: "2.0",
            method: "endpoint",
            params: { url: `http://localhost:${PORT}/message` },
          });
          controller.enqueue(`data: ${endpointMessage}\n\n`);
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          ...corsHeaders,
        },
      });
    }

    // Message endpoint for MCP requests
    if (url.pathname === "/message" && req.method === "POST") {
      try {
        const message = (await req.json()) as McpMessage;
        const response = await handleMcpMessage(message);

        if (response) {
          return new Response(JSON.stringify(response), {
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }

        return new Response(null, { status: 204, headers: corsHeaders });
      } catch (error) {
        return new Response(
          JSON.stringify({ error: "Invalid request" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
    }

    // Health check
    if (url.pathname === "/" || url.pathname === "/health") {
      return new Response(
        JSON.stringify({ status: "ok", service: "cas-mcp-server" }),
        { headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    return new Response("Not Found", { status: 404, headers: corsHeaders });
  },
});

console.log(`
╔══════════════════════════════════════════════════════════════╗
║                    CAS MCP Server (HTTP/SSE)                 ║
╠══════════════════════════════════════════════════════════════╣
║  URL: http://localhost:${String(PORT).padEnd(5)}                              ║
║  SSE: http://localhost:${String(PORT).padEnd(5)}/sse                          ║
║                                                              ║
║  CAS Endpoint: ${CAS_ENDPOINT.padEnd(42)} ║
║                                                              ║
║  Tools:                                                      ║
║    - cas_get_ticket   Get read/write ticket                  ║
║    - cas_read         Read blob content                      ║
║    - cas_write        Write blob content                     ║
║    - cas_list_nodes   List stored nodes                      ║
╚══════════════════════════════════════════════════════════════╝
`);
