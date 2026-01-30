/**
 * IndexedDB Cache for Skill SKILL.md Content
 */

export interface CachedSkill {
  /** Composite key: `${endpointHash}:${skillName}` */
  id: string;
  endpointHash: string;
  skillName: string;
  /** Raw SKILL.md content */
  content: string;
  /** Parsed frontmatter */
  frontmatter: Record<string, unknown>;
  /** Timestamp when cached */
  cachedAt: number;
  /** TTL in milliseconds (default 1 hour) */
  ttl: number;
}

const DB_NAME = "awp-agent-skill-cache";
const STORE_NAME = "skills";
const DB_VERSION = 1;
const DEFAULT_TTL = 60 * 60 * 1000; // 1 hour

export class SkillCache {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private getDb(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
          store.createIndex("endpointHash", "endpointHash", { unique: false });
          store.createIndex("skillName", "skillName", { unique: false });
        }
      };
    });

    return this.dbPromise;
  }

  private makeId(endpointHash: string, skillName: string): string {
    return `${endpointHash}:${skillName}`;
  }

  async get(endpointHash: string, skillName: string): Promise<CachedSkill | null> {
    const db = await this.getDb();
    const id = this.makeId(endpointHash, skillName);

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const result = request.result as CachedSkill | undefined;
        if (!result) {
          resolve(null);
          return;
        }

        // Check TTL
        const isExpired = Date.now() > result.cachedAt + result.ttl;
        if (isExpired) {
          // Delete expired entry
          this.delete(endpointHash, skillName).catch(console.error);
          resolve(null);
          return;
        }

        resolve(result);
      };
    });
  }

  async set(
    endpointHash: string,
    skillName: string,
    content: string,
    frontmatter: Record<string, unknown>,
    ttl: number = DEFAULT_TTL
  ): Promise<void> {
    const db = await this.getDb();
    const id = this.makeId(endpointHash, skillName);

    const cached: CachedSkill = {
      id,
      endpointHash,
      skillName,
      content,
      frontmatter,
      cachedAt: Date.now(),
      ttl,
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(cached);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async delete(endpointHash: string, skillName: string): Promise<void> {
    const db = await this.getDb();
    const id = this.makeId(endpointHash, skillName);

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(id);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async listByEndpoint(endpointHash: string): Promise<CachedSkill[]> {
    const db = await this.getDb();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const index = store.index("endpointHash");
      const request = index.getAll(endpointHash);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const results = request.result as CachedSkill[];
        // Filter out expired entries
        const now = Date.now();
        const valid = results.filter((r) => now <= r.cachedAt + r.ttl);
        resolve(valid);
      };
    });
  }

  async clear(): Promise<void> {
    const db = await this.getDb();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.clear();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }
}

// Singleton instance
export const skillCache = new SkillCache();
