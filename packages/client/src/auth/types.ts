/**
 * AWP Auth Types
 *
 * Simple keypair-based authentication for AWP Client.
 * Uses ECDSA P-256 for signing requests.
 */

// ============================================================================
// Key Types
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

// ============================================================================
// Key Storage Interface
// ============================================================================

/**
 * Key storage interface
 *
 * Implement this to persist keypairs across sessions.
 * Examples: localStorage, file system, secure enclave
 */
export interface KeyStorage {
  /**
   * Load stored key data for an endpoint
   * @returns null if no key exists
   */
  load(endpoint: string): Promise<StoredKeyData | null>;

  /**
   * Save key data for an endpoint
   */
  save(endpoint: string, data: StoredKeyData): Promise<void>;

  /**
   * Delete key data for an endpoint
   */
  delete(endpoint: string): Promise<void>;

  /**
   * List all stored endpoints
   */
  list(): Promise<string[]>;
}

// ============================================================================
// Auth Challenge & Response
// ============================================================================

/**
 * 401 response from AWP server
 */
export interface AuthChallengeResponse {
  error: "unauthorized";
  error_description?: string;
  /** Endpoint for initiating authorization (/auth/init) */
  auth_init_endpoint?: string;
  /** Endpoint for polling authorization status (optional, defaults to /auth/status) */
  auth_status_endpoint?: string;
}

/**
 * Response from POST /auth/init
 */
export interface AuthInitResponse {
  /** URL for user to visit to complete authorization */
  auth_url: string;
  /** Server-generated verification code to display to user */
  verification_code: string;
  /** Seconds until this authorization request expires */
  expires_in: number;
  /** Recommended polling interval in seconds */
  poll_interval: number;
}

/**
 * Authorization challenge info for user
 */
export interface AuthChallenge {
  /** Full authorization URL for user to visit */
  authUrl: string;
  /** Server-generated verification code (format: XXX-XXX) */
  verificationCode: string;
  /** Public key being authorized */
  publicKey: string;
  /** Seconds until this authorization expires */
  expiresIn: number;
}

// ============================================================================
// Request Signing
// ============================================================================

/**
 * Signed request headers
 */
export interface SignedHeaders {
  "X-AWP-Pubkey": string;
  "X-AWP-Timestamp": string;
  "X-AWP-Signature": string;
  [key: string]: string;
}

// ============================================================================
// Auth Callbacks
// ============================================================================

/**
 * Callbacks for auth events
 */
export interface AuthCallbacks {
  /**
   * Called when authorization is required.
   * UI should display the authUrl and verificationCode to user.
   *
   * @param challenge - Authorization info to display
   * @returns true if user wants to proceed, false to cancel
   */
  onAuthRequired?: (challenge: AuthChallenge) => Promise<boolean>;

  /**
   * Called when authorization succeeds
   */
  onAuthSuccess?: () => void;

  /**
   * Called when authorization fails after user attempted
   */
  onAuthFailed?: (error: Error) => void;

  /**
   * Called when key is about to expire (optional, for proactive renewal)
   * @param daysRemaining - Days until expiration
   */
  onKeyExpiring?: (daysRemaining: number) => void;
}

// ============================================================================
// Auth Options
// ============================================================================

/**
 * Options for AwpAuth
 */
export interface AwpAuthOptions {
  /** Client name displayed during authorization */
  clientName: string;
  /** Key storage implementation */
  keyStorage: KeyStorage;
  /** Event callbacks */
  callbacks?: AuthCallbacks;
  /**
   * Auto-rotate key when it has less than this many days remaining.
   * Set to 0 to disable auto-rotation.
   * Default: 7
   */
  autoRotateDays?: number;
  /**
   * Custom fetch function (for testing or custom environments)
   */
  fetch?: typeof fetch;
}

// ============================================================================
// Poll Auth Status Options
// ============================================================================

/**
 * Options for polling auth status
 */
export interface PollAuthStatusOptions {
  /** Polling interval in milliseconds */
  interval: number;
  /** Timeout in milliseconds (optional, defaults to expiresAt) */
  timeout?: number;
  /** AbortSignal to cancel polling */
  signal?: AbortSignal;
}

/**
 * Result of polling auth status
 */
export interface PollAuthStatusResult {
  /** Whether authorization was successful */
  authorized: boolean;
  /** When the authorization expires (Unix timestamp in ms) */
  expiresAt?: number;
}

// ============================================================================
// Auth URL Builder
// ============================================================================

/**
 * Parameters for building auth URL
 */
export interface BuildAuthUrlParams {
  /** Server endpoint base URL */
  endpoint: string;
  /** Public key in base64url format */
  pubkey: string;
  /** Client name */
  clientName: string;
  /** Auth init endpoint path (default: /auth/init) */
  authInitPath?: string;
}
