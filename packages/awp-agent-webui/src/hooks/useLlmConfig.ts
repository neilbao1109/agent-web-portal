/**
 * useLlmConfig Hook
 *
 * Manages LLM configuration storage and state
 */

import { useCallback, useEffect, useState } from "react";
import { type LlmAdapter, OPENAI_ENDPOINT, OpenAIAdapter } from "../core/llm";
import { type LlmConfig, llmConfigStorage } from "../storage";

export interface UseLlmConfigResult {
  /** Current LLM configuration */
  config: LlmConfig | null;
  /** Loading state */
  isLoading: boolean;
  /** Whether config is valid and complete */
  isConfigured: boolean;
  /** LLM adapter instance */
  adapter: LlmAdapter | null;
  /** Save new configuration */
  saveConfig: (config: Omit<LlmConfig, "id" | "createdAt" | "updatedAt">) => Promise<void>;
  /** Clear configuration */
  clearConfig: () => Promise<void>;
  /** Reload configuration from storage */
  reload: () => Promise<void>;
}

export function useLlmConfig(): UseLlmConfigResult {
  const [config, setConfig] = useState<LlmConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [adapter, setAdapter] = useState<LlmAdapter | null>(null);

  const loadConfig = useCallback(async () => {
    setIsLoading(true);
    try {
      const loaded = await llmConfigStorage.loadDefault();
      setConfig(loaded);

      // Create and configure adapter if config exists
      if (loaded) {
        const newAdapter = createAdapter(loaded);
        setAdapter(newAdapter);
      } else {
        setAdapter(null);
      }
    } catch (error) {
      console.error("Failed to load LLM config:", error);
      setConfig(null);
      setAdapter(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const saveConfig = useCallback(
    async (newConfig: Omit<LlmConfig, "id" | "createdAt" | "updatedAt">) => {
      await llmConfigStorage.saveDefault(newConfig);
      await loadConfig();
    },
    [loadConfig]
  );

  const clearConfig = useCallback(async () => {
    await llmConfigStorage.delete("default");
    setConfig(null);
    setAdapter(null);
  }, []);

  const isConfigured = Boolean(config?.endpoint && config?.apiKey && config?.model);

  return {
    config,
    isLoading,
    isConfigured,
    adapter,
    saveConfig,
    clearConfig,
    reload: loadConfig,
  };
}

/**
 * Create an LLM adapter from config
 */
function createAdapter(config: LlmConfig): LlmAdapter {
  // Currently only OpenAI-compatible adapter
  const adapter = new OpenAIAdapter();

  // Determine endpoint
  let endpoint = config.endpoint;
  if (config.providerId === "openai" && !endpoint) {
    endpoint = OPENAI_ENDPOINT;
  }

  adapter.configure({
    endpoint,
    apiKey: config.apiKey,
    model: config.model,
  });

  return adapter;
}
