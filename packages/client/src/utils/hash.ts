/**
 * Short Hash Utility
 * Generates short unique identifiers from strings (e.g., endpoint URLs)
 */

/**
 * Base64url encode a Uint8Array
 */
function base64urlEncode(data: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...data));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

/**
 * Generate a short hash from a string using SHA-256
 * @param input - The string to hash (e.g., endpoint URL)
 * @param length - Desired length of the hash (default: 6)
 * @returns A short base64url-encoded hash
 */
export async function shortHash(input: string, length = 6): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = new Uint8Array(hashBuffer);
  const encoded = base64urlEncode(hashArray);
  return encoded.substring(0, length);
}

/**
 * Hash registry for collision detection
 * Maps hash -> original input
 */
export class HashRegistry {
  private hashToInput = new Map<string, string>();
  private inputToHash = new Map<string, string>();
  private baseLength = 6;
  private maxLength = 12;

  /**
   * Generate a unique hash for the input, extending length if collision detected
   * @param input - The string to hash
   * @returns A unique short hash
   */
  async getOrCreate(input: string): Promise<string> {
    // Return existing hash if already registered
    const existing = this.inputToHash.get(input);
    if (existing) {
      return existing;
    }

    // Generate hash with increasing length until unique
    let length = this.baseLength;
    while (length <= this.maxLength) {
      const hash = await shortHash(input, length);
      const collision = this.hashToInput.get(hash);

      if (!collision) {
        // No collision, register and return
        this.hashToInput.set(hash, input);
        this.inputToHash.set(input, hash);
        return hash;
      }

      if (collision === input) {
        // Same input already registered (shouldn't happen due to early return)
        return hash;
      }

      // Collision with different input, try longer hash
      length++;
    }

    // Fallback: append random suffix
    const baseHash = await shortHash(input, this.baseLength);
    const suffix = Math.random().toString(36).substring(2, 6);
    const uniqueHash = `${baseHash}-${suffix}`;
    this.hashToInput.set(uniqueHash, input);
    this.inputToHash.set(input, uniqueHash);
    return uniqueHash;
  }

  /**
   * Get the original input for a hash
   */
  getInput(hash: string): string | undefined {
    return this.hashToInput.get(hash);
  }

  /**
   * Get the hash for an input (if registered)
   */
  getHash(input: string): string | undefined {
    return this.inputToHash.get(input);
  }

  /**
   * Check if a hash is registered
   */
  has(hash: string): boolean {
    return this.hashToInput.has(hash);
  }

  /**
   * Remove a registration
   */
  remove(input: string): boolean {
    const hash = this.inputToHash.get(input);
    if (hash) {
      this.hashToInput.delete(hash);
      this.inputToHash.delete(input);
      return true;
    }
    return false;
  }

  /**
   * Clear all registrations
   */
  clear(): void {
    this.hashToInput.clear();
    this.inputToHash.clear();
  }
}
