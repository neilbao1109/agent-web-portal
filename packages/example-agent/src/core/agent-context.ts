/**
 * Agent Context
 *
 * Manages the active state of the agent including:
 * - Active skills and their prompts
 * - Tool schemas aggregation
 * - Message building with skill prompt injection
 */

import type { AwpToolSchema, AwpManager, SkillInfo } from "@agent-web-portal/client";
import { skillCache } from "../storage";
import type { LlmMessage, LlmToolSchema } from "./llm";

/**
 * Loaded skill with cached content
 */
export interface LoadedSkill {
  /** Full skill ID: `${endpointId}:${skillName}` */
  fullId: string;
  /** Endpoint ID (short hash) */
  endpointId: string;
  /** Skill name */
  skillName: string;
  /** Skill frontmatter */
  frontmatter: Record<string, unknown>;
  /** Parsed SKILL.md content (prompt) */
  prompt: string;
  /** Tool names this skill uses (from frontmatter.allowed-tools) */
  allowedTools: string[];
  /** Full prefixed tool names */
  prefixedToolNames: string[];
}

/**
 * Message with skill tracking
 */
export interface TrackedMessage extends LlmMessage {
  /** ID of the message */
  id: string;
  /** Skill ID that loaded this message (for load_skill responses) */
  loadedSkillId?: string;
  /** Whether the skill has been unloaded */
  skillUnloaded?: boolean;
}

/**
 * Placeholder for unloaded skill content
 */
const UNLOADED_PLACEHOLDER = "[Skill unloaded]";

/**
 * Agent Context
 *
 * Maintains the active state of the agent:
 * - Which skills are loaded
 * - What tools are available
 * - How to build messages for LLM
 */
export class AgentContext {
  private awpManager: AwpManager;
  private activeSkills = new Map<string, LoadedSkill>();
  private messages: TrackedMessage[] = [];

  constructor(awpManager: AwpManager) {
    this.awpManager = awpManager;
  }

  /**
   * Load a skill by its full ID
   * Fetches SKILL.md, caches it, and adds to active skills
   */
  async loadSkill(skillInfo: SkillInfo): Promise<LoadedSkill> {
    const { fullId, endpointId, skillName, frontmatter } = skillInfo;

    // Check if already loaded
    if (this.activeSkills.has(fullId)) {
      return this.activeSkills.get(fullId)!;
    }

    // Try to get from cache first
    let cached = await skillCache.get(endpointId, skillName);

    if (!cached) {
      // Fetch and cache
      const content = await this.awpManager.fetchSkillContent(skillInfo);
      await skillCache.set(endpointId, skillName, content, frontmatter);
      cached = await skillCache.get(endpointId, skillName);
    }

    // Parse allowed tools
    const allowedTools = (frontmatter["allowed-tools"] as string[] | undefined) ?? [];

    // Create prefixed tool names
    const prefixedToolNames = allowedTools.map((tool) => {
      // Check if tool already has a prefix (e.g., "mcp_alias:tool_name")
      if (tool.includes(":")) {
        return tool;
      }
      return `${endpointId}:${tool}`;
    });

    const loadedSkill: LoadedSkill = {
      fullId,
      endpointId,
      skillName,
      frontmatter,
      prompt: cached?.content ?? "",
      allowedTools,
      prefixedToolNames,
    };

    this.activeSkills.set(fullId, loadedSkill);
    return loadedSkill;
  }

  /**
   * Unload a skill
   * Removes from active skills and marks related messages
   */
  unloadSkill(fullId: string): boolean {
    if (!this.activeSkills.has(fullId)) {
      return false;
    }

    this.activeSkills.delete(fullId);

    // Mark messages from this skill as unloaded
    for (const msg of this.messages) {
      if (msg.loadedSkillId === fullId) {
        msg.skillUnloaded = true;
      }
    }

    return true;
  }

  /**
   * Get all active skills
   */
  getActiveSkills(): LoadedSkill[] {
    return Array.from(this.activeSkills.values());
  }

  /**
   * Check if a skill is active
   */
  isSkillActive(fullId: string): boolean {
    return this.activeSkills.has(fullId);
  }

  /**
   * Get active skill IDs
   */
  getActiveSkillIds(): string[] {
    return Array.from(this.activeSkills.keys());
  }

  /**
   * Get all tool schemas for active skills
   * Converts AWP tool schemas to LLM-facing format
   */
  async getActiveToolSchemas(): Promise<LlmToolSchema[]> {
    const toolSchemas: LlmToolSchema[] = [];
    const seenTools = new Set<string>();

    for (const skill of this.activeSkills.values()) {
      // Get tools for this skill's endpoint
      const endpointTools = await this.awpManager.listToolsForEndpoint(skill.endpointId);

      for (const prefixedName of skill.prefixedToolNames) {
        // Skip if already added
        if (seenTools.has(prefixedName)) continue;

        // Find the tool
        const tool = endpointTools.find((t) => t.prefixedName === prefixedName);
        if (tool) {
          toolSchemas.push(this.convertToLlmToolSchema(tool.schema, tool.prefixedName));
          seenTools.add(prefixedName);
        }
      }
    }

    return toolSchemas;
  }

  /**
   * Convert AWP tool schema to LLM tool schema
   */
  private convertToLlmToolSchema(schema: AwpToolSchema, prefixedName: string): LlmToolSchema {
    return {
      name: prefixedName,
      description: schema.description,
      inputSchema: schema.inputSchema,
    };
  }

  /**
   * Add a message to the context
   */
  addMessage(message: Omit<TrackedMessage, "id">): TrackedMessage {
    const tracked: TrackedMessage = {
      ...message,
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    };
    this.messages.push(tracked);
    return tracked;
  }

  /**
   * Get all messages
   */
  getMessages(): TrackedMessage[] {
    return [...this.messages];
  }

  /**
   * Build messages for LLM with skill prompts and placeholders
   */
  buildLlmMessages(systemPrompt?: string): LlmMessage[] {
    const llmMessages: LlmMessage[] = [];

    // Add system prompt if provided
    if (systemPrompt) {
      llmMessages.push({ role: "system", content: systemPrompt });
    }

    // Process tracked messages
    for (const msg of this.messages) {
      // Handle unloaded skill content
      if (msg.loadedSkillId && msg.skillUnloaded) {
        llmMessages.push({
          role: msg.role,
          content: UNLOADED_PLACEHOLDER,
          toolCalls: msg.toolCalls,
          toolResult: msg.toolResult
            ? { ...msg.toolResult, content: UNLOADED_PLACEHOLDER }
            : undefined,
        });
      } else {
        llmMessages.push({
          role: msg.role,
          content: msg.content,
          toolCalls: msg.toolCalls,
          toolResult: msg.toolResult,
        });
      }
    }

    return llmMessages;
  }

  /**
   * Build system prompt with active skill prompts
   */
  buildSystemPrompt(basePrompt: string): string {
    const parts = [basePrompt];

    const activeSkills = this.getActiveSkills();
    if (activeSkills.length > 0) {
      parts.push("\n\n## Active Skills\n");
      for (const skill of activeSkills) {
        parts.push(`### ${skill.frontmatter.name ?? skill.skillName}\n`);
        parts.push(skill.prompt);
        parts.push("\n");
      }
    }

    return parts.join("");
  }

  /**
   * Clear all messages
   */
  clearMessages(): void {
    this.messages = [];
  }

  /**
   * Clear all state (messages and active skills)
   */
  reset(): void {
    this.messages = [];
    this.activeSkills.clear();
  }

  /**
   * Restore state from a saved conversation
   */
  async restoreFromConversation(
    messages: TrackedMessage[],
    activeSkillIds: string[]
  ): Promise<void> {
    this.messages = messages;

    // Reload active skills
    this.activeSkills.clear();
    const allSkills = await this.awpManager.listAllSkills();

    for (const skillId of activeSkillIds) {
      const skillInfo = allSkills.find((s) => s.fullId === skillId);
      if (skillInfo) {
        await this.loadSkill(skillInfo);
      }
    }
  }
}
