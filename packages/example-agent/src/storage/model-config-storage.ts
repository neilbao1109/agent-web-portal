/**
 * IndexedDB Storage for Multi-Model Configuration
 *
 * Two-level structure:
 * - Endpoint: URL + API Key
 * - Model: name, type, tags, context length, display name
 */

/**
 * Model type (API format)
 */
export type ModelType = "openai" | "anthropic";

/**
 * Model tags for categorization
 * Can be any string for custom tags
 */
export type ModelTag = string;

/**
 * Endpoint configuration
 */
export interface Endpoint {
  id: string;
  name: string;
  url: string;
  apiKey: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Model configuration
 */
export interface Model {
  id: string;
  endpointId: string;
  name: string; // Model name (e.g., "gpt-4o")
  displayName: string; // Display name (defaults to name, can be customized)
  type: ModelType;
  tags: ModelTag[];
  contextLength: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * Model with resolved endpoint info
 */
export interface ModelWithEndpoint extends Model {
  endpoint: Endpoint;
}

/**
 * Selected model configuration
 */
export interface SelectedModel {
  modelId: string;
  updatedAt: number;
}

const DB_NAME = "awp-agent-model-config";
const DB_VERSION = 1;
const ENDPOINTS_STORE = "endpoints";
const MODELS_STORE = "models";
const SELECTED_STORE = "selected";

export class ModelConfigStorage {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private getDb(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Endpoints store
        if (!db.objectStoreNames.contains(ENDPOINTS_STORE)) {
          db.createObjectStore(ENDPOINTS_STORE, { keyPath: "id" });
        }

        // Models store with index on endpointId
        if (!db.objectStoreNames.contains(MODELS_STORE)) {
          const modelsStore = db.createObjectStore(MODELS_STORE, { keyPath: "id" });
          modelsStore.createIndex("endpointId", "endpointId", { unique: false });
        }

        // Selected model store (single entry)
        if (!db.objectStoreNames.contains(SELECTED_STORE)) {
          db.createObjectStore(SELECTED_STORE, { keyPath: "id" });
        }
      };
    });

    return this.dbPromise;
  }

  // ============ Endpoint Operations ============

  async saveEndpoint(endpoint: Omit<Endpoint, "createdAt" | "updatedAt"> & { createdAt?: number }): Promise<Endpoint> {
    const db = await this.getDb();
    const now = Date.now();
    const fullEndpoint: Endpoint = {
      ...endpoint,
      createdAt: endpoint.createdAt ?? now,
      updatedAt: now,
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction(ENDPOINTS_STORE, "readwrite");
      const store = tx.objectStore(ENDPOINTS_STORE);
      const request = store.put(fullEndpoint);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(fullEndpoint);
    });
  }

  async getEndpoint(id: string): Promise<Endpoint | null> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(ENDPOINTS_STORE, "readonly");
      const store = tx.objectStore(ENDPOINTS_STORE);
      const request = store.get(id);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
  }

  async listEndpoints(): Promise<Endpoint[]> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(ENDPOINTS_STORE, "readonly");
      const store = tx.objectStore(ENDPOINTS_STORE);
      const request = store.getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async deleteEndpoint(id: string): Promise<void> {
    const db = await this.getDb();

    // First delete all models belonging to this endpoint
    const models = await this.listModelsByEndpoint(id);
    for (const model of models) {
      await this.deleteModel(model.id);
    }

    // Then delete the endpoint
    return new Promise((resolve, reject) => {
      const tx = db.transaction(ENDPOINTS_STORE, "readwrite");
      const store = tx.objectStore(ENDPOINTS_STORE);
      const request = store.delete(id);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  // ============ Model Operations ============

  async saveModel(model: Omit<Model, "createdAt" | "updatedAt"> & { createdAt?: number }): Promise<Model> {
    const db = await this.getDb();
    const now = Date.now();
    const fullModel: Model = {
      ...model,
      displayName: model.displayName || model.name,
      createdAt: model.createdAt ?? now,
      updatedAt: now,
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction(MODELS_STORE, "readwrite");
      const store = tx.objectStore(MODELS_STORE);
      const request = store.put(fullModel);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(fullModel);
    });
  }

  async getModel(id: string): Promise<Model | null> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(MODELS_STORE, "readonly");
      const store = tx.objectStore(MODELS_STORE);
      const request = store.get(id);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
  }

  async getModelWithEndpoint(id: string): Promise<ModelWithEndpoint | null> {
    const model = await this.getModel(id);
    if (!model) return null;

    const endpoint = await this.getEndpoint(model.endpointId);
    if (!endpoint) return null;

    return { ...model, endpoint };
  }

  async listModels(): Promise<Model[]> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(MODELS_STORE, "readonly");
      const store = tx.objectStore(MODELS_STORE);
      const request = store.getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async listModelsByEndpoint(endpointId: string): Promise<Model[]> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(MODELS_STORE, "readonly");
      const store = tx.objectStore(MODELS_STORE);
      const index = store.index("endpointId");
      const request = index.getAll(endpointId);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async listModelsWithEndpoints(): Promise<ModelWithEndpoint[]> {
    const models = await this.listModels();
    const endpoints = await this.listEndpoints();
    const endpointMap = new Map(endpoints.map((e) => [e.id, e]));

    return models
      .filter((m) => endpointMap.has(m.endpointId))
      .map((m) => ({
        ...m,
        endpoint: endpointMap.get(m.endpointId)!,
      }));
  }

  async deleteModel(id: string): Promise<void> {
    const db = await this.getDb();

    // Clear selection if this model was selected
    const selected = await this.getSelectedModelId();
    if (selected === id) {
      await this.clearSelectedModel();
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction(MODELS_STORE, "readwrite");
      const store = tx.objectStore(MODELS_STORE);
      const request = store.delete(id);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  // ============ Selected Model Operations ============

  async setSelectedModel(modelId: string): Promise<void> {
    const db = await this.getDb();
    const selected: SelectedModel & { id: string } = {
      id: "selected",
      modelId,
      updatedAt: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction(SELECTED_STORE, "readwrite");
      const store = tx.objectStore(SELECTED_STORE);
      const request = store.put(selected);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async getSelectedModelId(): Promise<string | null> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SELECTED_STORE, "readonly");
      const store = tx.objectStore(SELECTED_STORE);
      const request = store.get("selected");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result?.modelId || null);
    });
  }

  async getSelectedModel(): Promise<ModelWithEndpoint | null> {
    const modelId = await this.getSelectedModelId();
    if (!modelId) return null;
    return this.getModelWithEndpoint(modelId);
  }

  async clearSelectedModel(): Promise<void> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SELECTED_STORE, "readwrite");
      const store = tx.objectStore(SELECTED_STORE);
      const request = store.delete("selected");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }
}

// Singleton instance
export const modelConfigStorage = new ModelConfigStorage();
