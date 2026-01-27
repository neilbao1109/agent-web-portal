/**
 * File-based Key Storage
 *
 * Persistent key storage using the file system for Node.js/Bun environments.
 */

import type { KeyStorage, StoredKeyData } from "@agent-web-portal/client";

// ============================================================================
// Types
// ============================================================================

/**
 * Options for file-based key storage
 */
export interface FileKeyStorageOptions {
  /** Directory to store key files */
  directory: string;
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * File-based key storage
 *
 * Stores each endpoint's keys in a separate JSON file.
 * Suitable for CLI tools and server-side applications.
 *
 * @example
 * ```typescript
 * import { AwpAuth } from "@agent-web-portal/client";
 * import { FileKeyStorage } from "@agent-web-portal/client-nodejs";
 *
 * const auth = new AwpAuth({
 *   clientName: "My AI Agent",
 *   keyStorage: new FileKeyStorage({ directory: "~/.awp/keys" }),
 * });
 * ```
 */
export class FileKeyStorage implements KeyStorage {
  private directory: string;

  constructor(options: FileKeyStorageOptions) {
    // Expand ~ to home directory
    if (options.directory.startsWith("~")) {
      const homedir = process.env.HOME || process.env.USERPROFILE || "";
      this.directory = options.directory.replace("~", homedir);
    } else {
      this.directory = options.directory;
    }
  }

  /**
   * Create a safe filename from endpoint URL
   */
  private getFilePath(endpoint: string): string {
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
      const data = JSON.parse(content) as StoredKeyData;

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
