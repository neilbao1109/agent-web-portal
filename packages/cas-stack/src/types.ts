/**
 * CAS Stack - Type Definitions
 */

// ============================================================================
// Token Types
// ============================================================================

export type TokenType = "user" | "agent" | "ticket";

export interface BaseToken {
  pk: string; // token#{id}
  type: TokenType;
  createdAt: number;
  expiresAt: number;
}

export interface UserToken extends BaseToken {
  type: "user";
  userId: string;
  refreshToken?: string;
}

/**
 * Agent Token - long-lived token for AI agents
 * Inherits all permissions from the creating user
 */
export interface AgentToken extends BaseToken {
  type: "agent";
  userId: string; // owner user ID
  name: string; // human-readable name
  description?: string;
}

/**
 * Writable configuration for tickets
 */
export type WritableConfig =
  | boolean
  | {
      quota?: number; // bytes limit
      accept?: string[]; // allowed MIME types for root node
    };

/**
 * Ticket - provides limited access to CAS resources
 */
export interface Ticket extends BaseToken {
  type: "ticket";
  shard: string; // user namespace (e.g., "usr_{userId}")
  issuerId: string; // who issued this ticket
  scope: string | string[]; // DAG root keys that can be accessed
  writable?: WritableConfig; // write permission config
  written?: string; // root key after write (ensures single write)
  config: {
    chunkThreshold: number; // chunk size threshold in bytes
  };
}

export type Token = UserToken | AgentToken | Ticket;

export interface TokenPermissions {
  read: boolean;
  write: boolean;
  issueTicket: boolean;
}

// ============================================================================
// Auth Request/Response Types
// ============================================================================

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  userToken: string;
  refreshToken: string;
  expiresAt: string;
  user: {
    id: string;
    email: string;
    name?: string;
  };
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface RefreshResponse {
  userToken: string;
  expiresAt: string;
}

// ============================================================================
// Agent Token Request/Response Types
// ============================================================================

export interface CreateAgentTokenRequest {
  name: string;
  description?: string;
  expiresIn?: number; // seconds, default 30 days (2592000)
}

export interface CreateAgentTokenResponse {
  id: string;
  name: string;
  description?: string;
  expiresAt: string;
  createdAt: string;
}

export interface AgentTokenInfo {
  id: string;
  name: string;
  description?: string;
  expiresAt: string;
  createdAt: string;
}

export interface ListAgentTokensResponse {
  tokens: AgentTokenInfo[];
}

// ============================================================================
// Ticket Request/Response Types
// ============================================================================

export interface CreateTicketRequest {
  scope: string | string[]; // DAG root keys to allow access
  writable?: WritableConfig; // write permission config
  expiresIn?: number; // seconds, default 3600
}

export interface CreateTicketResponse {
  id: string;
  endpoint: string; // Full endpoint URL for #cas-endpoint
  expiresAt: string;
  shard: string;
  scope: string | string[];
  writable: WritableConfig | false;
  config: {
    chunkThreshold: number;
  };
}

// ============================================================================
// CAS Types
// ============================================================================

/**
 * Node kind in CAS three-level structure
 */
export type NodeKind = "collection" | "file" | "chunk";

/**
 * CAS Ownership - tracks which shard owns a key
 */
export interface CasOwnership {
  shard: string;
  key: string;
  createdAt: number;
  createdBy: string;
  contentType?: string;
  size: number;
}

// ============================================================================
// Raw Node Types (Storage Layer View)
// ============================================================================

export interface CasRawCollectionNode {
  kind: "collection";
  key: string;
  size: number;
  children: Record<string, string>; // name → key
}

export interface CasRawFileNode {
  kind: "file";
  key: string;
  size: number;
  contentType: string;
  chunks: string[]; // chunk keys
}

export interface CasRawChunkNode {
  kind: "chunk";
  key: string;
  size: number;
  parts?: string[]; // sub-chunks (B-tree)
}

export type CasRawNode = CasRawCollectionNode | CasRawFileNode | CasRawChunkNode;

// ============================================================================
// Application Node Types (Application Layer View)
// ============================================================================

export interface CasCollectionNode {
  kind: "collection";
  key: string;
  size: number;
  children: Record<string, CasNode>; // recursively expanded
}

export interface CasFileNode {
  kind: "file";
  key: string;
  size: number;
  contentType: string;
  // Note: no content field! Use openFile() for streaming
}

export type CasNode = CasCollectionNode | CasFileNode;

// ============================================================================
// Legacy Types (to be removed)
// ============================================================================

/** @deprecated Use CasRawNode instead */
export interface CasDagNode {
  key: string;
  children: string[];
  contentType: string;
  size: number;
  createdAt: number;
}

export interface ResolveRequest {
  root: string;
  nodes: string[];
}

export interface ResolveResponse {
  missing: string[];
}

export interface UploadNodeResponse {
  key: string;
  size: number;
  contentType: string;
}

export interface UploadDagResponse {
  uploaded: Array<{
    key: string;
    size: number;
    contentType: string;
  }>;
  failed: Array<{
    key: string;
    error: string;
  }>;
  root: string;
}

// ============================================================================
// Parsed Auth Context
// ============================================================================

export interface AuthContext {
  token: Token;
  userId: string;
  shard: string; // user namespace
  canRead: boolean;
  canWrite: boolean;
  canIssueTicket: boolean;
  // For tickets, the allowed DAG root keys
  allowedScope?: string | string[];
}

// ============================================================================
// HTTP Types
// ============================================================================

export interface HttpRequest {
  method: string;
  path: string;
  headers: Record<string, string | undefined>;
  query: Record<string, string | undefined>;
  pathParams: Record<string, string>;
  body: Buffer | string | null;
  isBase64Encoded?: boolean;
}

export interface HttpResponse {
  statusCode: number;
  headers?: Record<string, string>;
  body?: string | Buffer;
  isBase64Encoded?: boolean;
}

// ============================================================================
// Config
// ============================================================================

export interface CasServerConfig {
  chunkThreshold: number; // default 1MB
  maxCollectionChildren: number; // default 10000
  maxPayloadSize: number; // default 10MB
  maxTicketTtl: number; // max ticket TTL in seconds, default 86400 (24h)
  maxAgentTokenTtl: number; // max agent token TTL in seconds, default 2592000 (30d)
  baseUrl: string; // Base URL for constructing endpoint URLs
}

export interface CasConfig {
  tokensTable: string;
  casOwnershipTable: string;
  casDagTable: string;
  casBucket: string;
  cognitoUserPoolId: string;
  cognitoClientId: string;
  cognitoRegion: string;
  serverConfig: CasServerConfig;
}

export function loadServerConfig(): CasServerConfig {
  return {
    chunkThreshold: parseInt(process.env.CAS_CHUNK_THRESHOLD ?? "1048576", 10), // 1MB
    maxCollectionChildren: parseInt(process.env.CAS_MAX_COLLECTION_CHILDREN ?? "10000", 10),
    maxPayloadSize: parseInt(process.env.CAS_MAX_PAYLOAD_SIZE ?? "10485760", 10), // 10MB
    maxTicketTtl: parseInt(process.env.CAS_MAX_TICKET_TTL ?? "86400", 10), // 24 hours
    maxAgentTokenTtl: parseInt(process.env.CAS_MAX_AGENT_TOKEN_TTL ?? "2592000", 10), // 30 days
    baseUrl: process.env.CAS_BASE_URL ?? "http://localhost:3000",
  };
}

export function loadConfig(): CasConfig {
  return {
    tokensTable: process.env.TOKENS_TABLE ?? "cas-tokens",
    casOwnershipTable: process.env.CAS_OWNERSHIP_TABLE ?? "cas-ownership",
    casDagTable: process.env.CAS_DAG_TABLE ?? "cas-dag",
    casBucket: process.env.CAS_BUCKET ?? "cas-bucket",
    cognitoUserPoolId: process.env.COGNITO_USER_POOL_ID ?? "",
    cognitoClientId: process.env.COGNITO_CLIENT_ID ?? "",
    cognitoRegion: process.env.COGNITO_REGION ?? "us-east-1",
    serverConfig: loadServerConfig(),
  };
}

// ============================================================================
// CAS API Request/Response Types
// ============================================================================

export interface CasConfigResponse {
  chunkThreshold: number;
  maxCollectionChildren: number;
  maxPayloadSize: number;
}

export interface PutChunkResponse {
  key: string;
  size: number;
}

export interface PutFileRequest {
  chunks: string[];
  contentType: string;
}

export interface PutFileResponse {
  key: string;
}

export interface PutCollectionRequest {
  children: Record<string, string>;
}

export interface PutCollectionResponse {
  key: string;
}
