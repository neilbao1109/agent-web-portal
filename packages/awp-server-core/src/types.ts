/**
 * AWP Server Core - Type Definitions
 */

import type {
  ByteStream,
  CasBlobContext,
  CasFileHandle,
  CasNode,
  CasRawNode,
  PathResolver,
} from "@agent-web-portal/cas-client-core";
import type { ZodSchema, z } from "zod";

// Re-export useful types from cas-client-core
export type {
  ByteStream,
  CasBlobContext,
  CasFileHandle,
  CasNode,
  CasRawNode,
  PathResolver,
} from "@agent-web-portal/cas-client-core";

// ============================================================================
// CAS Configuration
// ============================================================================

/**
 * CAS configuration for the server
 */
export interface CasConfig {
  /** CAS API endpoint (e.g., "https://cas.example.com/api") */
  endpoint: string;
  /** Agent Token for creating tickets */
  agentToken: string;
  /** Default ticket expiration in seconds (default: 3600) */
  defaultTicketTtl?: number;
}

/**
 * Provider interface for obtaining CAS tickets
 */
export interface CasTicketProvider {
  /**
   * Create a ticket for the given scope
   *
   * @param scope - CAS keys to include in the scope
   * @param writable - Whether write access is needed
   * @returns CasBlobContext with ticket info
   */
  createTicket(
    scope: string | string[],
    writable?: boolean | { quota?: number; accept?: string[] }
  ): Promise<CasBlobContext>;
}

// ============================================================================
// Buffered CAS Client Interface
// ============================================================================

/**
 * Interface for a buffered CAS client that caches writes until commit
 */
export interface IBufferedCasClient {
  // Read operations (passthrough to underlying client)
  openFile(key: string): Promise<CasFileHandle>;
  getNode(key: string): Promise<CasNode>;
  getRawNode(key: string): Promise<CasRawNode>;

  // Buffered write operations
  putFile(content: Uint8Array | ByteStream, contentType: string): Promise<string>;
  putCollection(resolver: PathResolver): Promise<string>;

  // Commit/discard
  commit(): Promise<string[]>;
  discard(): void;

  // Status
  hasPendingWrites(): boolean;
  getPendingKeys(): string[];
}

// ============================================================================
// Tool Definition Types
// ============================================================================

/**
 * Tool handler function type
 * Receives parsed and validated arguments
 */
export type ToolHandler<TInput = unknown, TOutput = unknown> = (input: TInput) => Promise<TOutput>;

/**
 * Tool definition options for the wrapper function
 */
export interface ToolDefinitionOptions<
  TInputSchema extends ZodSchema = ZodSchema,
  TOutputSchema extends ZodSchema = ZodSchema,
> {
  /** Tool name (unique identifier) */
  name: string;
  /** Human-readable description */
  description?: string;
  /** Zod schema for input validation */
  inputSchema: TInputSchema;
  /** Zod schema for output validation */
  outputSchema: TOutputSchema;
  /** Handler function */
  handler: ToolHandler<z.infer<TInputSchema>, z.infer<TOutputSchema>>;
}

/**
 * A defined tool ready for registration
 */
export interface DefinedTool<
  TInputSchema extends ZodSchema = ZodSchema,
  TOutputSchema extends ZodSchema = ZodSchema,
> {
  /** Tool name */
  name: string;
  /** Human-readable description */
  description?: string;
  /** Input schema */
  inputSchema: TInputSchema;
  /** Output schema */
  outputSchema: TOutputSchema;
  /**
   * Factory function that creates the handler with CAS client
   * Called for each tool invocation with a fresh BufferedCasClient
   */
  createHandler: (
    cas: IBufferedCasClient
  ) => ToolHandler<z.infer<TInputSchema>, z.infer<TOutputSchema>>;
}

// ============================================================================
// Skill Definition Types
// ============================================================================

/**
 * Skill frontmatter parsed from SKILL.md
 */
export interface SkillFrontmatter {
  /** Display name */
  name: string;
  /** Short description */
  description?: string;
  /** Version */
  version?: string;
  /** List of allowed tool names */
  "allowed-tools"?: string[];
}

/**
 * A defined skill ready for registration
 */
export interface DefinedSkill {
  /** Skill identifier (used in URL path) */
  id: string;
  /** Skill frontmatter */
  frontmatter: SkillFrontmatter;
  /** Full SKILL.md content */
  content: string;
}

/**
 * Skills list response format (map of skill ID to skill info)
 */
export interface SkillsListResponse {
  [skillId: string]: {
    url: string;
    frontmatter: SkillFrontmatter;
  };
}

// ============================================================================
// MCP Protocol Types
// ============================================================================

/**
 * JSON-RPC 2.0 Request
 */
export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

/**
 * JSON-RPC 2.0 Success Response
 */
export interface JsonRpcSuccessResponse {
  jsonrpc: "2.0";
  id: string | number;
  result: unknown;
}

/**
 * JSON-RPC 2.0 Error Response
 */
export interface JsonRpcErrorResponse {
  jsonrpc: "2.0";
  id: string | number;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export type JsonRpcResponse = JsonRpcSuccessResponse | JsonRpcErrorResponse;

/**
 * MCP Tool schema representation (JSON Schema format)
 */
export interface McpToolSchema {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

/**
 * MCP tools/list response
 */
export interface McpToolsListResponse {
  tools: McpToolSchema[];
}

/**
 * MCP tools/call request params
 */
export interface McpToolsCallParams {
  name: string;
  arguments?: Record<string, unknown>;
}

/**
 * MCP tools/call response
 */
export interface McpToolsCallResponse {
  content: Array<{
    type: "text" | "image" | "resource";
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

// ============================================================================
// Server Portal Configuration
// ============================================================================

/**
 * Configuration for ServerPortal
 */
export interface ServerPortalConfig {
  /** Portal name */
  name: string;
  /** Portal version */
  version?: string;
  /** Portal description */
  description?: string;
  /** CAS configuration (optional, required for tools that use CAS) */
  cas?: CasConfig;
}

// ============================================================================
// Error Types
// ============================================================================

export class ToolNotFoundError extends Error {
  constructor(toolName: string) {
    super(`Tool not found: ${toolName}`);
    this.name = "ToolNotFoundError";
  }
}

export class ToolValidationError extends Error {
  constructor(toolName: string, message: string) {
    super(`Tool "${toolName}" validation error: ${message}`);
    this.name = "ToolValidationError";
  }
}

export class CasNotConfiguredError extends Error {
  constructor() {
    super("CAS configuration is required for this operation");
    this.name = "CasNotConfiguredError";
  }
}

export class TicketCreationError extends Error {
  constructor(message: string) {
    super(`Failed to create CAS ticket: ${message}`);
    this.name = "TicketCreationError";
  }
}

export type CasTicketErrorCode = "NOT_FOUND" | "EXPIRED" | "FETCH_FAILED";

export class CasTicketError extends Error {
  public readonly code: CasTicketErrorCode;

  constructor(message: string, code: CasTicketErrorCode) {
    super(message);
    this.name = "CasTicketError";
    this.code = code;
  }
}

export class CommitError extends Error {
  constructor(message: string) {
    super(`Failed to commit CAS writes: ${message}`);
    this.name = "CommitError";
  }
}
