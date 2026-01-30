/**
 * OpenAI-Compatible LLM Adapter
 *
 * Supports OpenAI API and compatible providers (Azure OpenAI, OpenRouter, etc.)
 * Implements streaming via Server-Sent Events (SSE)
 */

import { BaseLlmAdapter } from "./adapter";
import type {
  ChatOptions,
  LlmMessage,
  LlmResponse,
  LlmToolCall,
  LlmToolSchema,
  StreamChunk,
} from "./types";

/**
 * OpenAI message format
 */
interface OpenAIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
}

/**
 * OpenAI tool call format
 */
interface OpenAIToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * OpenAI tool definition format
 */
interface OpenAITool {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  };
}

/**
 * OpenAI chat completion response
 */
interface OpenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: "assistant";
      content: string | null;
      tool_calls?: OpenAIToolCall[];
    };
    finish_reason: "stop" | "tool_calls" | "length" | "content_filter";
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * OpenAI streaming chunk
 */
interface OpenAIStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: "assistant";
      content?: string | null;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: "function";
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason: "stop" | "tool_calls" | "length" | "content_filter" | null;
  }>;
}

/**
 * OpenAI-compatible LLM Adapter
 */
export class OpenAIAdapter extends BaseLlmAdapter {
  readonly providerId = "openai";

  /**
   * Transform internal message format to OpenAI format
   */
  private transformMessages(messages: LlmMessage[]): OpenAIMessage[] {
    return messages.map((msg) => {
      if (msg.role === "tool" && msg.toolResult) {
        return {
          role: "tool" as const,
          content: msg.toolResult.content,
          tool_call_id: msg.toolResult.toolCallId,
        };
      }

      if (msg.role === "assistant" && msg.toolCalls?.length) {
        return {
          role: "assistant" as const,
          content: msg.content || null,
          tool_calls: msg.toolCalls.map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.arguments),
            },
          })),
        };
      }

      return {
        role: msg.role as "system" | "user" | "assistant",
        content: msg.content,
      };
    });
  }

  /**
   * Transform internal tool schema to OpenAI format
   */
  private transformTools(tools: LlmToolSchema[]): OpenAITool[] {
    return tools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    }));
  }

  /**
   * Parse OpenAI tool calls to internal format
   */
  private parseToolCalls(toolCalls: OpenAIToolCall[]): LlmToolCall[] {
    return toolCalls.map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: JSON.parse(tc.function.arguments),
    }));
  }

  /**
   * Non-streaming chat request
   */
  async chat(
    messages: LlmMessage[],
    tools?: LlmToolSchema[],
    options?: ChatOptions
  ): Promise<LlmResponse> {
    const config = this.getConfig();

    const body: Record<string, unknown> = {
      model: config.model,
      messages: this.transformMessages(messages),
    };

    if (tools?.length) {
      body.tools = this.transformTools(tools);
    }

    if (options?.maxTokens) {
      body.max_tokens = options.maxTokens;
    }

    if (options?.temperature !== undefined) {
      body.temperature = options.temperature;
    }

    if (options?.stop) {
      body.stop = options.stop;
    }

    const response = await fetch(config.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as OpenAIResponse;
    const choice = data.choices[0];

    return {
      content: choice.message.content ?? "",
      toolCalls: choice.message.tool_calls
        ? this.parseToolCalls(choice.message.tool_calls)
        : undefined,
      finishReason: choice.finish_reason === "tool_calls" ? "tool_calls" : "stop",
    };
  }

  /**
   * Streaming chat request
   */
  async *chatStream(
    messages: LlmMessage[],
    tools?: LlmToolSchema[],
    options?: ChatOptions
  ): AsyncIterable<StreamChunk> {
    const config = this.getConfig();

    const body: Record<string, unknown> = {
      model: config.model,
      messages: this.transformMessages(messages),
      stream: true,
    };

    if (tools?.length) {
      body.tools = this.transformTools(tools);
    }

    if (options?.maxTokens) {
      body.max_tokens = options.maxTokens;
    }

    if (options?.temperature !== undefined) {
      body.temperature = options.temperature;
    }

    if (options?.stop) {
      body.stop = options.stop;
    }

    const response = await fetch(config.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      yield { type: "error", error: `OpenAI API error: ${response.status} ${errorText}` };
      return;
    }

    if (!response.body) {
      yield { type: "error", error: "No response body" };
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    // Track tool calls being built
    const toolCallBuilders = new Map<number, { id: string; name: string; arguments: string }>();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === "data: [DONE]") continue;

          if (trimmed.startsWith("data: ")) {
            const jsonStr = trimmed.slice(6);
            try {
              const chunk = JSON.parse(jsonStr) as OpenAIStreamChunk;
              const delta = chunk.choices[0]?.delta;

              if (!delta) continue;

              // Handle text content
              if (delta.content) {
                yield { type: "text", text: delta.content };
              }

              // Handle tool calls
              if (delta.tool_calls) {
                for (const tc of delta.tool_calls) {
                  const index = tc.index;

                  if (tc.id && tc.function?.name) {
                    // New tool call starting
                    toolCallBuilders.set(index, {
                      id: tc.id,
                      name: tc.function.name,
                      arguments: tc.function.arguments ?? "",
                    });
                    yield {
                      type: "tool_call_start",
                      toolCall: { id: tc.id, name: tc.function.name },
                    };
                  } else if (tc.function?.arguments) {
                    // Argument delta
                    const builder = toolCallBuilders.get(index);
                    if (builder) {
                      builder.arguments += tc.function.arguments;
                      yield {
                        type: "tool_call_delta",
                        toolCall: { id: builder.id, argumentsDelta: tc.function.arguments },
                      };
                    }
                  }
                }
              }

              // Handle finish
              if (chunk.choices[0]?.finish_reason) {
                // Emit tool call end for any built tool calls
                for (const builder of toolCallBuilders.values()) {
                  yield {
                    type: "tool_call_end",
                    toolCall: { id: builder.id },
                  };
                }
                yield { type: "done" };
              }
            } catch (parseError) {
              console.warn("Failed to parse SSE chunk:", jsonStr, parseError);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}

/**
 * Default OpenAI endpoint
 */
export const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";
