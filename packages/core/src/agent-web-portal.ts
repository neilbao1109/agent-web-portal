import type { ZodSchema } from "zod";
import { createHttpHandler } from "./http-handler.ts";
import { SkillRegistry } from "./skill-registry.ts";
import { ToolRegistry } from "./tool-registry.ts";
import type {
  AgentWebPortalConfig,
  AgentWebPortalInstance,
  HttpRequest,
  McpToolsListResponse,
  SkillRegistrationOptions,
  SkillsListResponse,
  ToolRegistrationOptions,
} from "./types.ts";

/**
 * AgentWebPortal Builder Options (intrinsic properties)
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
 * Options for build() - runtime behavior configuration
 */
export interface AgentWebPortalBuildOptions extends AgentWebPortalConfig {}

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
 *   .registerSkills({
 *     "greeting-skill": {
 *       url: "/skills/greeting-skill",
 *       frontmatter: { "allowed-tools": ["greet"] },
 *     },
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
  registerTool<TInputSchema extends ZodSchema, TOutputSchema extends ZodSchema>(
    name: string,
    options: ToolRegistrationOptions<TInputSchema, TOutputSchema>
  ): this {
    this.toolRegistry.registerTool(name, options);
    return this;
  }

  /**
   * Register multiple skills at once
   *
   * @param skills - Map of skill names to skill definitions
   * @returns this - for method chaining
   *
   * @example
   * ```typescript
   * portal.registerSkills({
   *   "greeting-skill": {
   *     url: "/skills/greeting-skill",
   *     frontmatter: { "allowed-tools": ["greet"] },
   *   },
   *   "search-skill": {
   *     url: "/skills/search-skill",
   *     frontmatter: { "allowed-tools": ["search"] },
   *   },
   * });
   * ```
   */
  registerSkills(skills: Record<string, SkillRegistrationOptions>): this {
    this.skillRegistry.registerSkills(skills);
    return this;
  }

  /**
   * Build the AgentWebPortal instance
   *
   * Validates all skills against registered tools and creates
   * the final instance with HTTP handler.
   *
   * @param buildOptions - Runtime behavior configuration
   * @throws SkillValidationError if any skill references missing tools
   * @returns AgentWebPortalInstance
   */
  build(buildOptions: AgentWebPortalBuildOptions = {}): AgentWebPortalInstance {
    // Validate all skills against registered tools
    this.skillRegistry.validateSkills(this.toolRegistry);

    // Apply runtime configuration to tool registry
    this.toolRegistry.setConfig({
      coerceXmlClientArgs: buildOptions.coerceXmlClientArgs ?? false,
    });

    // Create the instance
    return new AgentWebPortalInstanceImpl(this.options, this.toolRegistry, this.skillRegistry);
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
export function createAgentWebPortal(options?: AgentWebPortalOptions): AgentWebPortalBuilder {
  return new AgentWebPortalBuilder(options);
}
