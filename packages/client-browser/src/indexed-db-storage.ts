/**
 * IndexedDB Key Storage
 *
 * Persistent key storage using IndexedDB for browser environments.
 * Keys are stored securely in the browser's IndexedDB and survive page reloads.
 */

import type { AwpKeyPair, KeyStorage, StoredKeyData } from "@agent-web-portal/client";

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_DB_NAME = "awp-auth-keys";
const DEFAULT_DB_VERSION = 1;
const DEFAULT_STORE_NAME = "keypairs";

// ============================================================================
// Types
// ============================================================================

/**
 * Options for IndexedDB key storage
 */
export interface IndexedDBKeyStorageOptions {
  /** Database name (default: "awp-auth-keys") */
  dbName?: string;
  /** Store name (default: "keypairs") */
  storeName?: string;
}

/**
 * Internal storage format using JWK for CryptoKey serialization
 */
interface IndexedDBStoredData {
  endpoint: string;
  clientName: string;
  /** Private key as JWK */
  privateKeyJwk: JsonWebKey;
  /** Public key as JWK */
  publicKeyJwk: JsonWebKey;
  /** Public key in base64url format (x.y) */
  publicKeyB64: string;
  /** When authorization expires (Unix timestamp in ms) */
  expiresAt?: number;
  /** When the key was created (Unix timestamp in ms) */
  createdAt: number;
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * IndexedDB-based key storage
 *
 * Stores keys in browser IndexedDB with JWK format.
 * Suitable for web applications requiring persistent secure storage.
 *
 * @example
 * ```typescript
 * import { AwpAuth } from "@agent-web-portal/client";
 * import { IndexedDBKeyStorage } from "@agent-web-portal/client-browser";
 *
 * const auth = new AwpAuth({
 *   clientName: "My Web App",
 *   keyStorage: new IndexedDBKeyStorage(),
 * });
 * ```
 */
export class IndexedDBKeyStorage implements KeyStorage {
  private dbName: string;
  private storeName: string;

  constructor(options: IndexedDBKeyStorageOptions = {}) {
    this.dbName = options.dbName ?? DEFAULT_DB_NAME;
    this.storeName = options.storeName ?? DEFAULT_STORE_NAME;
  }

  /**
   * Open the IndexedDB database
   */
  private async openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, DEFAULT_DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: "endpoint" });
        }
      };
    });
  }

  /**
   * Convert stored JWK data back to AwpKeyPair format
   */
  private jwkToKeyPair(data: IndexedDBStoredData): AwpKeyPair {
    // The client expects base64url encoded keys
    // publicKey is already stored as base64url (x.y format)
    // privateKey needs the 'd' parameter from JWK
    return {
      publicKey: data.publicKeyB64,
      privateKey: data.privateKeyJwk.d as string,
      createdAt: data.createdAt,
    };
  }

  /**
   * Convert AwpKeyPair to JWK format for storage
   */
  private async keyPairToJwk(
    keyPair: AwpKeyPair
  ): Promise<{ privateKeyJwk: JsonWebKey; publicKeyJwk: JsonWebKey }> {
    // Parse the base64url public key (x.y format)
    const [x, y] = keyPair.publicKey.split(".");

    // Construct JWK for public key
    const publicKeyJwk: JsonWebKey = {
      kty: "EC",
      crv: "P-256",
      x,
      y,
    };

    // Construct JWK for private key (includes d parameter)
    const privateKeyJwk: JsonWebKey = {
      kty: "EC",
      crv: "P-256",
      x,
      y,
      d: keyPair.privateKey,
    };

    return { privateKeyJwk, publicKeyJwk };
  }

  async load(endpoint: string): Promise<StoredKeyData | null> {
    try {
      const db = await this.openDB();

      const data = await new Promise<IndexedDBStoredData | undefined>((resolve, reject) => {
        const tx = db.transaction(this.storeName, "readonly");
        const store = tx.objectStore(this.storeName);
        const request = store.get(endpoint);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        tx.oncomplete = () => db.close();
      });

      if (!data) {
        return null;
      }

      // Check if expired
      if (data.expiresAt && Date.now() > data.expiresAt) {
        await this.delete(endpoint);
        return null;
      }

      // Convert JWK back to AwpKeyPair
      const keyPair = this.jwkToKeyPair(data);

      return {
        keyPair,
        endpoint: data.endpoint,
        clientName: data.clientName,
        expiresAt: data.expiresAt,
      };
    } catch {
      return null;
    }
  }

  async save(endpoint: string, data: StoredKeyData): Promise<void> {
    const db = await this.openDB();

    // Convert to JWK format
    const { privateKeyJwk, publicKeyJwk } = await this.keyPairToJwk(data.keyPair);

    const storedData: IndexedDBStoredData = {
      endpoint,
      clientName: data.clientName,
      privateKeyJwk,
      publicKeyJwk,
      publicKeyB64: data.keyPair.publicKey,
      expiresAt: data.expiresAt,
      createdAt: data.keyPair.createdAt,
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, "readwrite");
      const store = tx.objectStore(this.storeName);
      const request = store.put(storedData);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
      tx.oncomplete = () => db.close();
    });
  }

  async delete(endpoint: string): Promise<void> {
    try {
      const db = await this.openDB();

      return new Promise((resolve, reject) => {
        const tx = db.transaction(this.storeName, "readwrite");
        const store = tx.objectStore(this.storeName);
        const request = store.delete(endpoint);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
        tx.oncomplete = () => db.close();
      });
    } catch {
      // Ignore errors on delete
    }
  }

  async list(): Promise<string[]> {
    try {
      const db = await this.openDB();

      return new Promise((resolve, reject) => {
        const tx = db.transaction(this.storeName, "readonly");
        const store = tx.objectStore(this.storeName);
        const request = store.getAllKeys();

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result as string[]);
        tx.oncomplete = () => db.close();
      });
    } catch {
      return [];
    }
  }
}
