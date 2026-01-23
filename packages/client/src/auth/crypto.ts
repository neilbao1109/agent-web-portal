/**
 * AWP Auth Crypto Utilities
 *
 * ECDSA P-256 key generation, signing, and verification.
 */

import type { AwpKeyPair, SignedHeaders } from "./types.ts";

// ============================================================================
// Constants
// ============================================================================

const ALGORITHM = {
  name: "ECDSA",
  namedCurve: "P-256",
} as const;

const SIGN_ALGORITHM = {
  name: "ECDSA",
  hash: "SHA-256",
} as const;

// ============================================================================
// Base64url Encoding
// ============================================================================

/**
 * Encode bytes to base64url string
 */
export function base64urlEncode(data: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...data));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Decode base64url string to bytes
 */
export function base64urlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padding = (4 - (base64.length % 4)) % 4;
  const padded = base64 + "=".repeat(padding);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/**
 * Encode string to hex
 */
export function hexEncode(data: Uint8Array): string {
  return Array.from(data)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ============================================================================
// Key Generation
// ============================================================================

/**
 * Generate a new ECDSA P-256 keypair
 */
export async function generateKeyPair(): Promise<AwpKeyPair> {
  const keyPair = await crypto.subtle.generateKey(ALGORITHM, true, ["sign", "verify"]);

  // Export keys to JWK format
  const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const privateJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);

  // Encode as compact format: x || y for public, d for private
  const publicKey = `${publicJwk.x}.${publicJwk.y}`;
  const privateKey = privateJwk.d!;

  return {
    publicKey,
    privateKey,
    createdAt: Date.now(),
  };
}

/**
 * Import a keypair from stored format
 */
async function importKeyPair(
  keyPair: AwpKeyPair
): Promise<{ publicKey: CryptoKey; privateKey: CryptoKey }> {
  const [x, y] = keyPair.publicKey.split(".");

  const publicJwk = {
    kty: "EC",
    crv: "P-256",
    x,
    y,
  };

  const privateJwk = {
    kty: "EC",
    crv: "P-256",
    x,
    y,
    d: keyPair.privateKey,
  };

  const [publicKey, privateKey] = await Promise.all([
    crypto.subtle.importKey("jwk", publicJwk, ALGORITHM, true, ["verify"]),
    crypto.subtle.importKey("jwk", privateJwk, ALGORITHM, true, ["sign"]),
  ]);

  return { publicKey, privateKey };
}

// ============================================================================
// Signing
// ============================================================================

/**
 * Sign data with private key
 */
export async function sign(keyPair: AwpKeyPair, data: string): Promise<string> {
  const { privateKey } = await importKeyPair(keyPair);
  const encoder = new TextEncoder();
  const signature = await crypto.subtle.sign(SIGN_ALGORITHM, privateKey, encoder.encode(data));
  return base64urlEncode(new Uint8Array(signature));
}

/**
 * Generate a cryptographically secure random nonce (32 bytes)
 */
export function generateNonce(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return hexEncode(bytes);
}

// ============================================================================
// Verification Code Generation
// ============================================================================

/**
 * Generate verification code from signature
 *
 * Signs (nonce || publicKey) and takes last 8 hex characters
 */
export async function generateVerificationCode(
  keyPair: AwpKeyPair,
  nonce: string
): Promise<string> {
  const payload = `${nonce}||${keyPair.publicKey}`;
  const signature = await sign(keyPair, payload);
  // Take last 8 characters of the signature as verification code
  return signature.slice(-8).toUpperCase();
}

// ============================================================================
// Request Signing
// ============================================================================

/**
 * Sign an HTTP request
 *
 * Signature payload: `${timestamp}.${method}.${path}.${bodyHash}`
 */
export async function signRequest(
  keyPair: AwpKeyPair,
  method: string,
  url: string,
  body: string
): Promise<SignedHeaders> {
  const timestamp = Math.floor(Date.now() / 1000).toString();

  // Extract path from URL
  const urlObj = new URL(url);
  const path = urlObj.pathname + urlObj.search;

  // Hash the body
  const encoder = new TextEncoder();
  const bodyBytes = encoder.encode(body);
  const hashBuffer = await crypto.subtle.digest("SHA-256", bodyBytes);
  const bodyHash = base64urlEncode(new Uint8Array(hashBuffer));

  // Create signature payload
  const payload = `${timestamp}.${method.toUpperCase()}.${path}.${bodyHash}`;
  const signature = await sign(keyPair, payload);

  return {
    "X-AWP-Pubkey": keyPair.publicKey,
    "X-AWP-Timestamp": timestamp,
    "X-AWP-Signature": signature,
  };
}

// ============================================================================
// Key Rotation
// ============================================================================

/**
 * Sign a key rotation request
 *
 * Signature payload: `rotate||${newPublicKey}||${timestamp}`
 */
export async function signKeyRotation(
  oldKeyPair: AwpKeyPair,
  newKeyPair: AwpKeyPair
): Promise<{ signature: string; timestamp: number }> {
  const timestamp = Math.floor(Date.now() / 1000);
  const payload = `rotate||${newKeyPair.publicKey}||${timestamp}`;
  const signature = await sign(oldKeyPair, payload);
  return { signature, timestamp };
}
