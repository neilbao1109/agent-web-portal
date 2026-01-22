import type { ZodSchema, z } from "zod";

// ============================================================================
// Skill Frontmatter Types
// ============================================================================

/**
 * Frontmatter metadata for skills
 * Contains tool dependencies and other metadata for cross-MCP references
 */
export interface SkillFrontmatter {
  /** List of allowed tools (space-separated names), including cross-MCP tools like mcp_alias:tool_name */
  "allowed-tools"?: string[];
  /** Human-readable name of the skill */
  name?: string;
  /** Description of what the skill does */
  description?: string;
  /** Version of the skill */
  version?: string;
  /** Additional metadata for cross-MCP references */
  [key: string]: unknown;
}

/**
 * Skill definition with URL and frontmatter
 */
export interface SkillDefinition {
  /** URL where the skill can be downloaded/accessed */
  url: string;
  /** Frontmatter metadata including allowed-tools */
  frontmatter: SkillFrontmatter;
}

/**
 * Skills list response format for skills/list endpoint
 */
export type SkillsListResponse = Record<
  string, // skill name
  {
    url: string;
    frontmatter: SkillFrontmatter;
  }
>;

// ============================================================================
// Tool Types
// ============================================================================

/**
 * Tool handler context with blob presigned URLs
 */
export interface ToolHandlerBlobContext {
  /** Blob presigned URLs */
  blobs: {
    /** Presigned GET URLs for input blobs */
    input: Record<string, string>;
    /** Presigned PUT URLs for output blobs */
    output: Record<string, string>;
  };
}

/**
 * Tool handler function type
 * The context parameter is optional for backward compatibility
 */
export type ToolHandler<TInput = unknown, TOutput = unknown> = (
  input: TInput,
  context?: ToolHandlerBlobContext
) => Promise<TOutput>;

/**
 * Tool definition with schemas and handler
 */
export interface ToolDefinition<
  TInputSchema extends ZodSchema = ZodSchema,
  TOutputSchema extends ZodSchema = ZodSchema,
> {
  /** Zod schema for validating input */
  inputSchema: TInputSchema;
  /** Zod schema for validating output */
  outputSchema: TOutputSchema;
  /** Async handler function */
  handler: ToolHandler<z.infer<TInputSchema>, z.infer<TOutputSchema>>;
  /** Human-readable description */
  description?: string;
}

/**
 * Tool registration options (what developers provide)
 */
export interface ToolRegistrationOptions<
  TInputSchema extends ZodSchema = ZodSchema,
  TOutputSchema extends ZodSchema = ZodSchema,
> {
  inputSchema: TInputSchema;
  outputSchema: TOutputSchema;
  handler: ToolHandler<z.infer<TInputSchema>, z.infer<TOutputSchema>>;
  description?: string;
}

/**
 * Skill registration options
 */
export interface SkillRegistrationOptions {
  url: string;
  frontmatter: SkillFrontmatter;
}

/**
 * Skills map for batch registration
 * Key is the skill name, value is the skill definition
 */
export type SkillsMap = Record<string, SkillRegistrationOptions>;

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
// HTTP Handler Types
// ============================================================================

/**
 * HTTP Request interface (compatible with various runtimes)
 */
export interface HttpRequest {
  method: string;
  headers: Headers | Record<string, string>;
  json(): Promise<unknown>;
}

/**
 * HTTP Response options
 */
export interface HttpResponseOptions {
  status?: number;
  headers?: Record<string, string>;
}

// ============================================================================
// AgentWebPortal Configuration Types
// ============================================================================

/**
 * Options for AgentWebPortal behavior
 */
export interface AgentWebPortalConfig {
  /**
   * Enable automatic coercion of stringified arguments for XML-based MCP clients.
   *
   * Some MCP clients (like those using XML as a carrier format) serialize all
   * tool arguments as strings. When enabled, if argument validation fails,
   * the portal will attempt to parse each string argument as JSON and retry
   * validation.
   *
   * @default false
   */
  coerceXmlClientArgs?: boolean;
}

// ============================================================================
// AgentWebPortal Instance Types
// ============================================================================

/**
 * The built AgentWebPortal instance
 */
export interface AgentWebPortalInstance {
  /** Handle HTTP POST requests (MCP-compatible endpoint) */
  handleRequest(request: HttpRequest): Promise<Response>;
  /** Get the list of registered tools */
  listTools(): McpToolsListResponse;
  /** Get the list of registered skills with frontmatter */
  listSkills(): SkillsListResponse;
  /** Invoke a tool by name with optional blob context */
  invokeTool(name: string, args: unknown, blobContext?: BlobContext): Promise<unknown>;
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

export class SkillValidationError extends Error {
  constructor(skillName: string, missingTools: string[]) {
    super(`Skill "${skillName}" references missing tools: ${missingTools.join(", ")}`);
    this.name = "SkillValidationError";
  }
}

export class ToolValidationError extends Error {
  constructor(toolName: string, message: string) {
    super(`Tool "${toolName}" validation error: ${message}`);
    this.name = "ToolValidationError";
  }
}

export class BlobContextError extends Error {
  constructor(toolName: string, message: string) {
    super(`Tool "${toolName}" blob context error: ${message}`);
    this.name = "BlobContextError";
  }
}

// ============================================================================
// Blob Types
// ============================================================================

/**
 * Blob context passed in tool call requests
 * This is provided by the Client SDK and contains presigned URLs
 */
export interface BlobContext {
  /** Presigned GET URLs for input blob fields */
  input: Record<string, string>;
  /** Presigned PUT URLs for output blob fields */
  output: Record<string, string>;
  /** Permanent URIs for output blob fields (e.g., s3://bucket/key) */
  outputUri: Record<string, string>;
}

/**
 * Extended MCP tools/call request params with blob support
 */
export interface McpToolsCallParamsWithBlob extends McpToolsCallParams {
  /** Blob context with presigned URLs (provided by Client SDK) */
  _blobContext?: BlobContext;
}

/**
 * Blob metadata for a single field
 */
export interface BlobFieldMetadata {
  /** Expected MIME type */
  mimeType?: string;
  /** Maximum size in bytes */
  maxSize?: number;
  /** Field description */
  description?: string;
}

/**
 * Tool blob metadata extracted from schemas
 */
export interface ToolBlobMetadata {
  /** Input blob fields with their metadata */
  input: Record<string, BlobFieldMetadata>;
  /** Output blob fields with their metadata */
  output: Record<string, BlobFieldMetadata>;
}
