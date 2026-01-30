/**
 * AWP Client Core - Type Definitions
 *
 * Types for AWP client with CAS-based blob exchange
 */

import type { LocalStorageProvider } from "@agent-web-portal/cas-client-core";

// ============================================================================
// Auth Types (re-exported from client for compatibility)
// ============================================================================

/**
 * Keypair for AWP authentication
 */
export interface AwpKeyPair {
  /** Public key in base64url format (x.y) */
  publicKey: string;
  /** Private key in base64url format (JWK 'd' parameter) */
  privateKey: string;
  /** When the key was created */
  createdAt: number;
}

/**
 * Stored key data (persisted by KeyStorage)
 */
export interface StoredKeyData {
  /** The keypair */
  keyPair: AwpKeyPair;
  /** Associated server endpoint */
  endpoint: string;
  /** Client name used for authorization */
  clientName: string;
  /** When authorization expires (from server) */
  expiresAt?: number;
}

/**
 * Key storage interface
 */
export interface KeyStorage {
  load(endpoint: string): Promise<StoredKeyData | null>;
  save(endpoint: string, data: StoredKeyData): Promise<void>;
  delete(endpoint: string): Promise<void>;
  list(): Promise<string[]>;
}

/**
 * 401 response from AWP server
 */
export interface AuthChallengeResponse {
  error: "unauthorized";
  error_description?: string;
  auth_init_endpoint?: string;
  auth_status_endpoint?: string;
}

/**
 * Authorization challenge info for user
 */
export interface AuthChallenge {
  authUrl: string;
  verificationCode: string;
  publicKey: string;
  expiresIn: number;
}

/**
 * Signed request headers
 */
export interface SignedHeaders {
  "X-AWP-Pubkey": string;
  "X-AWP-Timestamp": string;
  "X-AWP-Signature": string;
  [key: string]: string;
}

/**
 * Callbacks for auth events
 */
export interface AuthCallbacks {
  onAuthRequired?: (challenge: AuthChallenge) => Promise<boolean>;
  onAuthSuccess?: () => void;
  onAuthFailed?: (error: Error) => void;
  onKeyExpiring?: (daysRemaining: number) => void;
}

/**
 * Options for AwpAuth
 */
export interface AwpAuthOptions {
  clientName: string;
  keyStorage: KeyStorage;
  callbacks?: AuthCallbacks;
  autoRotateDays?: number;
  fetch?: typeof fetch;
}

// ============================================================================
// Client Configuration
// ============================================================================

/**
 * Options for AWP client with CAS blob exchange
 */
export interface AwpClientOptions {
  /** AWP server endpoint */
  endpoint: string;
  /** CAS server endpoint */
  casEndpoint: string;
  /** Auth handler for authentication (optional) */
  auth?: AwpAuth;
  /** CAS local storage provider for caching (optional) */
  casStorage?: LocalStorageProvider;
  /** Additional headers to include in requests */
  headers?: Record<string, string>;
  /** Custom fetch function (for testing or custom HTTP handling) */
  fetch?: typeof fetch;
}

/**
 * AWP Auth interface (to be implemented by auth module)
 */
export interface AwpAuth {
  hasValidKey(endpoint: string): Promise<boolean>;
  sign(endpoint: string, method: string, url: string, body?: string): Promise<SignedHeaders>;
  handleUnauthorized(endpoint: string, response: AuthChallengeResponse): Promise<boolean>;
  notifyAuthSuccess(endpoint: string): void;
  notifyAuthFailed(endpoint: string, error: Error): void;
}

// ============================================================================
// Tool Schema Types
// ============================================================================

/**
 * Blob schema information for a tool
 */
export interface ToolBlobSchema {
  /** Input blob field names */
  inputBlobs: string[];
  /** Output blob field names */
  outputBlobs: string[];
  /** Blob descriptors from _awp.blob */
  blobDescriptors?: BlobDescriptors;
}

/**
 * Blob descriptors for the AWP extension
 */
export interface BlobDescriptors {
  input: Record<string, string>;
  output: Record<string, string>;
}

/**
 * Tool schema with AWP blob handling applied
 */
export interface AwpToolSchema {
  name: string;
  description?: string;
  /** Input schema with output blob fields transformed for CAS */
  inputSchema: Record<string, unknown>;
  /** Output blob field names (will appear in result.blobs) */
  outputBlobFields: string[];
  /** Input blob field names (require CAS blob refs in args) */
  inputBlobFields: string[];
}

// ============================================================================
// CAS Blob Reference Types
// ============================================================================

/**
 * CAS Blob Reference - used in tool parameters for blob exchange
 *
 * @example
 * ```typescript
 * const ref: CasBlobRefInput = {
 *   "cas-node": "sha256:abc123...",
 *   "path": "."
 * };
 * ```
 */
export interface CasBlobRefInput {
  /** DAG root node key */
  "cas-node": string;
  /** Path within the node ("." for node itself, "./path/to/file" for collection children) */
  path?: string;
}

/**
 * Full CAS Blob Reference with endpoint (what Tool receives)
 */
export interface CasBlobRefWithEndpoint extends CasBlobRefInput {
  /** CAS endpoint URL with embedded ticket */
  "#cas-endpoint": string;
}

/**
 * CAS Blob Output Reference - returned by tools
 */
export interface CasBlobRefOutput {
  /** DAG root node key of the written blob */
  "cas-node": string;
  /** Path within the node */
  path?: string;
}

// ============================================================================
// Tool Call Types
// ============================================================================

/**
 * Tool call result with separated output and blobs
 */
export interface ToolCallResult<TOutput = unknown, TBlobs = Record<string, CasBlobRefOutput>> {
  /** The non-blob output data */
  output: TOutput;
  /** The blob output values (CAS node references) */
  blobs: TBlobs;
  /** Whether the call resulted in an error */
  isError?: boolean;
}

// ============================================================================
// Ticket Types (for CAS integration)
// ============================================================================

/**
 * Ticket creation request
 */
export interface CreateTicketRequest {
  scope: string | string[];
  writable?:
    | boolean
    | {
        quota?: number;
        accept?: string[];
      };
  expiresIn?: number;
}

/**
 * Ticket creation response
 */
export interface CreateTicketResponse {
  id: string;
  endpoint: string;
  expiresAt: string;
  shard: string;
  scope: string | string[];
  writable: boolean | { quota?: number; accept?: string[] };
  config: {
    chunkThreshold: number;
  };
}
