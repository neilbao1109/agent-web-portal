/**
 * AWP Auth
 *
 * Handles keypair-based authentication for AWP Client.
 *
 * Flow:
 * 1. First request → 401 with auth_init_endpoint
 * 2. Call /auth/init → Server returns verification code
 * 3. Display verification code to user
 * 4. User visits authUrl → Enters verification code → Server stores pubkey
 * 5. Client polls /auth/status until authorized
 * 6. Subsequent requests → Sign with privkey
 */

import { generateKeyPair, signKeyRotation, signRequest } from "./crypto.ts";
import type {
  AuthCallbacks,
  AuthChallenge,
  AuthChallengeResponse,
  AuthInitResponse,
  AwpAuthOptions,
  AwpKeyPair,
  KeyStorage,
  PollAuthStatusOptions,
  PollAuthStatusResult,
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
      | "AUTH_TIMEOUT"
      | "ROTATION_FAILED"
  ) {
    super(message);
    this.name = "AwpAuthError";
  }
}

// ============================================================================
// Standalone Poll Function
// ============================================================================

/**
 * Poll auth status endpoint until authorized or timeout/abort
 *
 * This is a standalone function that can be used independently of AwpAuth,
 * useful for browser clients that need more control over the polling process.
 *
 * @example
 * ```typescript
 * const result = await pollAuthStatus(
 *   "https://example.com/auth/status?pubkey=xxx",
 *   {
 *     interval: 10000, // 10 seconds
 *     timeout: 300000, // 5 minutes
 *   }
 * );
 *
 * if (result.authorized) {
 *   console.log("Authorized! Expires at:", result.expiresAt);
 * }
 * ```
 */
export async function pollAuthStatus(
  statusUrl: string,
  options: PollAuthStatusOptions,
  fetchFn: typeof fetch = fetch
): Promise<PollAuthStatusResult> {
  const { interval, timeout, signal } = options;
  const startTime = Date.now();
  const timeoutMs = timeout ?? Number.POSITIVE_INFINITY;

  while (Date.now() - startTime < timeoutMs) {
    // Check if aborted
    if (signal?.aborted) {
      return { authorized: false };
    }

    try {
      const response = await fetchFn(statusUrl, { signal });
      if (response.ok) {
        const data = (await response.json()) as { authorized: boolean; expires_at?: number };
        if (data.authorized) {
          return {
            authorized: true,
            expiresAt: data.expires_at,
          };
        }
      }
    } catch {
      // If aborted, return immediately
      if (signal?.aborted) {
        return { authorized: false };
      }
      // Ignore other fetch errors, continue polling
    }

    // Wait before next poll
    await new Promise<void>((resolve, reject) => {
      const timeoutId = setTimeout(resolve, interval);
      signal?.addEventListener("abort", () => {
        clearTimeout(timeoutId);
        resolve();
      });
    });
  }

  return { authorized: false };
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
  private fetchFn: typeof fetch;

  // Cached keypair for current session
  private cachedKeyPair: AwpKeyPair | null = null;
  private cachedEndpoint: string | null = null;

  constructor(options: AwpAuthOptions) {
    this.clientName = options.clientName;
    this.keyStorage = options.keyStorage;
    this.callbacks = options.callbacks ?? {};
    this.autoRotateDays = options.autoRotateDays ?? 7;
    this.fetchFn = options.fetch ?? fetch;
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
   * This initiates the authorization flow:
   * 1. Calls /auth/init to get server-generated verification code
   * 2. Notifies callback with auth challenge
   * 3. Optionally polls for authorization completion
   *
   * @returns true if authorization completed and client should retry
   */
  async handleUnauthorized(
    endpoint: string,
    response: AuthChallengeResponse,
    options?: { poll?: boolean; pollTimeout?: number }
  ): Promise<boolean> {
    const { poll = false, pollTimeout = 600000 } = options ?? {}; // 10 min default timeout

    if (!response.auth_init_endpoint) {
      throw new AwpAuthError("Server did not provide auth_init_endpoint", "AUTH_FAILED");
    }

    // Generate new keypair locally
    const keyPair = await generateKeyPair();

    // Call /auth/init to get server-generated verification code
    const initUrl = new URL(response.auth_init_endpoint, endpoint);
    const initResponse = await this.fetchFn(initUrl.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pubkey: keyPair.publicKey,
        client_name: this.clientName,
      }),
    });

    if (!initResponse.ok) {
      const error = await initResponse.text();
      throw new AwpAuthError(`Auth init failed: ${error}`, "AUTH_FAILED");
    }

    const initData = (await initResponse.json()) as AuthInitResponse;

    // Create challenge info with server-provided verification code
    const challenge: AuthChallenge = {
      authUrl: initData.auth_url,
      verificationCode: initData.verification_code,
      publicKey: keyPair.publicKey,
      expiresIn: initData.expires_in,
    };

    // Notify callback
    if (this.callbacks.onAuthRequired) {
      const shouldProceed = await this.callbacks.onAuthRequired(challenge);
      if (!shouldProceed) {
        return false;
      }
    }

    // Store the keypair (will be validated when auth completes)
    await this.saveKeyPair(endpoint, keyPair);

    // Optionally poll for authorization completion
    if (poll) {
      const statusUrl = new URL(response.auth_status_endpoint ?? "/auth/status", endpoint);
      statusUrl.searchParams.set("pubkey", keyPair.publicKey);

      const authorized = await this.pollAuthStatus(
        statusUrl.toString(),
        initData.poll_interval * 1000,
        pollTimeout
      );

      if (!authorized) {
        // Clear the stored key if authorization failed/timed out
        await this.clearKey(endpoint);
        throw new AwpAuthError("Authorization timed out", "AUTH_TIMEOUT");
      }

      if (this.callbacks.onAuthSuccess) {
        this.callbacks.onAuthSuccess();
      }
    }

    return true;
  }

  /**
   * Poll the auth status endpoint until authorized or timeout
   */
  private async pollAuthStatus(
    statusUrl: string,
    pollInterval: number,
    timeout: number
  ): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        const response = await this.fetchFn(statusUrl);
        if (response.ok) {
          const data = (await response.json()) as { authorized: boolean; expires_at?: number };
          if (data.authorized) {
            return true;
          }
        }
      } catch {
        // Ignore fetch errors, continue polling
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    return false;
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
   */
  async rotateKey(endpoint: string, rotateEndpoint: string): Promise<void> {
    const oldKeyPair = await this.getKeyPair(endpoint);
    if (!oldKeyPair) {
      throw new AwpAuthError("No existing key to rotate", "NO_KEY");
    }

    // Generate new keypair
    const newKeyPair = await generateKeyPair();

    // Sign rotation request
    const { signature, timestamp } = await signKeyRotation(oldKeyPair, newKeyPair);

    // Send rotation request
    const response = await this.fetchFn(rotateEndpoint, {
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
}
