/**
 * CAS Stack - MCP (Model Context Protocol) Handler
 *
 * Provides MCP-compatible endpoints for traditional MCP clients to interact with CAS.
 * Uses Agent Token authentication.
 */

import { z } from "zod";
import { CasStorage } from "../cas/storage.ts";
import { OwnershipDb } from "../db/ownership.ts";
import { TokensDb } from "../db/tokens.ts";
import type {
  AuthContext,
  CasConfig,
  CasServerConfig,
  HttpRequest,
  HttpResponse,
} from "../types.ts";

// ============================================================================
// MCP Tool Schemas
// ============================================================================

const GetTicketSchema = z.object({
  scope: z.union([z.string(), z.array(z.string())]),
  writable: z.boolean().default(false),
  expiresIn: z.number().positive().optional(),
});

const ReadBlobSchema = z.object({
  endpoint: z.string().url(),
  key: z.string(),
  path: z.string().default("."),
});

const WriteBlobSchema = z.object({
  endpoint: z.string().url(),
  content: z.string(), // base64 encoded
  contentType: z.string(),
});

// ============================================================================
// MCP Tool Definitions
// ============================================================================

const MCP_TOOLS = [
  {
    name: "cas_get_ticket",
    description:
      "Get a CAS access ticket for reading or writing blobs. " +
      "Returns an endpoint URL that can be used in #cas-endpoint field.",
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
          description: "Ticket expiration in seconds (default: 3600)",
        },
      },
      required: ["scope"],
    },
  },
  {
    name: "cas_read",
    description:
      "Read a blob from CAS using a ticket endpoint. " + "Returns the blob content as base64.",
    inputSchema: {
      type: "object",
      properties: {
        endpoint: {
          type: "string",
          description: "The #cas-endpoint URL from ticket",
        },
        key: {
          type: "string",
          description: "The CAS node key (cas-node)",
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
      "Write a blob to CAS using a writable ticket endpoint. " +
      "Returns the CAS key of the uploaded blob.",
    inputSchema: {
      type: "object",
      properties: {
        endpoint: {
          type: "string",
          description: "The #cas-endpoint URL from a writable ticket",
        },
        content: {
          type: "string",
          description: "Base64 encoded content to upload",
        },
        contentType: {
          type: "string",
          description: "MIME type of the content",
        },
      },
      required: ["endpoint", "content", "contentType"],
    },
  },
];

// ============================================================================
// MCP Response Helpers
// ============================================================================

interface McpRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: unknown;
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

function mcpError(id: string | number, code: number, message: string, data?: unknown): McpResponse {
  return { jsonrpc: "2.0", id, error: { code, message, data } };
}

// MCP Error Codes
const MCP_PARSE_ERROR = -32700;
const MCP_INVALID_REQUEST = -32600;
const MCP_METHOD_NOT_FOUND = -32601;
const MCP_INVALID_PARAMS = -32602;
const MCP_INTERNAL_ERROR = -32603;

// ============================================================================
// MCP Handler
// ============================================================================

export class McpHandler {
  private serverConfig: CasServerConfig;
  private tokensDb: TokensDb;
  private casStorage: CasStorage;
  private ownershipDb: OwnershipDb;

  constructor(config: CasConfig, serverConfig: CasServerConfig) {
    this.serverConfig = serverConfig;
    this.tokensDb = new TokensDb(config);
    this.casStorage = new CasStorage(config);
    this.ownershipDb = new OwnershipDb(config);
  }

  /**
   * Handle MCP JSON-RPC request
   */
  async handle(req: HttpRequest, auth: AuthContext): Promise<HttpResponse> {
    // Parse JSON-RPC request
    let rpcRequest: McpRequest;
    try {
      const body = typeof req.body === "string" ? req.body : (req.body?.toString("utf-8") ?? "");
      rpcRequest = JSON.parse(body);
    } catch {
      return this.jsonResponse([mcpError(0, MCP_PARSE_ERROR, "Parse error")]);
    }

    // Validate JSON-RPC structure
    if (rpcRequest.jsonrpc !== "2.0" || !rpcRequest.method) {
      return this.jsonResponse([
        mcpError(rpcRequest.id ?? 0, MCP_INVALID_REQUEST, "Invalid request"),
      ]);
    }

    // Route to method handler
    const response = await this.handleMethod(rpcRequest, auth);
    return this.jsonResponse([response]);
  }

  /**
   * Route MCP method to handler
   */
  private async handleMethod(req: McpRequest, auth: AuthContext): Promise<McpResponse> {
    switch (req.method) {
      case "initialize":
        return this.handleInitialize(req);

      case "tools/list":
        return this.handleToolsList(req);

      case "tools/call":
        return this.handleToolsCall(req, auth);

      default:
        return mcpError(req.id, MCP_METHOD_NOT_FOUND, `Method not found: ${req.method}`);
    }
  }

  /**
   * Handle initialize method
   */
  private handleInitialize(req: McpRequest): McpResponse {
    return mcpSuccess(req.id, {
      protocolVersion: "2024-11-05",
      capabilities: {
        tools: {},
      },
      serverInfo: {
        name: "cas-mcp",
        version: "0.1.0",
      },
    });
  }

  /**
   * Handle tools/list method
   */
  private handleToolsList(req: McpRequest): McpResponse {
    return mcpSuccess(req.id, { tools: MCP_TOOLS });
  }

  /**
   * Handle tools/call method
   */
  private async handleToolsCall(req: McpRequest, auth: AuthContext): Promise<McpResponse> {
    const params = req.params as { name: string; arguments?: unknown } | undefined;
    if (!params?.name) {
      return mcpError(req.id, MCP_INVALID_PARAMS, "Missing tool name");
    }

    try {
      switch (params.name) {
        case "cas_get_ticket":
          return await this.callGetTicket(req.id, params.arguments, auth);

        case "cas_read":
          return await this.callRead(req.id, params.arguments, auth);

        case "cas_write":
          return await this.callWrite(req.id, params.arguments, auth);

        default:
          return mcpError(req.id, MCP_METHOD_NOT_FOUND, `Unknown tool: ${params.name}`);
      }
    } catch (error: any) {
      return mcpError(req.id, MCP_INTERNAL_ERROR, error.message ?? "Internal error");
    }
  }

  /**
   * Call cas_get_ticket tool
   */
  private async callGetTicket(
    id: string | number,
    args: unknown,
    auth: AuthContext
  ): Promise<McpResponse> {
    const parsed = GetTicketSchema.safeParse(args);
    if (!parsed.success) {
      return mcpError(id, MCP_INVALID_PARAMS, "Invalid parameters", parsed.error.issues);
    }

    const ticket = await this.tokensDb.createTicket(
      auth.realm,
      TokensDb.extractTokenId(auth.token.pk),
      parsed.data.scope,
      parsed.data.writable ? true : undefined,
      parsed.data.expiresIn
    );

    const ticketId = TokensDb.extractTokenId(ticket.pk);
    const endpoint = `${this.serverConfig.baseUrl}/api/cas/${ticket.realm}/ticket/${ticketId}`;

    return mcpSuccess(id, {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            endpoint,
            scope: ticket.scope,
            expiresAt: new Date(ticket.expiresAt).toISOString(),
          }),
        },
      ],
    });
  }

  /**
   * Call cas_read tool
   */
  private async callRead(
    id: string | number,
    args: unknown,
    _auth: AuthContext
  ): Promise<McpResponse> {
    const parsed = ReadBlobSchema.safeParse(args);
    if (!parsed.success) {
      return mcpError(id, MCP_INVALID_PARAMS, "Invalid parameters", parsed.error.issues);
    }

    // Parse endpoint to extract realm and ticket
    const endpointMatch = parsed.data.endpoint.match(/\/api\/cas\/([^/]+)\/ticket\/([^/]+)$/);
    if (!endpointMatch) {
      return mcpError(id, MCP_INVALID_PARAMS, "Invalid endpoint URL format");
    }

    const [, realm, ticketId] = endpointMatch;

    // Verify ticket
    const ticket = await this.tokensDb.getToken(ticketId!);
    if (!ticket || ticket.type !== "ticket" || ticket.realm !== realm) {
      return mcpError(id, MCP_INVALID_PARAMS, "Invalid or expired ticket");
    }

    // Resolve path if needed
    const targetKey = parsed.data.key;
    if (parsed.data.path !== ".") {
      // For simplicity, we'll just return an error for paths in MCP
      // Full path resolution would require traversing the DAG
      return mcpError(
        id,
        MCP_INVALID_PARAMS,
        "Path resolution not yet supported in MCP. Use path='.' with direct key."
      );
    }

    // Check ownership
    const hasAccess = await this.ownershipDb.hasOwnership(realm!, targetKey);
    if (!hasAccess) {
      return mcpError(id, MCP_INVALID_PARAMS, "Node not found or not accessible");
    }

    // Get the node data from storage
    const nodeData = await this.casStorage.get(targetKey);
    if (!nodeData) {
      return mcpError(id, MCP_INVALID_PARAMS, "Node not found in storage");
    }

    // Check if it's a structured node (JSON file node) or raw chunk
    if (nodeData.contentType === "application/json") {
      try {
        const node = JSON.parse(nodeData.content.toString("utf-8")) as {
          kind: string;
          chunks?: string[];
          contentType?: string;
          size?: number;
        };

        if (node.kind === "file" && node.chunks) {
          // Read all chunks and concatenate
          const chunks: Buffer[] = [];
          for (const chunkKey of node.chunks) {
            const chunkData = await this.casStorage.get(chunkKey);
            if (chunkData) {
              chunks.push(chunkData.content);
            }
          }

          const content = Buffer.concat(chunks).toString("base64");

          return mcpSuccess(id, {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  key: targetKey,
                  contentType: node.contentType ?? "application/octet-stream",
                  size: node.size ?? Buffer.concat(chunks).length,
                  content,
                }),
              },
            ],
          });
        }

        if (node.kind === "collection") {
          return mcpError(
            id,
            MCP_INVALID_PARAMS,
            "Cannot read collection nodes directly. Specify a file path."
          );
        }
      } catch {
        // Not a valid JSON node, treat as raw content
      }
    }

    // Raw content (small file or chunk stored directly)
    const content = nodeData.content.toString("base64");
    return mcpSuccess(id, {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            key: targetKey,
            contentType: nodeData.contentType,
            size: nodeData.content.length,
            content,
          }),
        },
      ],
    });
  }

  /**
   * Call cas_write tool
   */
  private async callWrite(
    id: string | number,
    args: unknown,
    _auth: AuthContext
  ): Promise<McpResponse> {
    const parsed = WriteBlobSchema.safeParse(args);
    if (!parsed.success) {
      return mcpError(id, MCP_INVALID_PARAMS, "Invalid parameters", parsed.error.issues);
    }

    // Parse endpoint to extract realm and ticket
    const endpointMatch = parsed.data.endpoint.match(/\/api\/cas\/([^/]+)\/ticket\/([^/]+)$/);
    if (!endpointMatch) {
      return mcpError(id, MCP_INVALID_PARAMS, "Invalid endpoint URL format");
    }

    const [, realm, ticketId] = endpointMatch;

    // Verify ticket is writable
    const ticket = await this.tokensDb.getToken(ticketId!);
    if (!ticket || ticket.type !== "ticket" || ticket.realm !== realm) {
      return mcpError(id, MCP_INVALID_PARAMS, "Invalid or expired ticket");
    }

    if (!ticket.writable || ticket.written) {
      return mcpError(id, MCP_INVALID_PARAMS, "Ticket is not writable or already used");
    }

    // Decode content
    const content = Buffer.from(parsed.data.content, "base64");

    // Upload content as a single chunk
    const chunkResult = await this.casStorage.put(content, "application/octet-stream");

    // Record chunk ownership
    await this.ownershipDb.addOwnership(
      realm!,
      chunkResult.key,
      ticketId!, // createdBy
      "application/octet-stream",
      content.length
    );

    // Create file node
    const fileNode = {
      kind: "file",
      chunks: [chunkResult.key],
      contentType: parsed.data.contentType,
      size: content.length,
    };

    const fileNodeBuffer = Buffer.from(JSON.stringify(fileNode), "utf-8");
    const fileResult = await this.casStorage.put(fileNodeBuffer, "application/json");

    // Record file node ownership
    await this.ownershipDb.addOwnership(
      realm!,
      fileResult.key,
      ticketId!,
      parsed.data.contentType,
      content.length
    );

    // Mark ticket as written
    await this.tokensDb.markTicketWritten(ticketId!, fileResult.key);

    return mcpSuccess(id, {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            key: fileResult.key,
            contentType: parsed.data.contentType,
            size: content.length,
          }),
        },
      ],
    });
  }

  /**
   * Create JSON response
   */
  private jsonResponse(responses: McpResponse[]): HttpResponse {
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Methods": "POST,OPTIONS",
      },
      body: JSON.stringify(responses.length === 1 ? responses[0] : responses),
    };
  }
}
