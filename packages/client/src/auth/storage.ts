/**
 * Key Storage Implementations
 *
 * Provides different storage backends for persisting keypairs.
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

// ============================================================================
// File-based Storage (for Node.js/Bun)
// ============================================================================

/**
 * Options for file-based key storage
 */
export interface FileKeyStorageOptions {
  /** Directory to store key files */
  directory: string;
}

/**
 * File-based key storage
 *
 * Stores each endpoint's keys in a separate JSON file.
 * Suitable for CLI tools and server-side applications.
 */
export class FileKeyStorage implements KeyStorage {
  private directory: string;

  constructor(options: FileKeyStorageOptions) {
    this.directory = options.directory;
  }

  private getFilePath(endpoint: string): string {
    // Create a safe filename from endpoint
    const safeName = endpoint
      .replace(/[^a-zA-Z0-9]/g, "_")
      .replace(/_+/g, "_")
      .slice(0, 100);
    return `${this.directory}/${safeName}.json`;
  }

  async load(endpoint: string): Promise<StoredKeyData | null> {
    const filePath = this.getFilePath(endpoint);
    try {
      const { readFile } = await import("node:fs/promises");
      const content = await readFile(filePath, "utf-8");
      return JSON.parse(content) as StoredKeyData;
    } catch {
      return null;
    }
  }

  async save(endpoint: string, data: StoredKeyData): Promise<void> {
    const filePath = this.getFilePath(endpoint);
    const { mkdir, writeFile } = await import("node:fs/promises");
    await mkdir(this.directory, { recursive: true });
    await writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
  }

  async delete(endpoint: string): Promise<void> {
    const filePath = this.getFilePath(endpoint);
    try {
      const { unlink } = await import("node:fs/promises");
      await unlink(filePath);
    } catch {
      // Ignore if file doesn't exist
    }
  }

  async list(): Promise<string[]> {
    try {
      const { readdir, readFile } = await import("node:fs/promises");
      const files = await readdir(this.directory);
      const endpoints: string[] = [];

      for (const file of files) {
        if (file.endsWith(".json")) {
          try {
            const content = await readFile(`${this.directory}/${file}`, "utf-8");
            const data = JSON.parse(content) as StoredKeyData;
            endpoints.push(data.endpoint);
          } catch {
            // Skip invalid files
          }
        }
      }

      return endpoints;
    } catch {
      return [];
    }
  }
}

// ============================================================================
// Browser LocalStorage (for web apps)
// ============================================================================

/**
 * Options for localStorage-based key storage
 */
export interface LocalStorageKeyStorageOptions {
  /** Prefix for localStorage keys */
  prefix?: string;
}

/**
 * localStorage-based key storage
 *
 * Stores keys in browser localStorage.
 * Suitable for web applications.
 *
 * ⚠️ Note: localStorage is not secure for highly sensitive keys.
 * Consider using Web Crypto API's non-extractable keys or
 * a more secure storage mechanism for production.
 */
export class LocalStorageKeyStorage implements KeyStorage {
  private prefix: string;

  constructor(options: LocalStorageKeyStorageOptions = {}) {
    this.prefix = options.prefix ?? "awp-key:";
  }

  private getKey(endpoint: string): string {
    return `${this.prefix}${endpoint}`;
  }

  async load(endpoint: string): Promise<StoredKeyData | null> {
    if (typeof localStorage === "undefined") {
      throw new Error("localStorage is not available");
    }
    const key = this.getKey(endpoint);
    const value = localStorage.getItem(key);
    if (!value) {
      return null;
    }
    return JSON.parse(value) as StoredKeyData;
  }

  async save(endpoint: string, data: StoredKeyData): Promise<void> {
    if (typeof localStorage === "undefined") {
      throw new Error("localStorage is not available");
    }
    const key = this.getKey(endpoint);
    localStorage.setItem(key, JSON.stringify(data));
  }

  async delete(endpoint: string): Promise<void> {
    if (typeof localStorage === "undefined") {
      throw new Error("localStorage is not available");
    }
    const key = this.getKey(endpoint);
    localStorage.removeItem(key);
  }

  async list(): Promise<string[]> {
    if (typeof localStorage === "undefined") {
      throw new Error("localStorage is not available");
    }
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
