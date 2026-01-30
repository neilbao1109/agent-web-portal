/**
 * useModelConfig Hook
 *
 * Manages multi-model configuration with endpoint -> model hierarchy
 */

import { useCallback, useEffect, useState } from "react";
import { type LlmAdapter, OpenAIAdapter } from "../core/llm";
import { type Endpoint, type Model, type ModelWithEndpoint, modelConfigStorage } from "../storage";

export interface UseModelConfigResult {
  // Endpoints
  endpoints: Endpoint[];
  // Models (with resolved endpoints)
  models: ModelWithEndpoint[];
  // Currently selected model
  selectedModel: ModelWithEndpoint | null;
  // LLM adapter instance (configured for selected model)
  adapter: LlmAdapter | null;
  // Loading state
  isLoading: boolean;
  // Whether a model is configured and selected
  isConfigured: boolean;

  // Endpoint operations
  addEndpoint: (endpoint: Omit<Endpoint, "id" | "createdAt" | "updatedAt">) => Promise<Endpoint>;
  updateEndpoint: (endpoint: Endpoint) => Promise<Endpoint>;
  deleteEndpoint: (id: string) => Promise<void>;

  // Model operations
  addModel: (model: Omit<Model, "id" | "createdAt" | "updatedAt">) => Promise<Model>;
  updateModel: (model: Model) => Promise<Model>;
  deleteModel: (id: string) => Promise<void>;

  // Selection
  selectModel: (modelId: string) => Promise<void>;
  clearSelection: () => Promise<void>;

  // Refresh
  reload: () => Promise<void>;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function useModelConfig(): UseModelConfigResult {
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [models, setModels] = useState<ModelWithEndpoint[]>([]);
  const [selectedModel, setSelectedModel] = useState<ModelWithEndpoint | null>(null);
  const [adapter, setAdapter] = useState<LlmAdapter | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [loadedEndpoints, loadedModels, selected] = await Promise.all([
        modelConfigStorage.listEndpoints(),
        modelConfigStorage.listModelsWithEndpoints(),
        modelConfigStorage.getSelectedModel(),
      ]);

      setEndpoints(loadedEndpoints);
      setModels(loadedModels);
      setSelectedModel(selected);

      // Create adapter for selected model
      if (selected) {
        const newAdapter = createAdapter(selected);
        setAdapter(newAdapter);
      } else {
        setAdapter(null);
      }
    } catch (error) {
      console.error("Failed to load model config:", error);
      setEndpoints([]);
      setModels([]);
      setSelectedModel(null);
      setAdapter(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Endpoint operations
  const addEndpoint = useCallback(
    async (endpoint: Omit<Endpoint, "id" | "createdAt" | "updatedAt">) => {
      const saved = await modelConfigStorage.saveEndpoint({
        ...endpoint,
        id: generateId(),
      });
      await loadData();
      return saved;
    },
    [loadData]
  );

  const updateEndpoint = useCallback(
    async (endpoint: Endpoint) => {
      const saved = await modelConfigStorage.saveEndpoint(endpoint);
      await loadData();
      return saved;
    },
    [loadData]
  );

  const deleteEndpoint = useCallback(
    async (id: string) => {
      await modelConfigStorage.deleteEndpoint(id);
      await loadData();
    },
    [loadData]
  );

  // Model operations
  const addModel = useCallback(
    async (model: Omit<Model, "id" | "createdAt" | "updatedAt">) => {
      const newId = generateId();
      const saved = await modelConfigStorage.saveModel({
        ...model,
        id: newId,
      });
      // Auto-select the newly added model
      await modelConfigStorage.setSelectedModel(newId);
      await loadData();
      return saved;
    },
    [loadData]
  );

  const updateModel = useCallback(
    async (model: Model) => {
      const saved = await modelConfigStorage.saveModel(model);
      await loadData();
      return saved;
    },
    [loadData]
  );

  const deleteModel = useCallback(
    async (id: string) => {
      await modelConfigStorage.deleteModel(id);
      await loadData();
    },
    [loadData]
  );

  // Selection
  const selectModel = useCallback(
    async (modelId: string) => {
      await modelConfigStorage.setSelectedModel(modelId);
      await loadData();
    },
    [loadData]
  );

  const clearSelection = useCallback(async () => {
    await modelConfigStorage.clearSelectedModel();
    setSelectedModel(null);
    setAdapter(null);
  }, []);

  const isConfigured = selectedModel !== null;

  return {
    endpoints,
    models,
    selectedModel,
    adapter,
    isLoading,
    isConfigured,
    addEndpoint,
    updateEndpoint,
    deleteEndpoint,
    addModel,
    updateModel,
    deleteModel,
    selectModel,
    clearSelection,
    reload: loadData,
  };
}

/**
 * Create an LLM adapter from model config
 */
function createAdapter(model: ModelWithEndpoint): LlmAdapter {
  // Currently only OpenAI-compatible adapter
  // TODO: Add Anthropic adapter support
  const adapter = new OpenAIAdapter();

  adapter.configure({
    endpoint: model.endpoint.url,
    apiKey: model.endpoint.apiKey,
    model: model.name,
  });

  return adapter;
}
