/**
 * LLM Adapter Interface
 *
 * Abstracts different LLM providers (OpenAI, Anthropic, etc.)
 * into a common interface for the agent.
 */

import type { ChatOptions, LlmMessage, LlmResponse, LlmToolSchema, StreamChunk } from "./types";

/**
 * LLM Adapter Configuration
 */
export interface LlmAdapterConfig {
  /** API endpoint URL */
  endpoint: string;
  /** API key */
  apiKey: string;
  /** Model identifier */
  model: string;
}

/**
 * LLM Adapter Interface
 *
 * Implementations should handle:
 * - Tool schema transformation to provider format
 * - Message format conversion
 * - Streaming response parsing
 */
export interface LlmAdapter {
  /** Provider identifier (e.g., 'openai', 'anthropic') */
  readonly providerId: string;

  /**
   * Configure the adapter with API credentials
   */
  configure(config: LlmAdapterConfig): void;

  /**
   * Check if the adapter is configured
   */
  isConfigured(): boolean;

  /**
   * Send a chat request (non-streaming)
   * @param messages - Conversation messages
   * @param tools - Available tools
   * @param options - Chat options
   * @returns LLM response
   */
  chat(
    messages: LlmMessage[],
    tools?: LlmToolSchema[],
    options?: ChatOptions
  ): Promise<LlmResponse>;

  /**
   * Send a chat request with streaming
   * @param messages - Conversation messages
   * @param tools - Available tools
   * @param options - Chat options
   * @returns Async iterator of stream chunks
   */
  chatStream(
    messages: LlmMessage[],
    tools?: LlmToolSchema[],
    options?: ChatOptions
  ): AsyncIterable<StreamChunk>;
}

/**
 * Base adapter with common functionality
 */
export abstract class BaseLlmAdapter implements LlmAdapter {
  abstract readonly providerId: string;

  protected config: LlmAdapterConfig | null = null;

  configure(config: LlmAdapterConfig): void {
    this.config = config;
  }

  isConfigured(): boolean {
    return this.config !== null;
  }

  protected getConfig(): LlmAdapterConfig {
    if (!this.config) {
      throw new Error(`${this.providerId} adapter not configured. Call configure() first.`);
    }
    return this.config;
  }

  abstract chat(
    messages: LlmMessage[],
    tools?: LlmToolSchema[],
    options?: ChatOptions
  ): Promise<LlmResponse>;

  abstract chatStream(
    messages: LlmMessage[],
    tools?: LlmToolSchema[],
    options?: ChatOptions
  ): AsyncIterable<StreamChunk>;
}
