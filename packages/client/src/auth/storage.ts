/**
 * Key Storage Implementations
 *
 * Provides in-memory storage backend for testing.
 * Platform-specific implementations (file, IndexedDB, localStorage)
 * are in separate packages: @agent-web-portal/client-nodejs and @agent-web-portal/client-browser
 */

import type { KeyStorage, StoredKeyData } from "./types.ts";

// ============================================================================
// In-Memory Storage (for testing)
// ============================================================================

/**
 * In-memory key storage
 *
 * Keys are lost when the process exits.
 * Useful for testing or single-session usage.
 */
export class MemoryKeyStorage implements KeyStorage {
  private store = new Map<string, StoredKeyData>();

  async load(endpoint: string): Promise<StoredKeyData | null> {
    return this.store.get(endpoint) ?? null;
  }

  async save(endpoint: string, data: StoredKeyData): Promise<void> {
    this.store.set(endpoint, data);
  }

  async delete(endpoint: string): Promise<void> {
    this.store.delete(endpoint);
  }

  async list(): Promise<string[]> {
    return Array.from(this.store.keys());
  }
}
