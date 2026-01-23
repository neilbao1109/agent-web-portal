/**
 * AWP Auth
 *
 * Handles keypair-based authentication for AWP Client.
 *
 * Flow:
 * 1. First request → 401 with auth_endpoint
 * 2. Generate keypair → Create authUrl with verification code
 * 3. User visits authUrl → Enters verification code → Server stores pubkey
 * 4. Subsequent requests → Sign with privkey
 */

import {
  generateKeyPair,
  generateNonce,
  generateVerificationCode,
  signKeyRotation,
  signRequest,
} from "./crypto.ts";
import type {
  AuthCallbacks,
  AuthChallenge,
  AuthChallengeResponse,
  AwpAuthOptions,
  AwpKeyPair,
  KeyStorage,
  SignedHeaders,
  StoredKeyData,
} from "./types.ts";

// ============================================================================
// Auth Error
// ============================================================================

/**
 * Error thrown when authentication fails
 */
export class AwpAuthError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "NO_KEY"
      | "KEY_EXPIRED"
      | "AUTH_REQUIRED"
      | "AUTH_FAILED"
      | "ROTATION_FAILED"
  ) {
    super(message);
    this.name = "AwpAuthError";
  }
}

// ============================================================================
// AwpAuth Class
// ============================================================================

/**
 * AWP Authentication Manager
 *
 * Handles keypair generation, storage, request signing, and key rotation.
 *
 * @example
 * ```typescript
 * const auth = new AwpAuth({
 *   clientName: "My AI Agent",
 *   keyStorage: new FileKeyStorage({ directory: "~/.awp/keys" }),
 *   callbacks: {
 *     onAuthRequired: async (challenge) => {
 *       console.log("Please visit:", challenge.authUrl);
 *       console.log("Verification code:", challenge.verificationCode);
 *       return await askUserToContinue();
 *     },
 *   },
 * });
 * ```
 */
export class AwpAuth {
  private clientName: string;
  private keyStorage: KeyStorage;
  private callbacks: AuthCallbacks;
  private autoRotateDays: number;

  // Cached keypair for current session
  private cachedKeyPair: AwpKeyPair | null = null;
  private cachedEndpoint: string | null = null;

  constructor(options: AwpAuthOptions) {
    this.clientName = options.clientName;
    this.keyStorage = options.keyStorage;
    this.callbacks = options.callbacks ?? {};
    this.autoRotateDays = options.autoRotateDays ?? 7;
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Check if we have a valid key for the endpoint
   */
  async hasValidKey(endpoint: string): Promise<boolean> {
    const data = await this.keyStorage.load(endpoint);
    if (!data) {
      return false;
    }

    // Check if expired
    if (data.expiresAt && Date.now() > data.expiresAt) {
      return false;
    }

    return true;
  }

  /**
   * Sign an HTTP request
   *
   * @throws AwpAuthError if no key available
   */
  async sign(endpoint: string, method: string, url: string, body: string): Promise<SignedHeaders> {
    const keyPair = await this.getKeyPair(endpoint);
    if (!keyPair) {
      throw new AwpAuthError("No key available for endpoint", "NO_KEY");
    }

    return signRequest(keyPair, method, url, body);
  }

  /**
   * Handle a 401 response from the server
   *
   * @returns true if authorization was initiated and client should retry
   */
  async handleUnauthorized(endpoint: string, response: AuthChallengeResponse): Promise<boolean> {
    if (!response.auth_endpoint) {
      throw new AwpAuthError("Server did not provide auth_endpoint", "AUTH_FAILED");
    }

    // Generate new keypair
    const keyPair = await generateKeyPair();
    const nonce = generateNonce();
    const verificationCode = await generateVerificationCode(keyPair, nonce);

    // Build auth URL
    const authUrl = this.buildAuthUrl(response.auth_endpoint, keyPair.publicKey, nonce);

    // Create challenge info
    const challenge: AuthChallenge = {
      authUrl,
      verificationCode,
      publicKey: keyPair.publicKey,
      nonce,
    };

    // Notify callback
    if (this.callbacks.onAuthRequired) {
      const shouldProceed = await this.callbacks.onAuthRequired(challenge);
      if (!shouldProceed) {
        return false;
      }
    }

    // Store the keypair (will be validated on next request)
    await this.saveKeyPair(endpoint, keyPair);

    return true;
  }

  /**
   * Notify that authorization succeeded
   */
  notifyAuthSuccess(endpoint: string, expiresAt?: number): void {
    // Update expiration if provided
    if (expiresAt) {
      this.updateExpiration(endpoint, expiresAt);
    }

    // Check if we should warn about expiration
    this.checkExpiration(endpoint);

    if (this.callbacks.onAuthSuccess) {
      this.callbacks.onAuthSuccess();
    }
  }

  /**
   * Notify that authorization failed
   */
  notifyAuthFailed(endpoint: string, error: Error): void {
    // Clear the invalid key
    this.clearKey(endpoint);

    if (this.callbacks.onAuthFailed) {
      this.callbacks.onAuthFailed(error);
    }
  }

  /**
   * Rotate the key for an endpoint
   *
   * @param endpoint - The server endpoint
   * @param rotateEndpoint - The rotation API endpoint (e.g., /auth/rotate)
   * @param fetchFn - Fetch function to use
   */
  async rotateKey(
    endpoint: string,
    rotateEndpoint: string,
    fetchFn: typeof fetch = fetch
  ): Promise<void> {
    const oldKeyPair = await this.getKeyPair(endpoint);
    if (!oldKeyPair) {
      throw new AwpAuthError("No existing key to rotate", "NO_KEY");
    }

    // Generate new keypair
    const newKeyPair = await generateKeyPair();

    // Sign rotation request
    const { signature, timestamp } = await signKeyRotation(oldKeyPair, newKeyPair);

    // Send rotation request
    const response = await fetchFn(rotateEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        old_pubkey: oldKeyPair.publicKey,
        new_pubkey: newKeyPair.publicKey,
        timestamp,
        signature,
      }),
    });

    if (!response.ok) {
      throw new AwpAuthError(`Key rotation failed: ${response.status}`, "ROTATION_FAILED");
    }

    // Save new keypair
    await this.saveKeyPair(endpoint, newKeyPair);
  }

  /**
   * Clear stored key for an endpoint
   */
  async clearKey(endpoint: string): Promise<void> {
    await this.keyStorage.delete(endpoint);
    if (this.cachedEndpoint === endpoint) {
      this.cachedKeyPair = null;
      this.cachedEndpoint = null;
    }
  }

  /**
   * Get client name
   */
  getClientName(): string {
    return this.clientName;
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Get keypair for endpoint (from cache or storage)
   */
  private async getKeyPair(endpoint: string): Promise<AwpKeyPair | null> {
    // Check cache
    if (this.cachedEndpoint === endpoint && this.cachedKeyPair) {
      return this.cachedKeyPair;
    }

    // Load from storage
    const data = await this.keyStorage.load(endpoint);
    if (!data) {
      return null;
    }

    // Cache it
    this.cachedKeyPair = data.keyPair;
    this.cachedEndpoint = endpoint;

    return data.keyPair;
  }

  /**
   * Save keypair for endpoint
   */
  private async saveKeyPair(endpoint: string, keyPair: AwpKeyPair): Promise<void> {
    const data: StoredKeyData = {
      keyPair,
      endpoint,
      clientName: this.clientName,
    };

    await this.keyStorage.save(endpoint, data);

    // Update cache
    this.cachedKeyPair = keyPair;
    this.cachedEndpoint = endpoint;
  }

  /**
   * Update expiration time for stored key
   */
  private async updateExpiration(endpoint: string, expiresAt: number): Promise<void> {
    const data = await this.keyStorage.load(endpoint);
    if (data) {
      data.expiresAt = expiresAt;
      await this.keyStorage.save(endpoint, data);
    }
  }

  /**
   * Check if key is expiring soon and notify/rotate
   */
  private async checkExpiration(endpoint: string): Promise<void> {
    const data = await this.keyStorage.load(endpoint);
    if (!data?.expiresAt) {
      return;
    }

    const daysRemaining = (data.expiresAt - Date.now()) / (24 * 60 * 60 * 1000);

    if (daysRemaining <= 0) {
      // Already expired
      return;
    }

    if (daysRemaining <= this.autoRotateDays) {
      if (this.callbacks.onKeyExpiring) {
        this.callbacks.onKeyExpiring(Math.ceil(daysRemaining));
      }
    }
  }

  /**
   * Build authorization URL
   */
  private buildAuthUrl(authEndpoint: string, publicKey: string, nonce: string): string {
    const url = new URL(authEndpoint);
    url.searchParams.set("pubkey", publicKey);
    url.searchParams.set("nonce", nonce);
    url.searchParams.set("client", this.clientName);
    return url.toString();
  }
}
