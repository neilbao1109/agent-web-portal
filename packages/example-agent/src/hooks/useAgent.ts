/**
 * useAgent Hook
 *
 * Main agent hook that orchestrates LLM, AWP, and conversation management
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AgentContext,
  type AwpManager,
  type LlmAdapter,
  type LlmToolCall,
  type LlmToolSchema,
  META_TOOLS,
  MetaToolExecutor,
  type SkillInfo,
} from "../core";
import type { Message } from "../storage";

/**
 * Agent state
 */
export type AgentState = "idle" | "thinking" | "streaming" | "calling_tool" | "error";

/**
 * Streaming message for UI
 */
export interface StreamingMessage {
  content: string;
  toolCalls: Array<{
    id: string;
    name: string;
    arguments: string;
    isComplete: boolean;
  }>;
}

/**
 * Tool execution result for UI
 */
export interface ToolExecutionResult {
  toolCallId: string;
  name: string;
  result: string;
  isError: boolean;
}

export interface UseAgentOptions {
  /** AWP Manager instance */
  manager: AwpManager;
  /** LLM adapter instance */
  adapter: LlmAdapter | null;
  /** System prompt */
  systemPrompt?: string;
  /** Max tool call iterations */
  maxIterations?: number;
}

export interface UseAgentResult {
  /** Current agent state */
  state: AgentState;
  /** Messages in current conversation */
  messages: Message[];
  /** Current streaming message (while streaming) */
  streamingMessage: StreamingMessage | null;
  /** Active skill IDs */
  activeSkillIds: string[];
  /** Available skills */
  availableSkills: SkillInfo[];
  /** Send a user message */
  sendMessage: (content: string) => Promise<void>;
  /** Load a skill */
  loadSkill: (skillId: string) => Promise<void>;
  /** Unload a skill */
  unloadSkill: (skillId: string) => void;
  /** Clear conversation */
  clearConversation: () => void;
  /** Stop current generation */
  stop: () => void;
  /** Error message if in error state */
  error: string | null;
}

const DEFAULT_SYSTEM_PROMPT = `You are a helpful AI assistant with access to various skills and tools.

You can discover and load skills using the discover_skills and load_skill tools. Each skill provides specific capabilities through its tools.

Before using a skill's tools, you must first load the skill. You can unload skills you no longer need to keep the context focused.

## CRITICAL: Displaying Generated Images

When an image generation tool (like flux_pro, txt2img, etc.) returns a result, it includes an image blob with a URI. You MUST display it using Markdown.

Example tool result:
\`\`\`json
{
  "metadata": { "id": "...", "seed": 123 },
  "image": { "uri": "blob://output-1234-abcd" }
}
\`\`\`

You MUST respond with the image displayed in Markdown like this:
\`\`\`
Here is your generated image:

![Generated image](blob://output-1234-abcd)
\`\`\`

**RULES:**
1. Extract the EXACT \`uri\` value from the \`image\` field (e.g., \`blob://output-1234-abcd\`)
2. Use Markdown image syntax: \`![description](URI_HERE)\`
3. NEVER leave the src empty - always include the blob:// URI from the result
4. The URI starts with \`blob://\` followed by the output ID

Do NOT use the entire object - only use the \`uri\` string value (e.g., \`blob://abc123\`).

The system will automatically resolve the blob URI and display the image inline in the chat.

Always be helpful, accurate, and efficient in using the available tools.`;

export function useAgent(options: UseAgentOptions): UseAgentResult {
  const { manager, adapter, systemPrompt = DEFAULT_SYSTEM_PROMPT, maxIterations = 10 } = options;

  const [state, setState] = useState<AgentState>("idle");
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingMessage, setStreamingMessage] = useState<StreamingMessage | null>(null);
  const [activeSkillIds, setActiveSkillIds] = useState<string[]>([]);
  const [availableSkills, setAvailableSkills] = useState<SkillInfo[]>([]);
  const [error, setError] = useState<string | null>(null);

  const contextRef = useRef<AgentContext | null>(null);
  const metaToolExecutorRef = useRef<MetaToolExecutor | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Initialize context and meta tool executor
  useEffect(() => {
    contextRef.current = new AgentContext(manager);
    metaToolExecutorRef.current = new MetaToolExecutor(manager, contextRef.current);
  }, [manager]);

  // Load available skills
  useEffect(() => {
    const loadSkills = async () => {
      try {
        const skills = await manager.listAllSkills();
        setAvailableSkills(skills);
      } catch (err) {
        console.error("Failed to load skills:", err);
      }
    };
    loadSkills();
  }, [manager]);

  const stop = useCallback(() => {
    abortControllerRef.current?.abort();
    setState("idle");
    setStreamingMessage(null);
  }, []);

  const clearConversation = useCallback(() => {
    contextRef.current?.reset();
    setMessages([]);
    setActiveSkillIds([]);
    setState("idle");
    setStreamingMessage(null);
    setError(null);
  }, []);

  const loadSkill = useCallback(
    async (skillId: string) => {
      const context = contextRef.current;
      if (!context) return;

      const skills = await manager.listAllSkills();
      const skillInfo = skills.find((s) => s.fullId === skillId);
      if (skillInfo) {
        await context.loadSkill(skillInfo);
        setActiveSkillIds(context.getActiveSkillIds());
      }
    },
    [manager]
  );

  const unloadSkill = useCallback((skillId: string) => {
    const context = contextRef.current;
    if (!context) return;

    context.unloadSkill(skillId);
    setActiveSkillIds(context.getActiveSkillIds());
  }, []);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!adapter || !contextRef.current || !metaToolExecutorRef.current) {
        setError("Agent not configured");
        return;
      }

      const context = contextRef.current;
      const metaToolExecutor = metaToolExecutorRef.current;

      // Add user message
      const userMessage: Message = {
        id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
        role: "user",
        content,
        createdAt: Date.now(),
      };
      setMessages((prev) => [...prev, userMessage]);
      context.addMessage({ role: "user", content });

      abortControllerRef.current = new AbortController();
      setError(null);

      let iterations = 0;

      try {
        while (iterations < maxIterations) {
          iterations++;

          // Build tools list (meta-tools + active skill tools)
          const activeToolSchemas = await context.getActiveToolSchemas();
          const allTools: LlmToolSchema[] = [...META_TOOLS, ...activeToolSchemas];

          // Build messages with system prompt
          const fullSystemPrompt = context.buildSystemPrompt(systemPrompt);
          const llmMessages = context.buildLlmMessages(fullSystemPrompt);

          // Stream response
          setState("streaming");
          setStreamingMessage({ content: "", toolCalls: [] });

          let fullContent = "";
          const toolCalls: LlmToolCall[] = [];
          const toolCallBuilders = new Map<string, { name: string; arguments: string }>();

          for await (const chunk of adapter.chatStream(llmMessages, allTools)) {
            if (abortControllerRef.current?.signal.aborted) {
              break;
            }

            switch (chunk.type) {
              case "text":
                fullContent += chunk.text ?? "";
                setStreamingMessage((prev) => ({
                  content: fullContent,
                  toolCalls: prev?.toolCalls ?? [],
                }));
                break;

              case "tool_call_start":
                if (chunk.toolCall) {
                  toolCallBuilders.set(chunk.toolCall.id, {
                    name: chunk.toolCall.name ?? "",
                    arguments: "",
                  });
                  setStreamingMessage((prev) => ({
                    content: prev?.content ?? "",
                    toolCalls: [
                      ...(prev?.toolCalls ?? []),
                      {
                        id: chunk.toolCall!.id,
                        name: chunk.toolCall!.name ?? "",
                        arguments: "",
                        isComplete: false,
                      },
                    ],
                  }));
                }
                break;

              case "tool_call_delta":
                if (chunk.toolCall) {
                  const builder = toolCallBuilders.get(chunk.toolCall.id);
                  if (builder) {
                    builder.arguments += chunk.toolCall.argumentsDelta ?? "";
                    setStreamingMessage((prev) => ({
                      content: prev?.content ?? "",
                      toolCalls:
                        prev?.toolCalls.map((tc) =>
                          tc.id === chunk.toolCall!.id
                            ? { ...tc, arguments: builder.arguments }
                            : tc
                        ) ?? [],
                    }));
                  }
                }
                break;

              case "tool_call_end":
                if (chunk.toolCall) {
                  const builder = toolCallBuilders.get(chunk.toolCall.id);
                  if (builder) {
                    try {
                      const parsedArgs = JSON.parse(builder.arguments || "{}");
                      toolCalls.push({
                        id: chunk.toolCall.id,
                        name: builder.name,
                        arguments: parsedArgs,
                      });
                    } catch {
                      toolCalls.push({
                        id: chunk.toolCall.id,
                        name: builder.name,
                        arguments: {},
                      });
                    }
                    setStreamingMessage((prev) => ({
                      content: prev?.content ?? "",
                      toolCalls:
                        prev?.toolCalls.map((tc) =>
                          tc.id === chunk.toolCall!.id ? { ...tc, isComplete: true } : tc
                        ) ?? [],
                    }));
                  }
                }
                break;

              case "error":
                setError(chunk.error ?? "Unknown error");
                setState("error");
                return;
            }
          }

          setStreamingMessage(null);

          // Add assistant message
          const assistantMessage: Message = {
            id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
            role: "assistant",
            content: fullContent,
            toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
            createdAt: Date.now(),
          };
          setMessages((prev) => [...prev, assistantMessage]);
          context.addMessage({
            role: "assistant",
            content: fullContent,
            toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
          });

          // If no tool calls, we're done
          if (toolCalls.length === 0) {
            setState("idle");
            return;
          }

          // Execute tool calls
          setState("calling_tool");

          for (const toolCall of toolCalls) {
            let result: string;
            let isError = false;
            let loadedSkillId: string | undefined;

            try {
              if (metaToolExecutor.isMetaTool(toolCall.name)) {
                // Execute meta-tool
                const metaResult = await metaToolExecutor.execute(
                  toolCall.name,
                  toolCall.arguments
                );
                result = JSON.stringify(metaResult, null, 2);

                // Track if this was a load_skill call
                if (
                  toolCall.name === "load_skill" &&
                  "success" in metaResult &&
                  metaResult.success
                ) {
                  loadedSkillId = (metaResult as { skillId: string }).skillId;
                  setActiveSkillIds(context.getActiveSkillIds());
                }

                // Track if this was an unload_skill call
                if (toolCall.name === "unload_skill") {
                  setActiveSkillIds(context.getActiveSkillIds());
                }
              } else {
                // Execute AWP tool
                console.log(`[AWP] Calling tool: ${toolCall.name}`, toolCall.arguments);
                try {
                  const awpResult = await manager.callTool(toolCall.name, toolCall.arguments);
                  console.log(`[AWP] Tool result for ${toolCall.name}:`, awpResult);
                  console.log(`[AWP] Tool output:`, awpResult.output);
                  console.log(`[AWP] Tool blobs:`, awpResult.blobs);
                  console.log(`[AWP] Tool blobs JSON:`, JSON.stringify(awpResult.blobs, null, 2));
                  
                  // Combine output and blobs in the result
                  // Blobs contain { uri, contentType? } for each output blob field
                  const output = awpResult.output as Record<string, unknown> | undefined;
                  const blobs = awpResult.blobs as Record<string, unknown> | undefined;
                  const combinedResult = {
                    ...(output ?? {}),
                    ...(blobs ?? {}),
                  };
                  console.log(`[AWP] Combined result for LLM:`, combinedResult);
                  console.log(`[AWP] Combined result JSON:`, JSON.stringify(combinedResult, null, 2));
                  result = JSON.stringify(combinedResult, null, 2);
                  isError = awpResult.isError ?? false;
                } catch (toolErr) {
                  console.error(`[AWP] Tool call failed for ${toolCall.name}:`, toolErr);
                  throw toolErr;
                }
              }
            } catch (err) {
              result = `Error: ${err instanceof Error ? err.message : String(err)}`;
              isError = true;
            }

            // Add tool result message
            const toolResultMessage: Message = {
              id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
              role: "tool",
              content: result,
              toolResult: {
                toolCallId: toolCall.id,
                name: toolCall.name,
                content: result,
                isError,
              },
              loadedSkillId,
              createdAt: Date.now(),
            };
            setMessages((prev) => [...prev, toolResultMessage]);
            context.addMessage({
              role: "tool",
              content: result,
              toolResult: {
                toolCallId: toolCall.id,
                content: result,
                isError,
              },
              loadedSkillId,
            });
          }

          // Continue loop to let LLM respond to tool results
        }

        // Max iterations reached
        setError("Max iterations reached");
        setState("error");
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          setState("idle");
        } else {
          setError(err instanceof Error ? err.message : String(err));
          setState("error");
        }
      }
    },
    [adapter, manager, systemPrompt, maxIterations]
  );

  return {
    state,
    messages,
    streamingMessage,
    activeSkillIds,
    availableSkills,
    sendMessage,
    loadSkill,
    unloadSkill,
    clearConversation,
    stop,
    error,
  };
}
