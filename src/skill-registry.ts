import type { ToolRegistry } from "./tool-registry.ts";
import type {
  SkillDefinition,
  SkillFrontmatter,
  SkillRegistrationOptions,
  SkillsListResponse,
} from "./types.ts";
import { SkillValidationError } from "./types.ts";

/**
 * Parse tool reference from skill markdown
 * Handles both {{tool_name}} and {{mcp_alias:tool_name}} formats
 */
export interface ParsedToolReference {
  /** Original reference string (e.g., "mcp_alias:tool_name") */
  original: string;
  /** MCP alias if present (e.g., "mcp_alias") */
  mcpAlias?: string;
  /** Tool name (e.g., "tool_name") */
  toolName: string;
  /** Whether this is a cross-MCP reference */
  isCrossMcp: boolean;
}

/**
 * Registry for managing skills
 * Handles skill registration, validation, and listing
 */
export class SkillRegistry {
  private skills: Map<string, SkillDefinition> = new Map();

  /**
   * Register a new skill
   * @param name - Unique skill name
   * @param options - Skill definition including URL, frontmatter, and markdown
   */
  registerSkill(name: string, options: SkillRegistrationOptions): void {
    if (this.skills.has(name)) {
      throw new Error(`Skill "${name}" is already registered`);
    }

    this.skills.set(name, {
      url: options.url,
      frontmatter: options.frontmatter,
      markdown: options.markdown,
    });
  }

  /**
   * Check if a skill exists
   * @param name - Skill name to check
   */
  hasSkill(name: string): boolean {
    return this.skills.has(name);
  }

  /**
   * Get a skill by name
   * @param name - Skill name
   */
  getSkill(name: string): SkillDefinition | undefined {
    return this.skills.get(name);
  }

  /**
   * Get all registered skill names
   */
  getSkillNames(): string[] {
    return Array.from(this.skills.keys());
  }

  /**
   * Parse allowed-tools from frontmatter
   * @param frontmatter - Skill frontmatter
   */
  parseAllowedTools(frontmatter: SkillFrontmatter): ParsedToolReference[] {
    const allowedTools = frontmatter["allowed-tools"] ?? [];
    return allowedTools.map(this.parseToolReference);
  }

  /**
   * Parse a single tool reference
   * @param reference - Tool reference string
   */
  parseToolReference(reference: string): ParsedToolReference {
    const trimmed = reference.trim();

    if (trimmed.includes(":")) {
      const [mcpAlias, toolName] = trimmed.split(":", 2);
      return {
        original: trimmed,
        mcpAlias: mcpAlias!,
        toolName: toolName!,
        isCrossMcp: true,
      };
    }

    return {
      original: trimmed,
      toolName: trimmed,
      isCrossMcp: false,
    };
  }

  /**
   * Validate all skills against registered tools
   * Throws SkillValidationError if any skill references missing local tools
   * @param toolRegistry - Tool registry to validate against
   */
  validateSkills(toolRegistry: ToolRegistry): void {
    for (const [skillName, skill] of this.skills.entries()) {
      const allowedTools = this.parseAllowedTools(skill.frontmatter);
      const missingTools: string[] = [];

      for (const toolRef of allowedTools) {
        // Only validate local tools (non-cross-MCP references)
        if (!toolRef.isCrossMcp) {
          if (!toolRegistry.hasTool(toolRef.toolName)) {
            missingTools.push(toolRef.toolName);
          }
        }
      }

      if (missingTools.length > 0) {
        throw new SkillValidationError(skillName, missingTools);
      }
    }
  }

  /**
   * Get all skills in skills/list response format
   */
  toSkillsList(): SkillsListResponse {
    const result: SkillsListResponse = {};

    for (const [name, skill] of this.skills.entries()) {
      result[name] = {
        url: skill.url,
        frontmatter: skill.frontmatter,
      };
    }

    return result;
  }

  /**
   * Extract tool references from skill markdown
   * Matches {{tool_name}} and {{mcp_alias:tool_name}} patterns
   * @param markdown - Skill markdown content
   */
  extractToolReferences(markdown: string): ParsedToolReference[] {
    const pattern = /\{\{([^}]+)\}\}/g;
    const references: ParsedToolReference[] = [];
    let match;

    while ((match = pattern.exec(markdown)) !== null) {
      const ref = match[1];
      if (ref) {
        references.push(this.parseToolReference(ref));
      }
    }

    return references;
  }

  /**
   * Rewrite tool references in markdown for local dispatch
   * @param markdown - Original markdown
   * @param rewriteMap - Map of original references to rewritten names
   */
  rewriteToolReferences(markdown: string, rewriteMap: Map<string, string>): string {
    return markdown.replace(/\{\{([^}]+)\}\}/g, (match, ref: string) => {
      const trimmed = ref.trim();
      const rewritten = rewriteMap.get(trimmed);
      return rewritten ? `{{${rewritten}}}` : match;
    });
  }

  /**
   * Clear all registered skills
   */
  clear(): void {
    this.skills.clear();
  }
}
