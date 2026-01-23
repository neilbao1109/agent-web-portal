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
  /** Public key in base64url format */
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
  /** Authorization endpoint URL */
  auth_endpoint?: string;
}

/**
 * Authorization challenge info for user
 */
export interface AuthChallenge {
  /** Full authorization URL for user to visit */
  authUrl: string;
  /** 8-character verification code user needs to enter */
  verificationCode: string;
  /** Public key being authorized */
  publicKey: string;
  /** Nonce used for this authorization */
  nonce: string;
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
}
