/**
 * CAS Client Node.js - File System Storage Provider
 *
 * Local caching implementation using the filesystem
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { ByteStream, CasRawNode, LocalStorageProvider } from "@agent-web-portal/cas-client-core";

/**
 * File system based local storage provider for caching CAS nodes
 */
export class FileSystemStorageProvider implements LocalStorageProvider {
  private cacheDir: string;

  constructor(cacheDir: string) {
    this.cacheDir = cacheDir;
    // Ensure cache directory exists
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  /**
   * Get path for node metadata file
   */
  private metaPath(key: string): string {
    const hash = key.replace("sha256:", "");
    const dir = path.join(this.cacheDir, "sha256", hash.slice(0, 2));
    return path.join(dir, `${hash.slice(2)}.meta.json`);
  }

  /**
   * Get path for chunk data file
   */
  private chunkPath(key: string): string {
    const hash = key.replace("sha256:", "");
    const dir = path.join(this.cacheDir, "sha256", hash.slice(0, 2));
    return path.join(dir, `${hash.slice(2)}.data`);
  }

  /**
   * Check if a node is cached
   */
  async has(key: string): Promise<boolean> {
    try {
      await fs.promises.access(this.metaPath(key));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get cached node metadata
   */
  async getMeta(key: string): Promise<CasRawNode | null> {
    try {
      const data = await fs.promises.readFile(this.metaPath(key), "utf-8");
      return JSON.parse(data) as CasRawNode;
    } catch {
      return null;
    }
  }

  /**
   * Get cached chunk data as async iterable stream
   */
  async getChunkStream(key: string): Promise<ByteStream | null> {
    const p = this.chunkPath(key);
    try {
      await fs.promises.access(p);
      const nodeStream = fs.createReadStream(p);

      // Convert Node.js Readable to AsyncIterable<Uint8Array>
      async function* toByteStream(): ByteStream {
        for await (const chunk of nodeStream) {
          yield Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        }
      }

      return toByteStream();
    } catch {
      return null;
    }
  }

  /**
   * Store node metadata
   */
  async putMeta(key: string, node: CasRawNode): Promise<void> {
    const p = this.metaPath(key);
    await fs.promises.mkdir(path.dirname(p), { recursive: true });
    await fs.promises.writeFile(p, JSON.stringify(node, null, 2));
  }

  /**
   * Store chunk data
   */
  async putChunk(key: string, data: Uint8Array): Promise<void> {
    const p = this.chunkPath(key);
    await fs.promises.mkdir(path.dirname(p), { recursive: true });
    await fs.promises.writeFile(p, data);
  }

  /**
   * Clean up cache based on size or age
   */
  async prune(options?: { maxSize?: number; maxAge?: number }): Promise<void> {
    // TODO: Implement LRU or time-based cache eviction
    console.log("Cache pruning not yet implemented", options);
  }

  /**
   * Get total cache size in bytes
   */
  async getCacheSize(): Promise<number> {
    let totalSize = 0;

    const walkDir = async (dir: string): Promise<void> => {
      try {
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            await walkDir(fullPath);
          } else if (entry.isFile()) {
            const stat = await fs.promises.stat(fullPath);
            totalSize += stat.size;
          }
        }
      } catch {
        // Directory doesn't exist or not accessible
      }
    };

    await walkDir(this.cacheDir);
    return totalSize;
  }

  /**
   * Clear all cached data
   */
  async clear(): Promise<void> {
    try {
      await fs.promises.rm(this.cacheDir, { recursive: true, force: true });
      await fs.promises.mkdir(this.cacheDir, { recursive: true });
    } catch {
      // Ignore errors
    }
  }
}
