/**
 * AWP Server Core - Buffered CAS Client
 *
 * A CAS client wrapper that buffers write operations in memory
 * and commits them all at once when the tool execution completes.
 */

import {
  type ByteStream,
  type CasBlobContext,
  CasClient,
  type CasFileHandle,
  type CasNode,
  type CasRawChunkNode,
  type CasRawCollectionNode,
  type CasRawFileNode,
  type CasRawNode,
  collectBytes,
  computeKey,
  type LocalStorageProvider,
  needsChunking,
  type PathResolver,
  splitIntoChunks,
} from "@agent-web-portal/cas-client-core";

import type { IBufferedCasClient } from "./types.ts";
import { CommitError } from "./types.ts";

/**
 * Pending chunk write
 */
interface PendingChunk {
  key: string;
  data: Uint8Array;
}

/**
 * Pending file node write
 */
interface PendingFile {
  key: string;
  chunks: string[];
  contentType: string;
  size: number;
}

/**
 * Pending collection node write
 */
interface PendingCollection {
  key: string;
  children: Record<string, string>;
}

/**
 * BufferedCasClient - wraps CasClient with buffered writes
 *
 * All read operations are passed through to the underlying CasClient.
 * All write operations are buffered in memory until commit() is called.
 */
export class BufferedCasClient implements IBufferedCasClient {
  private client: CasClient;
  private chunkThreshold: number;

  // Buffered writes
  private pendingChunks: Map<string, PendingChunk> = new Map();
  private pendingFiles: Map<string, PendingFile> = new Map();
  private pendingCollections: Map<string, PendingCollection> = new Map();

  // Track all pending node keys for quick lookup
  private allPendingKeys: Set<string> = new Set();

  // Root key of the last write operation (for single-root commit)
  private rootKey: string | null = null;

  constructor(context: CasBlobContext, storage?: LocalStorageProvider) {
    this.client = CasClient.fromContext(context, storage);
    this.chunkThreshold = context.config.chunkThreshold;
    
    // Log the parsed client configuration for debugging
    const clientEndpoint = (this.client as unknown as { endpoint: string }).endpoint;
    const clientRealm = (this.client as unknown as { realm?: string }).realm;
    console.log("[BufferedCasClient] Created with:", {
      parsedEndpoint: clientEndpoint,
      parsedRealm: clientRealm,
      originalContextEndpoint: context.endpoint,
      originalContextRealm: context.realm,
    });
  }

  // ============================================================================
  // Read Operations (passthrough)
  // ============================================================================

  async openFile(key: string): Promise<CasFileHandle> {
    // Check if this is a pending file
    const pendingFile = this.pendingFiles.get(key);
    if (pendingFile) {
      return this.createPendingFileHandle(pendingFile);
    }
    return this.client.openFile(key);
  }

  async getNode(key: string): Promise<CasNode> {
    // Check pending nodes first
    const pendingFile = this.pendingFiles.get(key);
    if (pendingFile) {
      return {
        kind: "file",
        key: pendingFile.key,
        size: pendingFile.size,
        contentType: pendingFile.contentType,
      };
    }

    const pendingCollection = this.pendingCollections.get(key);
    if (pendingCollection) {
      // Recursively expand children
      const children: Record<string, CasNode> = {};
      for (const [name, childKey] of Object.entries(pendingCollection.children)) {
        children[name] = await this.getNode(childKey);
      }
      return {
        kind: "collection",
        key: pendingCollection.key,
        size: Object.values(children).reduce((acc, child) => acc + child.size, 0),
        children,
      };
    }

    return this.client.getNode(key);
  }

  async getRawNode(key: string): Promise<CasRawNode> {
    // Check pending nodes first
    const pendingChunk = this.pendingChunks.get(key);
    if (pendingChunk) {
      return {
        kind: "chunk",
        key: pendingChunk.key,
        size: pendingChunk.data.length,
      } as CasRawChunkNode;
    }

    const pendingFile = this.pendingFiles.get(key);
    if (pendingFile) {
      return {
        kind: "file",
        key: pendingFile.key,
        size: pendingFile.size,
        contentType: pendingFile.contentType,
        chunks: pendingFile.chunks,
        chunkSizes: pendingFile.chunks.map((chunkKey) => {
          const chunk = this.pendingChunks.get(chunkKey);
          return chunk?.data.length ?? 0;
        }),
      } as CasRawFileNode;
    }

    const pendingCollection = this.pendingCollections.get(key);
    if (pendingCollection) {
      return {
        kind: "collection",
        key: pendingCollection.key,
        size: 0, // Will be computed on commit
        children: pendingCollection.children,
      } as CasRawCollectionNode;
    }

    return this.client.getRawNode(key);
  }

  // ============================================================================
  // Buffered Write Operations
  // ============================================================================

  /**
   * Buffer a file for later commit
   *
   * @param content - File content as Uint8Array or ByteStream
   * @param contentType - MIME type of the content
   * @returns The computed CAS key (file is not actually uploaded yet)
   */
  async putFile(content: Uint8Array | ByteStream, contentType: string): Promise<string> {
    // Collect stream to bytes if needed
    const bytes = content instanceof Uint8Array ? content : await collectBytes(content);

    // Check if chunking is needed
    if (!needsChunking(bytes.length, this.chunkThreshold)) {
      // Small file: single chunk
      const chunkKey = await computeKey(bytes);
      this.pendingChunks.set(chunkKey, { key: chunkKey, data: bytes });
      this.allPendingKeys.add(chunkKey);

      // Create file node referencing the chunk
      const fileKey = await this.computeFileKey([chunkKey], contentType, bytes.length);
      this.pendingFiles.set(fileKey, {
        key: fileKey,
        chunks: [chunkKey],
        contentType,
        size: bytes.length,
      });
      this.allPendingKeys.add(fileKey);
      this.rootKey = fileKey;

      return fileKey;
    }

    // Large file: split into chunks
    const chunkDataList = splitIntoChunks(bytes, this.chunkThreshold);
    const chunkKeys: string[] = [];

    for (const chunkData of chunkDataList) {
      const chunkKey = await computeKey(chunkData);
      this.pendingChunks.set(chunkKey, { key: chunkKey, data: chunkData });
      this.allPendingKeys.add(chunkKey);
      chunkKeys.push(chunkKey);
    }

    // Create file node referencing all chunks
    const fileKey = await this.computeFileKey(chunkKeys, contentType, bytes.length);
    this.pendingFiles.set(fileKey, {
      key: fileKey,
      chunks: chunkKeys,
      contentType,
      size: bytes.length,
    });
    this.allPendingKeys.add(fileKey);
    this.rootKey = fileKey;

    return fileKey;
  }

  /**
   * Buffer a collection for later commit
   *
   * @param resolver - Path resolver function
   * @returns The computed CAS key (collection is not actually uploaded yet)
   */
  async putCollection(resolver: PathResolver): Promise<string> {
    const rootKey = await this.buildNode("/", resolver);
    if (!rootKey) {
      throw new Error("Root path resolution returned null");
    }
    this.rootKey = rootKey;
    return rootKey;
  }

  /**
   * Recursively build and buffer nodes from path resolver
   */
  private async buildNode(path: string, resolver: PathResolver): Promise<string | null> {
    const resolution = await resolver(path);
    if (!resolution) {
      return null;
    }

    switch (resolution.type) {
      case "file": {
        let content: Uint8Array;
        if (resolution.content instanceof Uint8Array) {
          content = resolution.content;
        } else if (typeof resolution.content === "function") {
          const stream = await resolution.content();
          content = await collectBytes(stream);
        } else {
          content = await collectBytes(resolution.content);
        }
        return this.putFile(content, resolution.contentType);
      }

      case "link": {
        // Link to existing key - no buffering needed
        return resolution.target;
      }

      case "collection": {
        const children: Record<string, string> = {};

        for (const name of resolution.children) {
          const childPath = path === "/" ? `/${name}` : `${path}/${name}`;
          const childKey = await this.buildNode(childPath, resolver);
          if (childKey) {
            children[name] = childKey;
          }
        }

        return this.bufferCollection(children);
      }
    }
  }

  /**
   * Buffer a collection node
   */
  private async bufferCollection(children: Record<string, string>): Promise<string> {
    const collectionKey = await this.computeCollectionKey(children);
    this.pendingCollections.set(collectionKey, {
      key: collectionKey,
      children,
    });
    this.allPendingKeys.add(collectionKey);
    return collectionKey;
  }

  // ============================================================================
  // Commit / Discard
  // ============================================================================

  /**
   * Commit all buffered writes to CAS
   *
   * Uploads in order: chunks → files → collections
   * Returns the keys of all committed nodes
   */
  async commit(): Promise<string[]> {
    if (!this.hasPendingWrites()) {
      return [];
    }

    const committedKeys: string[] = [];

    try {
      // 1. Upload all chunks in parallel
      const chunkUploads = Array.from(this.pendingChunks.values()).map(async (chunk) => {
        await this.uploadChunk(chunk.key, chunk.data);
        committedKeys.push(chunk.key);
      });
      await Promise.all(chunkUploads);

      // 2. Upload all file nodes (can be parallel as they only depend on chunks)
      const fileUploads = Array.from(this.pendingFiles.values()).map(async (file) => {
        await this.uploadFileNode(file);
        committedKeys.push(file.key);
      });
      await Promise.all(fileUploads);

      // 3. Upload collections in dependency order (bottom-up)
      // For simplicity, we upload all collections at once since they only reference other nodes
      const collectionUploads = Array.from(this.pendingCollections.values()).map(
        async (collection) => {
          await this.uploadCollectionNode(collection);
          committedKeys.push(collection.key);
        }
      );
      await Promise.all(collectionUploads);

      // Clear pending writes on success
      this.discard();

      return committedKeys;
    } catch (error) {
      throw new CommitError(error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Discard all buffered writes without committing
   */
  discard(): void {
    this.pendingChunks.clear();
    this.pendingFiles.clear();
    this.pendingCollections.clear();
    this.allPendingKeys.clear();
    this.rootKey = null;
  }

  // ============================================================================
  // Status
  // ============================================================================

  hasPendingWrites(): boolean {
    return this.allPendingKeys.size > 0;
  }

  getPendingKeys(): string[] {
    return Array.from(this.allPendingKeys);
  }

  getRootKey(): string | null {
    return this.rootKey;
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /**
   * Compute file node key (deterministic based on chunks and metadata)
   * Must match CAS server's file node format exactly
   */
  private async computeFileKey(
    chunks: string[],
    contentType: string,
    size: number
  ): Promise<string> {
    // Must match CAS server format: { kind: "file", chunks, contentType, size }
    const metadata = JSON.stringify({ kind: "file", chunks, contentType, size });
    const encoder = new TextEncoder();
    return computeKey(encoder.encode(metadata));
  }

  /**
   * Compute collection node key (deterministic based on children)
   * 
   * NOTE: This does NOT match CAS server format exactly (server includes size).
   * The key returned here is used locally, and the actual key is returned by the server.
   * For collections, we rely on the server's returned key after upload.
   */
  private async computeCollectionKey(children: Record<string, string>): Promise<string> {
    // Use sorted entries for deterministic key
    const sorted = Object.entries(children).sort(([a], [b]) => a.localeCompare(b));
    const metadata = JSON.stringify(sorted);
    const encoder = new TextEncoder();
    return computeKey(encoder.encode(metadata));
  }

  /**
   * Create a file handle for a pending file
   */
  private createPendingFileHandle(file: PendingFile): CasFileHandle {
    const self = this;

    return {
      get key() {
        return file.key;
      },
      get size() {
        return file.size;
      },
      get contentType() {
        return file.contentType;
      },

      async stream(): Promise<ByteStream> {
        // Concatenate all chunk data
        const chunks: Uint8Array[] = [];
        for (const chunkKey of file.chunks) {
          const pending = self.pendingChunks.get(chunkKey);
          if (pending) {
            chunks.push(pending.data);
          }
        }

        return (async function* () {
          for (const chunk of chunks) {
            yield chunk;
          }
        })();
      },

      async bytes(): Promise<Uint8Array> {
        const chunks: Uint8Array[] = [];
        for (const chunkKey of file.chunks) {
          const pending = self.pendingChunks.get(chunkKey);
          if (pending) {
            chunks.push(pending.data);
          }
        }

        if (chunks.length === 1) {
          return chunks[0]!;
        }

        const totalSize = chunks.reduce((acc, c) => acc + c.length, 0);
        const result = new Uint8Array(totalSize);
        let offset = 0;
        for (const chunk of chunks) {
          result.set(chunk, offset);
          offset += chunk.length;
        }
        return result;
      },

      async slice(start: number, end: number): Promise<ByteStream> {
        const full = await this.bytes();
        const sliced = full.slice(start, end);
        return (async function* () {
          yield sliced;
        })();
      },
    };
  }

  /**
   * Upload a chunk to CAS
   */
  private async uploadChunk(key: string, data: Uint8Array): Promise<void> {
    const apiBase = this.client.getApiBaseUrl();

    // Create a new ArrayBuffer copy to satisfy Blob type requirements
    const arrayBuffer = new ArrayBuffer(data.length);
    new Uint8Array(arrayBuffer).set(data);
    const res = await fetch(`${apiBase}/chunk/${encodeURIComponent(key)}`, {
      method: "PUT",
      headers: {
        Authorization: this.getAuthHeader(),
        "Content-Type": "application/octet-stream",
      },
      body: new Blob([arrayBuffer]),
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Failed to upload chunk ${key}: ${res.status} - ${error}`);
    }
  }

  /**
   * Upload a file node to CAS
   */
  private async uploadFileNode(file: PendingFile): Promise<void> {
    const apiBase = this.client.getApiBaseUrl();

    const res = await fetch(`${apiBase}/file`, {
      method: "PUT",
      headers: {
        Authorization: this.getAuthHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chunks: file.chunks,
        contentType: file.contentType,
      }),
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Failed to upload file node: ${res.status} - ${error}`);
    }
  }

  /**
   * Upload a collection node to CAS
   */
  private async uploadCollectionNode(collection: PendingCollection): Promise<void> {
    const apiBase = this.client.getApiBaseUrl();

    const res = await fetch(`${apiBase}/collection`, {
      method: "PUT",
      headers: {
        Authorization: this.getAuthHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        children: collection.children,
      }),
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Failed to upload collection node: ${res.status} - ${error}`);
    }
  }

  /**
   * Get authorization header
   */
  private getAuthHeader(): string {
    const auth = (this.client as unknown as { auth: { type: string; id?: string; token?: string } })
      .auth;
    switch (auth.type) {
      case "user":
        return `Bearer ${auth.token}`;
      case "agent":
        return `Agent ${auth.token}`;
      case "ticket":
        return `Ticket ${auth.id}`;
      default:
        throw new Error(`Unknown auth type: ${auth.type}`);
    }
  }
}
