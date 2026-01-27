/**
 * LocalStorage Key Storage
 *
 * Simple key storage using browser localStorage.
 * Keys persist across page reloads but have limited capacity.
 */

import type { KeyStorage, StoredKeyData } from "@agent-web-portal/client";

// ============================================================================
// Types
// ============================================================================

/**
 * Options for localStorage-based key storage
 */
export interface LocalStorageKeyStorageOptions {
  /** Prefix for localStorage keys (default: "awp-key:") */
  prefix?: string;
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * localStorage-based key storage
 *
 * Stores keys in browser localStorage.
 * Suitable for simple web applications with small key storage needs.
 *
 * ⚠️ Note: localStorage has limited capacity (~5MB) and is synchronous.
 * For larger storage needs or better performance, use IndexedDBKeyStorage.
 *
 * @example
 * ```typescript
 * import { AwpAuth } from "@agent-web-portal/client";
 * import { LocalStorageKeyStorage } from "@agent-web-portal/client-browser";
 *
 * const auth = new AwpAuth({
 *   clientName: "My Web App",
 *   keyStorage: new LocalStorageKeyStorage(),
 * });
 * ```
 */
export class LocalStorageKeyStorage implements KeyStorage {
  private prefix: string;

  constructor(options: LocalStorageKeyStorageOptions = {}) {
    this.prefix = options.prefix ?? "awp-key:";
  }

  private getKey(endpoint: string): string {
    return `${this.prefix}${endpoint}`;
  }

  private ensureLocalStorage(): void {
    if (typeof localStorage === "undefined") {
      throw new Error("localStorage is not available");
    }
  }

  async load(endpoint: string): Promise<StoredKeyData | null> {
    this.ensureLocalStorage();

    const key = this.getKey(endpoint);
    const value = localStorage.getItem(key);
    if (!value) {
      return null;
    }

    try {
      const data = JSON.parse(value) as StoredKeyData;

      // Check if expired
      if (data.expiresAt && Date.now() > data.expiresAt) {
        await this.delete(endpoint);
        return null;
      }

      return data;
    } catch {
      return null;
    }
  }

  async save(endpoint: string, data: StoredKeyData): Promise<void> {
    this.ensureLocalStorage();

    const key = this.getKey(endpoint);
    localStorage.setItem(key, JSON.stringify(data));
  }

  async delete(endpoint: string): Promise<void> {
    this.ensureLocalStorage();

    const key = this.getKey(endpoint);
    localStorage.removeItem(key);
  }

  async list(): Promise<string[]> {
    this.ensureLocalStorage();

    const endpoints: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(this.prefix)) {
        const endpoint = key.slice(this.prefix.length);
        endpoints.push(endpoint);
      }
    }
    return endpoints;
  }
}
