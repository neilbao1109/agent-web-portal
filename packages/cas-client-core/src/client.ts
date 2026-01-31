/**
 * CAS Client Core - Main Client Implementation
 *
 * Platform-agnostic CAS client using fetch API and AsyncIterable streams
 */

import { buildEndpoint, createBlobRef, parseEndpoint, resolvePathRaw } from "./blob-ref.ts";
import { computeKey } from "./hash.ts";
import { collectBytes, concatStreamFactories, needsChunking, splitIntoChunks } from "./stream.ts";
import type {
  ByteStream,
  CasAuth,
  CasBlobContext,
  CasBlobRef,
  CasClientConfig,
  CasConfigResponse,
  CasFileHandle,
  CasNode,
  CasRawCollectionNode,
  CasRawFileNode,
  CasRawNode,
  LocalStorageProvider,
  PathResolver,
} from "./types.ts";

/**
 * CAS Client for interacting with CAS storage
 *
 * Platform-agnostic implementation using:
 * - fetch API for HTTP
 * - Web Crypto API for hashing
 * - AsyncIterable<Uint8Array> for streaming
 */
export class CasClient {
  private endpoint: string;
  private auth: CasAuth;
  private storage?: LocalStorageProvider;
  private chunkThreshold: number;
  private realm?: string;

  constructor(config: CasClientConfig & { storage?: LocalStorageProvider; realm?: string }) {
    this.endpoint = config.endpoint.replace(/\/$/, "");
    this.auth = config.auth;
    this.storage = config.storage;
    this.chunkThreshold = config.chunkThreshold ?? 1048576; // Default 1MB
    this.realm = config.realm;
  }

  /**
   * Get the API base URL for CAS operations
   * 
   * For ticket auth: endpoint is already /api/cas/{realm}/ticket/{ticketId}, use directly
   * For user/agent auth: endpoint is /api, need to append /cas/{realm}
   */
  private getApiBase(): string {
    if (this.auth.type === "ticket") {
      // Ticket endpoint already contains /cas/{realm}/ticket/{ticketId}
      // CAS server will strip /ticket/{ticketId} and route correctly
      return this.endpoint;
    }
    
    // For user/agent auth, append /cas/{realm}
    const realm = this.realm ?? "@me";
    return `${this.endpoint}/cas/${realm}`;
  }

  /**
   * Get the API base URL (public accessor for BufferedCasClient)
   */
  getApiBaseUrl(): string {
    return this.getApiBase();
  }

  // ============================================================================
  // Static Factory Methods
  // ============================================================================

  static fromUserToken(endpoint: string, token: string, storage?: LocalStorageProvider): CasClient {
    return new CasClient({
      endpoint,
      auth: { type: "user", token },
      storage,
    });
  }

  static fromAgentToken(
    endpoint: string,
    token: string,
    storage?: LocalStorageProvider
  ): CasClient {
    return new CasClient({
      endpoint,
      auth: { type: "agent", token },
      storage,
    });
  }

  static fromTicket(endpoint: string, ticketId: string, storage?: LocalStorageProvider): CasClient {
    return new CasClient({
      endpoint,
      auth: { type: "ticket", id: ticketId },
      storage,
    });
  }

  static fromContext(context: CasBlobContext, storage?: LocalStorageProvider): CasClient {
    // Use the full ticket endpoint URL directly - CAS server supports ticket URL as endpoint base
    // The ticket URL format is: https://host/api/cas/{realm}/ticket/{ticketId}
    // The server will strip /ticket/{ticketId} and route to the appropriate handler
    return new CasClient({
      endpoint: context.endpoint,
      auth: { type: "ticket", id: context.ticket },
      storage,
      chunkThreshold: context.config.chunkThreshold,
      realm: context.realm,
    });
  }

  /**
   * Create a CasClient from a #cas-endpoint URL
   *
   * @param endpointUrl - Full endpoint URL: https://host/api/cas/{realm}/ticket/{ticketId}
   * @param storage - Optional local storage provider for caching
   */
  static fromEndpoint(endpointUrl: string, storage?: LocalStorageProvider): CasClient {
    const { baseUrl, realm, ticketId } = parseEndpoint(endpointUrl);
    return new CasClient({
      endpoint: baseUrl,
      auth: { type: "ticket", id: ticketId },
      storage,
      realm,
    });
  }

  // ============================================================================
  // Blob Reference Helpers
  // ============================================================================

  /**
   * Create a blob reference for a node
   */
  createBlobRef(casNode: string, path: string = ".", pathKey: string = "path"): CasBlobRef {
    if (this.auth.type !== "ticket") {
      throw new Error("Blob refs can only be created with ticket auth");
    }
    const realm = this.realm ?? "@me";
    const endpointUrl = buildEndpoint(this.endpoint, realm, this.auth.id);
    return createBlobRef(endpointUrl, casNode, path, pathKey);
  }

  /**
   * Resolve a path within a blob reference to get the target key
   */
  async resolveRef(ref: CasBlobRef, pathKey: string = "path"): Promise<string> {
    const path = ref[pathKey];
    if (!path) {
      throw new Error(`Path key "${pathKey}" not found in blob ref`);
    }
    return this.resolvePath(ref["cas-node"], path);
  }

  /**
   * Resolve a path within a node to get the target key
   */
  async resolvePath(rootKey: string, path: string): Promise<string> {
    return resolvePathRaw(rootKey, path, async (key) => {
      const node = await this.getRawNode(key);
      return node.kind === "collection" ? (node as CasRawCollectionNode) : null;
    });
  }

  // ============================================================================
  // Authentication
  // ============================================================================

  private getAuthHeader(): string {
    switch (this.auth.type) {
      case "user":
        return `Bearer ${this.auth.token}`;
      case "agent":
        return `Agent ${this.auth.token}`;
      case "ticket":
        return `Ticket ${this.auth.id}`;
      default:
        throw new Error(`Unknown auth type: ${(this.auth as { type: string }).type}`);
    }
  }

  // ============================================================================
  // Configuration
  // ============================================================================

  async getConfig(): Promise<CasConfigResponse> {
    const res = await fetch(`${this.endpoint}/cas/config`);
    if (!res.ok) {
      throw new Error(`Failed to get config: ${res.status}`);
    }
    return res.json() as Promise<CasConfigResponse>;
  }

  // ============================================================================
  // Read Operations
  // ============================================================================

  /**
   * Get application layer node (CasNode)
   */
  async getNode(key: string): Promise<CasNode> {
    const res = await fetch(`${this.getApiBase()}/node/${encodeURIComponent(key)}`, {
      headers: { Authorization: this.getAuthHeader() },
    });

    if (!res.ok) {
      throw new Error(`Failed to get node: ${res.status}`);
    }

    return res.json() as Promise<CasNode>;
  }

  /**
   * Get storage layer node (CasRawNode)
   */
  async getRawNode(key: string): Promise<CasRawNode> {
    // Check local cache first
    if (this.storage) {
      const cached = await this.storage.getMeta(key);
      if (cached) {
        return cached;
      }
    }

    const res = await fetch(`${this.getApiBase()}/raw/${encodeURIComponent(key)}`, {
      headers: { Authorization: this.getAuthHeader() },
    });

    if (!res.ok) {
      throw new Error(`Failed to get raw node: ${res.status}`);
    }

    const node = (await res.json()) as CasRawNode;

    // Cache the metadata
    if (this.storage) {
      await this.storage.putMeta(key, node);
    }

    return node;
  }

  /**
   * Open a file for streaming read
   */
  async openFile(key: string): Promise<CasFileHandle> {
    const rawNode = await this.getRawNode(key);

    if (rawNode.kind !== "file") {
      throw new Error(`Expected file node, got ${rawNode.kind}`);
    }

    return new CasFileHandleImpl(rawNode as CasRawFileNode, (chunkKey) =>
      this.getChunkStream(chunkKey)
    );
  }

  /**
   * Open a file by path within a collection
   */
  async openFileByPath(rootKey: string, path: string): Promise<CasFileHandle> {
    const targetKey = await this.resolvePath(rootKey, path);
    return this.openFile(targetKey);
  }

  /**
   * Get chunk data as an async iterable stream
   */
  async getChunkStream(key: string): Promise<ByteStream> {
    // Check local cache first
    if (this.storage) {
      const cached = await this.storage.getChunkStream(key);
      if (cached) {
        return cached;
      }
    }

    const res = await fetch(`${this.getApiBase()}/chunk/${encodeURIComponent(key)}`, {
      headers: { Authorization: this.getAuthHeader() },
    });

    if (!res.ok) {
      throw new Error(`Failed to get chunk: ${res.status}`);
    }

    const webStream = res.body;
    if (!webStream) {
      throw new Error("No response body");
    }

    // Convert Web ReadableStream to AsyncIterable
    const reader = webStream.getReader();

    async function* streamToAsyncIterable(): ByteStream {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          yield value;
        }
      } finally {
        reader.releaseLock();
      }
    }

    const stream = streamToAsyncIterable();

    // Cache while streaming if storage is available
    if (this.storage) {
      const chunks: Uint8Array[] = [];
      const storage = this.storage;

      async function* cacheWhileStreaming(): ByteStream {
        for await (const chunk of stream) {
          chunks.push(chunk);
          yield chunk;
        }
        // After streaming completes, save to cache
        const fullData = new Uint8Array(chunks.reduce((acc, c) => acc + c.length, 0));
        let offset = 0;
        for (const c of chunks) {
          fullData.set(c, offset);
          offset += c.length;
        }
        await storage.putChunk(key, fullData);
      }

      return cacheWhileStreaming();
    }

    return stream;
  }

  // ============================================================================
  // Write Operations
  // ============================================================================

  /**
   * Upload a file (handles chunking automatically)
   */
  async putFile(content: Uint8Array | ByteStream, contentType: string): Promise<string> {
    // Collect stream to bytes if needed
    const bytes = content instanceof Uint8Array ? content : await collectBytes(content);

    // Check if chunking is needed
    if (!needsChunking(bytes.length, this.chunkThreshold)) {
      // Small file: upload as single chunk, then create file node
      const chunkKey = await this.uploadChunk(bytes);
      return this.createFileNode([chunkKey], contentType, bytes.length);
    }

    // Large file: split into chunks and upload
    const chunks = splitIntoChunks(bytes, this.chunkThreshold);
    const chunkKeys: string[] = [];

    for (const chunk of chunks) {
      const key = await this.uploadChunk(chunk);
      chunkKeys.push(key);
    }

    return this.createFileNode(chunkKeys, contentType, bytes.length);
  }

  /**
   * Upload a single chunk
   */
  private async uploadChunk(content: Uint8Array): Promise<string> {
    const key = await computeKey(content);

    const res = await fetch(`${this.getApiBase()}/chunk/${encodeURIComponent(key)}`, {
      method: "PUT",
      headers: {
        Authorization: this.getAuthHeader(),
        "Content-Type": "application/octet-stream",
      },
      body: content as unknown as BodyInit,
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Failed to upload chunk: ${res.status} - ${error}`);
    }

    const result = (await res.json()) as { key: string };
    return result.key;
  }

  /**
   * Create a file node referencing uploaded chunks
   */
  private async createFileNode(
    chunks: string[],
    contentType: string,
    _totalSize: number
  ): Promise<string> {
    const res = await fetch(`${this.getApiBase()}/file`, {
      method: "PUT",
      headers: {
        Authorization: this.getAuthHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ chunks, contentType }),
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Failed to create file node: ${res.status} - ${error}`);
    }

    const result = (await res.json()) as { key: string };
    return result.key;
  }

  /**
   * Upload a collection using a path resolver callback
   */
  async putCollection(resolver: PathResolver): Promise<string> {
    const rootKey = await this.buildNode("/", resolver);
    if (!rootKey) {
      throw new Error("Root path resolution returned null");
    }
    return rootKey;
  }

  /**
   * Recursively build and upload nodes from path resolver
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

        return this.createCollectionNode(children);
      }
    }
  }

  /**
   * Create a collection node
   */
  private async createCollectionNode(children: Record<string, string>): Promise<string> {
    const res = await fetch(`${this.getApiBase()}/collection`, {
      method: "PUT",
      headers: {
        Authorization: this.getAuthHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ children }),
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Failed to create collection node: ${res.status} - ${error}`);
    }

    const result = (await res.json()) as { key: string };
    return result.key;
  }
}

/**
 * File handle implementation using platform-agnostic streams
 */
class CasFileHandleImpl implements CasFileHandle {
  constructor(
    private node: CasRawFileNode,
    private getChunkStreamFn: (key: string) => Promise<ByteStream>
  ) {}

  get key(): string {
    return this.node.key;
  }

  get size(): number {
    return this.node.size;
  }

  get contentType(): string {
    return this.node.contentType;
  }

  async stream(): Promise<ByteStream> {
    const { chunks } = this.node;

    if (chunks.length === 0) {
      return (async function* () {})();
    }

    if (chunks.length === 1) {
      return this.getChunkStreamFn(chunks[0]!);
    }

    // Multiple chunks: concatenate streams lazily
    const getChunk = this.getChunkStreamFn;
    return concatStreamFactories(chunks.map((key) => () => getChunk(key)));
  }

  async bytes(): Promise<Uint8Array> {
    const stream = await this.stream();
    return collectBytes(stream);
  }

  async slice(start: number, end: number): Promise<ByteStream> {
    // Simple implementation: read all and slice
    // TODO: Optimize by tracking chunk offsets
    const full = await this.bytes();
    const sliced = full.slice(start, end);
    return (async function* () {
      yield sliced;
    })();
  }
}
