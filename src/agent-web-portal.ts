import type { ZodSchema } from "zod";
import { ToolRegistry } from "./tool-registry.ts";
import { SkillRegistry } from "./skill-registry.ts";
import { createHttpHandler } from "./http-handler.ts";
import type {
  ToolRegistrationOptions,
  SkillRegistrationOptions,
  AgentWebPortalInstance,
  McpToolsListResponse,
  SkillsListResponse,
  HttpRequest,
} from "./types.ts";

/**
 * AgentWebPortal Builder Options
 */
export interface AgentWebPortalOptions {
  /** Server name for MCP protocol */
  name?: string;
  /** Server version */
  version?: string;
  /** Server description */
  description?: string;
}

/**
 * AgentWebPortal Builder
 * 
 * A builder-style class for creating an MCP-compatible, skill-focused
 * framework that exposes site functionality to AI Agents.
 * 
 * @example
 * ```typescript
 * const portal = new AgentWebPortalBuilder({ name: "my-portal" })
 *   .registerTool("greet", {
 *     inputSchema: z.object({ name: z.string() }),
 *     outputSchema: z.object({ message: z.string() }),
 *     handler: async ({ name }) => ({ message: `Hello, ${name}!` }),
 *   })
 *   .registerSkill("greeting-skill", {
 *     url: "/skills/greeting.md",
 *     frontmatter: { "allowed-tools": ["greet"] },
 *     markdown: "Use {{greet}} to greet the user.",
 *   })
 *   .build();
 * ```
 */
export class AgentWebPortalBuilder {
  private options: AgentWebPortalOptions;
  private toolRegistry: ToolRegistry;
  private skillRegistry: SkillRegistry;

  constructor(options: AgentWebPortalOptions = {}) {
    this.options = {
      name: options.name ?? "agent-web-portal",
      version: options.version ?? "1.0.0",
      description: options.description ?? "Agent Web Portal MCP Server",
    };
    this.toolRegistry = new ToolRegistry();
    this.skillRegistry = new SkillRegistry();
  }

  /**
   * Register a tool with input/output schemas and handler
   * 
   * @param name - Unique tool name
   * @param options - Tool definition with schemas and handler
   * @returns this - for method chaining
   */
  registerTool<
    TInputSchema extends ZodSchema,
    TOutputSchema extends ZodSchema,
  >(
    name: string,
    options: ToolRegistrationOptions<TInputSchema, TOutputSchema>
  ): this {
    this.toolRegistry.registerTool(name, options);
    return this;
  }

  /**
   * Register a skill with URL, frontmatter, and optional markdown
   * 
   * @param name - Unique skill name
   * @param options - Skill definition with URL, frontmatter, and markdown
   * @returns this - for method chaining
   */
  registerSkill(name: string, options: SkillRegistrationOptions): this {
    this.skillRegistry.registerSkill(name, options);
    return this;
  }

  /**
   * Build the AgentWebPortal instance
   * 
   * Validates all skills against registered tools and creates
   * the final instance with HTTP handler.
   * 
   * @throws SkillValidationError if any skill references missing tools
   * @returns AgentWebPortalInstance
   */
  build(): AgentWebPortalInstance {
    // Validate all skills against registered tools
    this.skillRegistry.validateSkills(this.toolRegistry);

    // Create the instance
    return new AgentWebPortalInstanceImpl(
      this.options,
      this.toolRegistry,
      this.skillRegistry
    );
  }
}

/**
 * Internal implementation of AgentWebPortalInstance
 */
class AgentWebPortalInstanceImpl implements AgentWebPortalInstance {
  private options: AgentWebPortalOptions;
  private toolRegistry: ToolRegistry;
  private skillRegistry: SkillRegistry;
  private httpHandler: (request: HttpRequest) => Promise<Response>;

  constructor(
    options: AgentWebPortalOptions,
    toolRegistry: ToolRegistry,
    skillRegistry: SkillRegistry
  ) {
    this.options = options;
    this.toolRegistry = toolRegistry;
    this.skillRegistry = skillRegistry;
    this.httpHandler = createHttpHandler(this);
  }

  /**
   * Get server info for MCP protocol
   */
  getServerInfo(): { name: string; version: string } {
    return {
      name: this.options.name!,
      version: this.options.version!,
    };
  }

  /**
   * Handle HTTP POST requests (MCP-compatible endpoint)
   */
  async handleRequest(request: HttpRequest): Promise<Response> {
    return this.httpHandler(request);
  }

  /**
   * Get the list of registered tools in MCP format
   */
  listTools(): McpToolsListResponse {
    return this.toolRegistry.toMcpToolsList();
  }

  /**
   * Get the list of registered skills with frontmatter
   */
  listSkills(): SkillsListResponse {
    return this.skillRegistry.toSkillsList();
  }

  /**
   * Invoke a tool by name
   */
  async invokeTool(name: string, args: unknown): Promise<unknown> {
    return this.toolRegistry.invokeTool(name, args);
  }
}

/**
 * Create a new AgentWebPortal builder
 * 
 * @param options - Optional configuration
 * @returns AgentWebPortalBuilder instance
 */
export function createAgentWebPortal(
  options?: AgentWebPortalOptions
): AgentWebPortalBuilder {
  return new AgentWebPortalBuilder(options);
}
