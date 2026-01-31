/**
 * AWP Server Core - Server Portal
 *
 * Main entry point for creating an AWP server with CAS integration.
 * Manages tool registration and request handling.
 */

import type { CasBlobContext, LocalStorageProvider } from "@agent-web-portal/cas-client-core";
import { BufferedCasClient } from "./buffered-client.ts";
import { McpHandler } from "./mcp-handler.ts";
import { ToolRegistry } from "./tool-registry.ts";
import type {
  CasConfig,
  CasTicketProvider,
  DefinedSkill,
  DefinedTool,
  McpToolsListResponse,
  ServerPortalConfig,
  SkillsListResponse,
} from "./types.ts";
import { CasNotConfiguredError, CasTicketError, TicketCreationError } from "./types.ts";

/**
 * Default ticket provider that creates tickets via CAS API
 */
class DefaultTicketProvider implements CasTicketProvider {
  private endpoint: string;
  private agentToken: string;
  private defaultTtl: number;

  constructor(config: CasConfig) {
    this.endpoint = config.endpoint.replace(/\/$/, "");
    this.agentToken = config.agentToken;
    this.defaultTtl = config.defaultTicketTtl ?? 3600;
  }

  async createTicket(
    scope: string | string[],
    writable?: boolean | { quota?: number; accept?: string[] }
  ): Promise<CasBlobContext> {
    const res = await fetch(`${this.endpoint}/auth/ticket`, {
      method: "POST",
      headers: {
        Authorization: `Agent ${this.agentToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        scope,
        writable: writable ?? true,
        expiresIn: this.defaultTtl,
      }),
    });

    if (!res.ok) {
      const error = await res.text();
      throw new TicketCreationError(`${res.status} - ${error}`);
    }

    const ticket = (await res.json()) as {
      id: string;
      expiresAt: string;
      realm: string;
      scope: string | string[];
      writable: boolean | { quota?: number; accept?: string[] };
      config: { chunkThreshold: number };
    };

    return {
      ticket: ticket.id,
      endpoint: this.endpoint,
      expiresAt: ticket.expiresAt,
      realm: ticket.realm,
      scope: ticket.scope,
      writable: ticket.writable,
      config: ticket.config,
    };
  }
}

/**
 * Server Portal
 *
 * Central hub for AWP server operations. Manages tool registration,
 * CAS integration, and MCP request handling.
 */
export class ServerPortal {
  private config: ServerPortalConfig;
  private registry: ToolRegistry;
  private mcpHandler: McpHandler;
  private ticketProvider?: CasTicketProvider;
  private storage?: LocalStorageProvider;
  private skills: Map<string, DefinedSkill> = new Map();
  private skillBaseUrl?: string;

  constructor(config: ServerPortalConfig) {
    this.config = config;
    this.registry = new ToolRegistry();
    this.mcpHandler = new McpHandler(this);

    // Initialize ticket provider if CAS config is provided
    if (config.cas) {
      this.ticketProvider = new DefaultTicketProvider(config.cas);
    }
  }

  // ============================================================================
  // Configuration
  // ============================================================================

  /**
   * Set a custom ticket provider
   */
  setTicketProvider(provider: CasTicketProvider): void {
    this.ticketProvider = provider;
  }

  /**
   * Set a local storage provider for caching
   */
  setStorageProvider(storage: LocalStorageProvider): void {
    this.storage = storage;
  }

  /**
   * Get portal configuration
   */
  getConfig(): ServerPortalConfig {
    return this.config;
  }

  // ============================================================================
  // Tool Registration
  // ============================================================================

  /**
   * Register a tool
   *
   * @param tool - The defined tool to register
   * @returns this for method chaining
   */
  registerTool(tool: DefinedTool): this {
    this.registry.register(tool);
    return this;
  }

  /**
   * Register multiple tools at once
   *
   * @param tools - Array of defined tools
   * @returns this for method chaining
   */
  registerTools(tools: DefinedTool[]): this {
    for (const tool of tools) {
      this.registry.register(tool);
    }
    return this;
  }

  /**
   * Check if a tool is registered
   */
  hasTool(name: string): boolean {
    return this.registry.has(name);
  }

  /**
   * Get all registered tool names
   */
  getToolNames(): string[] {
    return this.registry.getNames();
  }

  /**
   * Get the tools list in MCP format
   */
  listTools(): McpToolsListResponse {
    return this.registry.toMcpToolsList();
  }

  // ============================================================================
  // Skill Registration
  // ============================================================================

  /**
   * Set the base URL for skill downloads
   * Skills will be accessible at {baseUrl}/skills/{skillId}.md
   *
   * @param baseUrl - Base URL (e.g., "https://example.com/api")
   * @returns this for method chaining
   */
  setSkillBaseUrl(baseUrl: string): this {
    this.skillBaseUrl = baseUrl.replace(/\/$/, "");
    return this;
  }

  /**
   * Register a skill
   *
   * @param skill - The defined skill to register
   * @returns this for method chaining
   */
  registerSkill(skill: DefinedSkill): this {
    this.skills.set(skill.id, skill);
    return this;
  }

  /**
   * Register multiple skills at once
   *
   * @param skills - Array of defined skills
   * @returns this for method chaining
   */
  registerSkills(skills: DefinedSkill[]): this {
    for (const skill of skills) {
      this.skills.set(skill.id, skill);
    }
    return this;
  }

  /**
   * Check if a skill is registered
   */
  hasSkill(id: string): boolean {
    return this.skills.has(id);
  }

  /**
   * Get a skill by ID
   */
  getSkill(id: string): DefinedSkill | undefined {
    return this.skills.get(id);
  }

  /**
   * Get all registered skill IDs
   */
  getSkillIds(): string[] {
    return Array.from(this.skills.keys());
  }

  /**
   * Get the skills list in MCP format (for skills/list response)
   */
  listSkills(): SkillsListResponse {
    const result: SkillsListResponse = {};
    const baseUrl = this.skillBaseUrl ?? "";

    for (const [id, skill] of this.skills) {
      result[id] = {
        url: `${baseUrl}/skills/${id}.md`,
        frontmatter: skill.frontmatter,
      };
    }

    return result;
  }

  // ============================================================================
  // Tool Execution
  // ============================================================================

  /**
   * Execute a tool with CAS context
   *
   * CAS context is obtained in the following order of priority:
   * 1. #cas.endpoint in tool arguments (AWP Client or traditional MCP with CAS MCP)
   * 2. Server CAS config: uses ticketProvider to create a new ticket
   *
   * If none of these are available, a dummy CAS client is used (operations will fail
   * if the tool actually needs CAS access).
   *
   * @param name - Tool name
   * @param args - Tool arguments (may contain #cas.endpoint)
   * @returns Tool result
   */
  async executeTool(name: string, args: unknown): Promise<unknown> {
    // Try to get CAS context from #cas.endpoint in arguments
    let context = await this.extractCasContextFromArgs(args);

    if (context) {
      console.log("[ServerPortal] Using CAS context from #cas.endpoint in args:", {
        ticket: context.ticket,
        realm: context.realm,
      });
    }

    // If still no context, try to create one using the server's ticket provider
    if (!context && this.ticketProvider) {
      try {
        // Create a writable ticket with wildcard scope
        context = await this.ticketProvider.createTicket(["*"], true);
        console.log("[ServerPortal] Created CAS context using server ticket provider (agent realm):", {
          ticket: context.ticket,
          realm: context.realm,
        });
      } catch (error) {
        console.warn("[ServerPortal] Failed to create CAS context using ticket provider:", error);
      }
    }

    // Create BufferedCasClient if we have a context
    let cas: BufferedCasClient | undefined;
    if (context) {
      cas = new BufferedCasClient(context, this.storage);
    }

    // Create a dummy CAS client if none available
    // (tools that don't need CAS will work, others will fail with clear error)
    if (!cas) {
      console.warn("[ServerPortal] No CAS context available, using dummy client");
      cas = this.createDummyCasClient();
    }

    try {
      // Invoke the tool
      const result = await this.registry.invoke(name, args, cas);

      // Commit any pending writes
      if (cas.hasPendingWrites()) {
        console.log("[ServerPortal] Committing pending CAS writes...");
        await cas.commit();
        console.log("[ServerPortal] CAS writes committed successfully");
      }

      return result;
    } catch (error) {
      // Discard pending writes on error
      cas.discard();
      throw error;
    }
  }

  // ============================================================================
  // Request Handling
  // ============================================================================

  /**
   * Handle an HTTP request (MCP protocol)
   *
   * @param request - The incoming HTTP request
   * @returns HTTP response
   */
  async handleRequest(request: Request): Promise<Response> {
    return this.mcpHandler.handle(request);
  }

  // ============================================================================
  // Internal Registry Access (for McpHandler)
  // ============================================================================

  /**
   * @internal
   */
  getRegistry(): ToolRegistry {
    return this.registry;
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /**
   * Extract CAS context from tool arguments
   *
   * Looks for "#cas.endpoint" field which contains a full
   * CAS endpoint URL with embedded ticket:
   * https://cas.example.com/api/cas/{realm}/ticket/{ticketId}
   *
   * Fetches the ticket info via HTTP GET to get full CasBlobContext.
   */
  private async extractCasContextFromArgs(args: unknown): Promise<CasBlobContext | undefined> {
    if (typeof args !== "object" || args === null) {
      return undefined;
    }

    // Look for #cas.endpoint in top-level object
    const argsObj = args as Record<string, unknown>;
    const casEndpoint = argsObj["#cas.endpoint"];

    if (typeof casEndpoint !== "string") {
      // Also check nested objects for blob refs
      for (const value of Object.values(argsObj)) {
        if (typeof value === "object" && value !== null) {
          const nested = value as Record<string, unknown>;
          const nestedEndpoint = nested["#cas.endpoint"];
          if (typeof nestedEndpoint === "string") {
            return this.fetchCasContext(nestedEndpoint);
          }
        }
      }
      return undefined;
    }

    return this.fetchCasContext(casEndpoint);
  }

  /**
   * Fetch CasBlobContext from a #cas.endpoint URL via HTTP GET
   *
   * URL format: https://cas.example.com/api/cas/{realm}/ticket/{ticketId}
   */
  private async fetchCasContext(endpointUrl: string): Promise<CasBlobContext | undefined> {
    try {
      console.log("[ServerPortal] Fetching CAS context from:", endpointUrl);

      const response = await fetch(endpointUrl, {
        method: "GET",
        headers: {
          "Accept": "application/json",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[ServerPortal] Failed to fetch CAS context: ${response.status} - ${errorText}`);
        throw new CasTicketError(
          `Failed to fetch ticket info: ${response.status}`,
          response.status === 404 ? "NOT_FOUND" :
          response.status === 410 ? "EXPIRED" : "FETCH_FAILED"
        );
      }

      const context = await response.json() as CasBlobContext;
      console.log("[ServerPortal] Successfully fetched CAS context:", {
        ticket: context.ticket,
        realm: context.realm,
        writable: context.writable,
      });

      return context;
    } catch (error) {
      if (error instanceof CasTicketError) {
        throw error;
      }
      console.error("[ServerPortal] Error fetching CAS context:", error);
      return undefined;
    }
  }

  /**
   * Create a dummy CAS client for tools that don't need CAS
   */
  private createDummyCasClient(): BufferedCasClient {
    // Create a minimal context that will fail on actual CAS operations
    const dummyContext: CasBlobContext = {
      ticket: "dummy",
      endpoint: "http://localhost:0",
      expiresAt: new Date().toISOString(),
      realm: "dummy",
      scope: [],
      writable: false,
      config: {
        chunkThreshold: 1048576,
      },
    };
    return new BufferedCasClient(dummyContext);
  }
}

/**
 * Create a new ServerPortal builder
 *
 * @param config - Portal configuration
 * @returns A new ServerPortal instance
 *
 * @example
 * ```typescript
 * const portal = createServerPortal({
 *   name: "my-server",
 *   cas: {
 *     endpoint: process.env.CAS_ENDPOINT!,
 *     agentToken: process.env.CAS_AGENT_TOKEN!,
 *   },
 * })
 *   .registerTool(myTool)
 *   .registerTool(anotherTool);
 *
 * // Handle requests
 * const response = await portal.handleRequest(request);
 * ```
 */
export function createServerPortal(config: ServerPortalConfig): ServerPortal {
  return new ServerPortal(config);
}
