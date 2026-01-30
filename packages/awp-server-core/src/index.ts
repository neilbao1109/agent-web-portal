/**
 * @agent-web-portal/awp-server-core
 *
 * Server-side tool SDK with CAS integration.
 * Provides buffered CAS client for atomic writes and defineTool API.
 */

// BufferedCasClient
export { BufferedCasClient } from "./buffered-client.ts";
export type { ToolFactory } from "./define-tool.ts";
// defineTool API
export { defineSimpleTool, defineTool } from "./define-tool.ts";
// MCP Handler
export { McpHandler } from "./mcp-handler.ts";
// ServerPortal
export { createServerPortal, ServerPortal } from "./portal.ts";

// ToolRegistry
export { ToolRegistry } from "./tool-registry.ts";
// Types
export type {
  ByteStream,
  CasBlobContext,
  CasConfig,
  CasFileHandle,
  CasNode,
  CasRawNode,
  CasTicketProvider,
  DefinedTool,
  IBufferedCasClient,
  JsonRpcRequest,
  JsonRpcResponse,
  McpToolSchema,
  McpToolsCallParams,
  McpToolsCallResponse,
  McpToolsListResponse,
  PathResolver,
  ServerPortalConfig,
  ToolDefinitionOptions,
  ToolHandler,
} from "./types.ts";
// Error types
export {
  CasNotConfiguredError,
  CommitError,
  TicketCreationError,
  ToolNotFoundError,
  ToolValidationError,
} from "./types.ts";
