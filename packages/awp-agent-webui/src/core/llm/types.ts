/**
 * LLM Types
 *
 * Common types for LLM adapters
 */

/**
 * Message roles
 */
export type LlmMessageRole = "system" | "user" | "assistant" | "tool";

/**
 * Tool call from LLM response
 */
export interface LlmToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * Tool result to send back to LLM
 */
export interface LlmToolResult {
  toolCallId: string;
  content: string;
  isError?: boolean;
}

/**
 * Base message structure
 */
export interface LlmMessage {
  role: LlmMessageRole;
  content: string;
  /** For assistant messages that have tool calls */
  toolCalls?: LlmToolCall[];
  /** For tool result messages */
  toolResult?: LlmToolResult;
}

/**
 * Tool schema in provider-agnostic format
 * Uses JSON Schema for input validation
 */
export interface LlmToolSchema {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

/**
 * Streaming chunk types
 */
export type StreamChunkType =
  | "text"
  | "tool_call_start"
  | "tool_call_delta"
  | "tool_call_end"
  | "done"
  | "error";

/**
 * Streaming chunk
 */
export interface StreamChunk {
  type: StreamChunkType;
  /** Text content for 'text' chunks */
  text?: string;
  /** Tool call info for tool_call_* chunks */
  toolCall?: {
    id: string;
    name?: string;
    argumentsDelta?: string;
  };
  /** Error message for 'error' chunks */
  error?: string;
}

/**
 * Non-streaming response
 */
export interface LlmResponse {
  content: string;
  toolCalls?: LlmToolCall[];
  finishReason: "stop" | "tool_calls" | "length" | "error";
}

/**
 * Chat options
 */
export interface ChatOptions {
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Temperature (0-2) */
  temperature?: number;
  /** Stop sequences */
  stop?: string[];
}
