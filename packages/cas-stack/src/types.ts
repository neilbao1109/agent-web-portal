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

export interface AgentToken extends BaseToken {
  type: "agent";
  userId: string;
  name: string;
  permissions: TokenPermissions;
}

export interface Ticket extends BaseToken {
  type: "ticket";
  scope: string;
  issuerId: string;
  ticketType: "read" | "write";
  key?: string; // For read tickets, the specific key allowed
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

export interface CreateAgentTokenRequest {
  name: string;
  expiresIn?: number; // seconds, default 30 days
  permissions: TokenPermissions;
}

export interface CreateAgentTokenResponse {
  id: string;
  token: string; // Full token, only returned once
  name: string;
  permissions: TokenPermissions;
  createdAt: string;
  expiresAt: string;
}

export interface AgentTokenInfo {
  id: string;
  name: string;
  permissions: TokenPermissions;
  createdAt: string;
  expiresAt: string;
}

export interface CreateTicketRequest {
  type: "read" | "write";
  key?: string; // Required for read, optional for write
  expiresIn?: number; // seconds, default read=3600, write=300
}

export interface CreateTicketResponse {
  id: string;
  type: "read" | "write";
  key?: string;
  expiresAt: string;
}

// ============================================================================
// CAS Types
// ============================================================================

export interface CasOwnership {
  scope: string;
  key: string;
  createdAt: number;
  createdBy: string;
  contentType: string;
  size: number;
}

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
  scope: string;
  canRead: boolean;
  canWrite: boolean;
  canIssueTicket: boolean;
  // For read tickets, the allowed key
  allowedKey?: string;
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

export interface CasConfig {
  tokensTable: string;
  casOwnershipTable: string;
  casDagTable: string;
  casBucket: string;
  cognitoUserPoolId: string;
  cognitoClientId: string;
  cognitoRegion: string;
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
  };
}
