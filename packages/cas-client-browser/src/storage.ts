/**
 * CAS Client Browser - IndexedDB Storage Provider
 *
 * Local caching implementation using IndexedDB
 */

import type { ByteStream, CasRawNode, LocalStorageProvider } from "@agent-web-portal/cas-client-core";

const DB_VERSION = 1;
const META_STORE = "meta";
const CHUNK_STORE = "chunks";

/**
 * IndexedDB based local storage provider for caching CAS nodes in browsers
 */
export class IndexedDBStorageProvider implements LocalStorageProvider {
  private dbName: string;
  private dbPromise: Promise<IDBDatabase> | null = null;

  constructor(dbName: string = "cas-cache") {
    this.dbName = dbName;
  }

  /**
   * Get or create the IndexedDB database
   */
  private async getDb(): Promise<IDBDatabase> {
    if (this.dbPromise) {
      return this.dbPromise;
    }

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create object stores if they don't exist
        if (!db.objectStoreNames.contains(META_STORE)) {
          db.createObjectStore(META_STORE, { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains(CHUNK_STORE)) {
          db.createObjectStore(CHUNK_STORE, { keyPath: "key" });
        }
      };
    });

    return this.dbPromise;
  }

  /**
   * Check if a node is cached
   */
  async has(key: string): Promise<boolean> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(META_STORE, "readonly");
      const store = tx.objectStore(META_STORE);
      const request = store.count(key);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result > 0);
    });
  }

  /**
   * Get cached node metadata
   */
  async getMeta(key: string): Promise<CasRawNode | null> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(META_STORE, "readonly");
      const store = tx.objectStore(META_STORE);
      const request = store.get(key);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.node : null);
      };
    });
  }

  /**
   * Get cached chunk data as async iterable stream
   */
  async getChunkStream(key: string): Promise<ByteStream | null> {
    const db = await this.getDb();
    const data = await new Promise<Uint8Array | null>((resolve, reject) => {
      const tx = db.transaction(CHUNK_STORE, "readonly");
      const store = tx.objectStore(CHUNK_STORE);
      const request = store.get(key);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.data : null);
      };
    });

    if (!data) {
      return null;
    }

    // Return as single-chunk async iterable
    const chunkData = data;
    async function* toByteStream(): ByteStream {
      yield chunkData;
    }

    return toByteStream();
  }

  /**
   * Store node metadata
   */
  async putMeta(key: string, node: CasRawNode): Promise<void> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(META_STORE, "readwrite");
      const store = tx.objectStore(META_STORE);
      const request = store.put({ key, node, timestamp: Date.now() });

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  /**
   * Store chunk data
   */
  async putChunk(key: string, data: Uint8Array): Promise<void> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(CHUNK_STORE, "readwrite");
      const store = tx.objectStore(CHUNK_STORE);
      const request = store.put({ key, data, timestamp: Date.now() });

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  /**
   * Clean up cache (not implemented yet)
   */
  async prune(_options?: { maxSize?: number; maxAge?: number }): Promise<void> {
    // TODO: Implement LRU or time-based cache eviction
    console.log("IndexedDB cache pruning not yet implemented");
  }

  /**
   * Clear all cached data
   */
  async clear(): Promise<void> {
    const db = await this.getDb();
    await Promise.all([
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(META_STORE, "readwrite");
        const request = tx.objectStore(META_STORE).clear();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      }),
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(CHUNK_STORE, "readwrite");
        const request = tx.objectStore(CHUNK_STORE).clear();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      }),
    ]);
  }

  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    if (this.dbPromise) {
      const db = await this.dbPromise;
      db.close();
      this.dbPromise = null;
    }
  }

  /**
   * Delete the entire database
   */
  async deleteDatabase(): Promise<void> {
    await this.close();
    return new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(this.dbName);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }
}
