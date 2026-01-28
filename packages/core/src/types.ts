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
 * Blob field descriptor for the AWP extension
 * Describes whether a field is an input or output blob and its purpose
 */
export interface BlobFieldDescriptor {
  /** Whether this is an input blob (read) or output blob (write) */
  kind: "input" | "output";
  /** Human-readable description of the blob field */
  description: string;
}

/**
 * AWP extension data for a tool
 * Kept separate from inputSchema to avoid polluting JSON Schema
 *
 * For Tools (MCP client compatible):
 * - Input blob params have schema: { url: string, contentType?: string }
 * - Output blob params have schema: { url: string, accept?: string }
 * - Output response includes: { contentType?: string } for each output blob
 *
 * For LLM (AWP-aware Agent runtimes):
 * - Input blob params have schema: { uri: string, contentType?: string }
 * - Output blob params have schema: { accept?: string }
 * - Output response includes: { uri: string, contentType?: string } for each output blob
 *
 * AWP Client performs bidirectional translation:
 * 1. Schema decoration: remove url from blob props, describe uri for input blobs
 * 2. Input translation: generate presigned readonly URL from URI
 * 3. Output translation: generate output URI and writable presigned URL
 * 4. Response injection: inject output URI into response
 */
export interface McpToolAwpExtension {
  /**
   * Blob field descriptors - maps property names to their blob metadata
   * Key is the property name in the schema
   */
  blob?: Record<string, BlobFieldDescriptor>;
}

/**
 * MCP Tool schema representation (JSON Schema format)
 */
export interface McpToolSchema {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  /** AWP extension data (kept separate from inputSchema for JSON Schema compatibility) */
  _awp?: McpToolAwpExtension;
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

// ============================================================================
// Tool-facing Blob Value Types (for MCP client compatibility)
// ============================================================================

/**
 * Tool-facing input blob value
 * What the Tool receives for input blobs from the caller
 */
export interface ToolBlobInputValue {
  /** Presigned readonly URL for reading the blob */
  url: string;
  /** MIME type of the blob content (similar to HTTP Content-Type header) */
  contentType?: string;
}

/**
 * Tool-facing output blob input value
 * What the Tool receives for output blob parameters from the caller
 */
export interface ToolBlobOutputInputValue {
  /** Presigned read-write URL for writing the blob */
  url: string;
  /** Accepted MIME types for the output (similar to HTTP Accept header) */
  accept?: string;
}

/**
 * Tool-facing output blob result value
 * What the Tool returns for output blobs
 */
export interface ToolBlobOutputResultValue {
  /** MIME type of the written blob content */
  contentType?: string;
}

// ============================================================================
// LLM-facing Blob Value Types (for AWP-aware Agent runtimes)
// ============================================================================

/**
 * LLM-facing input blob value
 * What the LLM provides for input blobs
 */
export interface LlmBlobInputValue {
  /** Resource identifier (e.g., s3://bucket/key) */
  uri: string;
  /** MIME type of the blob content */
  contentType?: string;
}

/**
 * LLM-facing output blob input value
 * What the LLM provides for output blob parameters
 */
export interface LlmBlobOutputInputValue {
  /** Accepted MIME types for the output */
  accept?: string;
}

/**
 * LLM-facing output blob result value
 * What the LLM receives for output blobs in the response
 */
export interface LlmBlobOutputResultValue {
  /** Resource identifier of the written blob (e.g., s3://bucket/key) */
  uri: string;
  /** MIME type of the written blob content */
  contentType?: string;
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
