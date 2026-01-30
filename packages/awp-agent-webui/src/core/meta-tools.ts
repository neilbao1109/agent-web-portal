/**
 * Meta-Tools
 *
 * Built-in tools for skill discovery and management.
 * These tools are always available to the LLM regardless of active skills.
 */

import type { AwpCasManager, SkillInfo } from "@agent-web-portal/awp-client-browser";
import type { AgentContext } from "./agent-context";
import type { LlmToolSchema } from "./llm";

/**
 * Meta-tool definitions for LLM
 */
export const META_TOOLS: LlmToolSchema[] = [
  {
    name: "discover_skills",
    description:
      "Discover available skills from all connected AWP endpoints. Returns a list of skills with their descriptions and capabilities. Use this to understand what skills are available before loading them.",
    inputSchema: {
      type: "object",
      properties: {
        endpointId: {
          type: "string",
          description:
            "Optional: Filter skills by endpoint ID. If not provided, returns skills from all endpoints.",
        },
      },
      required: [],
    },
  },
  {
    name: "load_skill",
    description:
      "Load a skill to make its tools available for use. The skill prompt and instructions will be added to the context. You must load a skill before using its tools.",
    inputSchema: {
      type: "object",
      properties: {
        skillId: {
          type: "string",
          description:
            'The full skill ID in format "endpointId:skillName" (e.g., "a3f2b1:multilingual-greeting")',
        },
      },
      required: ["skillId"],
    },
  },
  {
    name: "unload_skill",
    description:
      "Unload a skill to remove its tools from the available tools list. Use this when you no longer need a skill to reduce context size.",
    inputSchema: {
      type: "object",
      properties: {
        skillId: {
          type: "string",
          description: 'The full skill ID to unload (e.g., "a3f2b1:multilingual-greeting")',
        },
      },
      required: ["skillId"],
    },
  },
  {
    name: "list_active_skills",
    description:
      "List all currently loaded/active skills. Use this to see what skills are currently available and their tools.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
];

/**
 * Discover skills result
 */
export interface DiscoverSkillsResult {
  skills: Array<{
    skillId: string;
    endpointId: string;
    skillName: string;
    name: string;
    description: string;
    version?: string;
    allowedTools: string[];
  }>;
}

/**
 * Load skill result
 */
export interface LoadSkillResult {
  success: boolean;
  skillId: string;
  name: string;
  description: string;
  prompt: string;
  tools: string[];
}

/**
 * Unload skill result
 */
export interface UnloadSkillResult {
  success: boolean;
  skillId: string;
  message: string;
}

/**
 * List active skills result
 */
export interface ListActiveSkillsResult {
  skills: Array<{
    skillId: string;
    name: string;
    tools: string[];
  }>;
}

/**
 * Meta-tool executor
 */
export class MetaToolExecutor {
  private awpManager: AwpCasManager;
  private agentContext: AgentContext;

  constructor(awpManager: AwpCasManager, agentContext: AgentContext) {
    this.awpManager = awpManager;
    this.agentContext = agentContext;
  }

  /**
   * Check if a tool name is a meta-tool
   */
  isMetaTool(toolName: string): boolean {
    return META_TOOLS.some((t) => t.name === toolName);
  }

  /**
   * Execute a meta-tool
   */
  async execute(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<DiscoverSkillsResult | LoadSkillResult | UnloadSkillResult | ListActiveSkillsResult> {
    switch (toolName) {
      case "discover_skills":
        return this.discoverSkills(args.endpointId as string | undefined);
      case "load_skill":
        return this.loadSkill(args.skillId as string);
      case "unload_skill":
        return this.unloadSkill(args.skillId as string);
      case "list_active_skills":
        return this.listActiveSkills();
      default:
        throw new Error(`Unknown meta-tool: ${toolName}`);
    }
  }

  /**
   * Discover available skills
   */
  private async discoverSkills(endpointId?: string): Promise<DiscoverSkillsResult> {
    let skills: SkillInfo[];

    if (endpointId) {
      skills = await this.awpManager.listSkillsForEndpoint(endpointId);
    } else {
      skills = await this.awpManager.listAllSkills();
    }

    return {
      skills: skills.map((skill) => ({
        skillId: skill.fullId,
        endpointId: skill.endpointId,
        skillName: skill.skillName,
        name: (skill.frontmatter.name as string) ?? skill.skillName,
        description: (skill.frontmatter.description as string) ?? "",
        version: skill.frontmatter.version as string | undefined,
        allowedTools: (skill.frontmatter["allowed-tools"] as string[]) ?? [],
      })),
    };
  }

  /**
   * Load a skill
   */
  private async loadSkill(skillId: string): Promise<LoadSkillResult> {
    // Parse skill ID
    const colonIndex = skillId.indexOf(":");
    if (colonIndex === -1) {
      return {
        success: false,
        skillId,
        name: "",
        description: "",
        prompt: "",
        tools: [],
      };
    }

    const endpointId = skillId.substring(0, colonIndex);
    const skillName = skillId.substring(colonIndex + 1);

    // Find the skill
    const skills = await this.awpManager.listSkillsForEndpoint(endpointId);
    const skillInfo = skills.find((s) => s.skillName === skillName);

    if (!skillInfo) {
      return {
        success: false,
        skillId,
        name: "",
        description: `Skill not found: ${skillId}`,
        prompt: "",
        tools: [],
      };
    }

    // Load the skill
    const loadedSkill = await this.agentContext.loadSkill(skillInfo);

    return {
      success: true,
      skillId: loadedSkill.fullId,
      name: (loadedSkill.frontmatter.name as string) ?? loadedSkill.skillName,
      description: (loadedSkill.frontmatter.description as string) ?? "",
      prompt: loadedSkill.prompt,
      tools: loadedSkill.prefixedToolNames,
    };
  }

  /**
   * Unload a skill
   */
  private unloadSkill(skillId: string): UnloadSkillResult {
    const success = this.agentContext.unloadSkill(skillId);

    return {
      success,
      skillId,
      message: success
        ? `Skill ${skillId} unloaded successfully`
        : `Skill ${skillId} was not loaded`,
    };
  }

  /**
   * List active skills
   */
  private listActiveSkills(): ListActiveSkillsResult {
    const activeSkills = this.agentContext.getActiveSkills();

    return {
      skills: activeSkills.map((skill) => ({
        skillId: skill.fullId,
        name: (skill.frontmatter.name as string) ?? skill.skillName,
        tools: skill.prefixedToolNames,
      })),
    };
  }
}
