/**
 * Secrets Manager for Image Workshop
 *
 * Fetches API keys with caching. Prioritizes environment variables.
 */

import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";

// ============================================================================
// Configuration
// ============================================================================

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const AWS_REGION = process.env.AWS_REGION ?? "us-east-1";

// ============================================================================
// Cache
// ============================================================================

interface CacheEntry {
  value: string;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

function getCached(key: string): string | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;

  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return undefined;
  }

  return entry.value;
}

function setCache(key: string, value: string): void {
  cache.set(key, {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

// ============================================================================
// Secrets Manager Client
// ============================================================================

let secretsClient: SecretsManagerClient | null = null;

function getSecretsClient(): SecretsManagerClient {
  if (!secretsClient) {
    secretsClient = new SecretsManagerClient({ region: AWS_REGION });
  }
  return secretsClient;
}

async function getSecretValue(secretArn: string): Promise<string> {
  const client = getSecretsClient();
  const command = new GetSecretValueCommand({ SecretId: secretArn });
  const response = await client.send(command);

  if (response.SecretString) {
    return response.SecretString;
  }

  throw new Error(`Secret ${secretArn} has no string value`);
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Get Stability AI API key
 * Checks environment variable first, then Secrets Manager
 */
export async function getStabilityApiKey(): Promise<string> {
  // Environment variable takes priority
  const envKey = process.env.STABILITY_API_KEY;
  if (envKey) return envKey;

  // Check cache
  const cacheKey = "STABILITY_API_KEY";
  const cached = getCached(cacheKey);
  if (cached) return cached;

  // Fetch from Secrets Manager using ARN
  const secretArn = process.env.STABILITY_API_KEY_ARN;
  if (!secretArn) {
    throw new Error("STABILITY_API_KEY or STABILITY_API_KEY_ARN must be set");
  }

  const apiKey = await getSecretValue(secretArn);
  setCache(cacheKey, apiKey);
  return apiKey;
}

/**
 * Get Black Forest Labs API key
 * Checks environment variable first, then Secrets Manager
 */
export async function getBflApiKey(): Promise<string> {
  // Environment variable takes priority
  const envKey = process.env.BFL_API_KEY;
  if (envKey) return envKey;

  // Check cache
  const cacheKey = "BFL_API_KEY";
  const cached = getCached(cacheKey);
  if (cached) return cached;

  // Fetch from Secrets Manager using ARN
  const secretArn = process.env.BFL_API_KEY_ARN;
  if (!secretArn) {
    throw new Error("BFL_API_KEY or BFL_API_KEY_ARN must be set");
  }

  const apiKey = await getSecretValue(secretArn);
  setCache(cacheKey, apiKey);
  return apiKey;
}

/**
 * Clear all cached secrets (useful for testing)
 */
export function clearSecretsCache(): void {
  cache.clear();
}
