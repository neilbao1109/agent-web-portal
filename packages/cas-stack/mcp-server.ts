#!/usr/bin/env bun
/**
 * CAS MCP Server - stdio transport for GitHub Copilot
 *
 * This server acts as a stdio MCP server that proxies requests to the CAS HTTP API.
 *
 * IMPORTANT: As an AI agent with an Agent Token, you can directly read/write blobs
 * without needing tickets. Use cas_read and cas_write directly.
 *
 * Tickets (cas_get_ticket) are only needed when you want to grant temporary access
 * to OTHER tools or services that don't have your Agent Token.
 *
 * Usage:
 *   CAS_ENDPOINT=http://localhost:3550 CAS_AGENT_TOKEN=agt_xxx bun run mcp-server.ts
 */

import { createInterface } from "node:readline";

// Configuration from environment
const CAS_ENDPOINT = process.env.CAS_ENDPOINT || "http://localhost:3550";
const CAS_AGENT_TOKEN = process.env.CAS_AGENT_TOKEN || "";

if (!CAS_AGENT_TOKEN) {
  console.error("Error: CAS_AGENT_TOKEN environment variable is required");
  process.exit(1);
}

// Default endpoint for direct agent access
const DEFAULT_ENDPOINT = `${CAS_ENDPOINT}/api/cas/@me`;

// MCP Tool definitions
const MCP_TOOLS = [
  {
    name: "cas_get_ticket",
    description:
      "Get a CAS access ticket for reading or writing blobs. " +
      "Returns an endpoint URL that can be used with cas_read/cas_write. " +
      "NOTE: You (the AI agent) do NOT need tickets for your own access - " +
      "use cas_read/cas_write directly without endpoint parameter. " +
      "Tickets are for granting temporary access to OTHER tools/services.",
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
      "Returns the blob content as text or base64. " +
      "If endpoint is not provided, uses your default storage scope (no ticket needed).",
    inputSchema: {
      type: "object",
      properties: {
        endpoint: {
          type: "string",
          description:
            "The CAS endpoint URL from ticket. OPTIONAL - omit to use your default storage.",
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
      required: ["key"],
    },
  },
  {
    name: "cas_write",
    description:
      "Write content to CAS using a writable ticket endpoint. " +
      "Returns the CAS key of the uploaded blob. " +
      "If endpoint is not provided, writes to your default storage scope (no ticket needed).",
    inputSchema: {
      type: "object",
      properties: {
        endpoint: {
          type: "string",
          description:
            "The CAS endpoint URL from a writable ticket. OPTIONAL - omit to use your default storage.",
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
      required: ["content"],
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

// MCP Response helpers
interface McpRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

interface McpResponse {
  jsonrpc: "2.0";
  id: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

function mcpSuccess(id: string | number, result: unknown): McpResponse {
  return { jsonrpc: "2.0", id, result };
}

function mcpError(id: string | number, code: number, message: string): McpResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function sendResponse(response: McpResponse) {
  const json = JSON.stringify(response);
  process.stdout.write(`${json}\n`);
}

// API request helper
async function apiRequest(path: string, options: RequestInit = {}): Promise<Response> {
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
  // Build endpoint URL with ticket
  const endpoint = `${CAS_ENDPOINT}/api/cas/${data.id}`;

  return {
    endpoint,
    expiresAt: data.expiresAt,
    scope: data.scope,
  };
}

async function handleRead(params: {
  endpoint?: string;
  key: string;
  path?: string;
}): Promise<{ content: string; contentType: string; size: number }> {
  const endpoint = params.endpoint || DEFAULT_ENDPOINT;
  const path = params.path || ".";
  const url =
    path === "."
      ? `${endpoint}/node/${encodeURIComponent(params.key)}`
      : `${endpoint}/node/${encodeURIComponent(params.key)}/${path}`;

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

  // Try to return as text if it's text-like
  if (contentType.startsWith("text/") || contentType === "application/json") {
    return {
      content: content.toString("utf-8"),
      contentType,
      size: content.length,
    };
  }

  // Return as base64 for binary content
  return {
    content: content.toString("base64"),
    contentType,
    size: content.length,
  };
}

async function handleWrite(params: {
  endpoint?: string;
  content: string;
  contentType?: string;
  isBase64?: boolean;
}): Promise<{ key: string; size: number }> {
  const endpoint = params.endpoint || DEFAULT_ENDPOINT;
  const contentType = params.contentType || "text/plain";
  const content = params.isBase64
    ? Buffer.from(params.content, "base64")
    : Buffer.from(params.content, "utf-8");

  // Upload to /node - server will calculate the hash key
  const response = await fetch(`${endpoint}/node`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${CAS_AGENT_TOKEN}`,
      "Content-Type": contentType,
    },
    body: content,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Failed to write: ${response.status}`);
  }

  const data = await response.json();
  return {
    key: data.key,
    size: content.length,
  };
}

async function handleListNodes(params: { limit?: number }): Promise<{
  nodes: Array<{ key: string; contentType?: string; size: number; createdAt: number }>;
}> {
  const limit = params.limit || 100;
  const response = await apiRequest(`/api/cas/@me/nodes?limit=${limit}`);

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Failed to list nodes: ${response.status}`);
  }

  const data = await response.json();
  return { nodes: data.nodes || [] };
}

// MCP request handler
async function handleRequest(request: McpRequest): Promise<void> {
  const { id, method, params } = request;

  try {
    switch (method) {
      case "initialize":
        sendResponse(
          mcpSuccess(id, {
            protocolVersion: "2024-11-05",
            capabilities: {
              tools: {},
            },
            serverInfo: {
              name: "cas-mcp-server",
              version: "1.0.0",
            },
          })
        );
        break;

      case "notifications/initialized":
        // No response needed for notifications
        break;

      case "tools/list":
        sendResponse(mcpSuccess(id, { tools: MCP_TOOLS }));
        break;

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

        sendResponse(
          mcpSuccess(id, {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          })
        );
        break;
      }

      default:
        sendResponse(mcpError(id, -32601, `Method not found: ${method}`));
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    sendResponse(mcpError(id, -32000, message));
  }
}

// Main loop - read JSON-RPC from stdin
const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

rl.on("line", async (line) => {
  if (!line.trim()) return;

  try {
    const request = JSON.parse(line) as McpRequest;
    await handleRequest(request);
  } catch (_error) {
    // Parse error
    sendResponse({
      jsonrpc: "2.0",
      id: null as unknown as string,
      error: { code: -32700, message: "Parse error" },
    });
  }
});

// Handle process signals
process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));
