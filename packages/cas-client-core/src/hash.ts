/**
 * CAS Client Core - Hash Utilities
 *
 * Platform-agnostic SHA-256 hashing (uses Web Crypto API)
 */

/**
 * Compute SHA-256 hash of content and return as CAS key
 * Works in both Node.js and browser environments via Web Crypto API
 */
export async function computeKey(content: Uint8Array): Promise<string> {
  // Create a new ArrayBuffer copy to ensure compatibility with Web Crypto API
  const buffer = new ArrayBuffer(content.length);
  new Uint8Array(buffer).set(content);
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = new Uint8Array(hashBuffer);
  const hashHex = Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `sha256:${hashHex}`;
}

/**
 * Compute keys for multiple chunks
 */
export async function computeChunkKeys(chunks: Uint8Array[]): Promise<string[]> {
  return Promise.all(chunks.map((chunk) => computeKey(chunk)));
}

/**
 * Validate a CAS key format
 */
export function isValidKey(key: string): boolean {
  return /^sha256:[a-f0-9]{64}$/.test(key);
}

/**
 * Extract hash from CAS key
 */
export function extractHash(key: string): string {
  if (!key.startsWith("sha256:")) {
    throw new Error(`Invalid CAS key format: ${key}`);
  }
  return key.slice(7);
}
