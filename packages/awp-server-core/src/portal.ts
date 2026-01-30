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
  DefinedTool,
  McpToolsListResponse,
  ServerPortalConfig,
} from "./types.ts";
import { CasNotConfiguredError, TicketCreationError } from "./types.ts";

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
      shard: string;
      scope: string | string[];
      writable: boolean | { quota?: number; accept?: string[] };
      config: { chunkThreshold: number };
    };

    return {
      ticket: ticket.id,
      endpoint: this.endpoint,
      expiresAt: ticket.expiresAt,
      shard: ticket.shard,
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
  // Tool Execution
  // ============================================================================

  /**
   * Execute a tool with CAS context
   *
   * If casContext is not provided, a new ticket will be created using
   * the configured ticket provider (requires CAS configuration).
   *
   * @param name - Tool name
   * @param args - Tool arguments
   * @param casContext - Optional CAS context (if not provided, creates new ticket)
   * @returns Tool result
   */
  async executeTool(name: string, args: unknown, casContext?: CasBlobContext): Promise<unknown> {
    // Get or create CAS context
    let context = casContext;

    if (!context) {
      // Extract CAS keys from args to determine scope
      const scope = this.extractCasKeys(args);

      if (scope.length > 0 || this.toolMayWrite(name)) {
        // Need CAS access - create a ticket
        if (!this.ticketProvider) {
          throw new CasNotConfiguredError();
        }
        context = await this.ticketProvider.createTicket(
          scope.length > 0 ? scope : ["*"], // Use wildcard if no specific scope
          true // Enable writes
        );
      }
    }

    // Create BufferedCasClient if we have a context
    let cas: BufferedCasClient | undefined;
    if (context) {
      cas = new BufferedCasClient(context, this.storage);
    }

    // Create a dummy CAS client if none available
    if (!cas) {
      cas = this.createDummyCasClient();
    }

    try {
      // Invoke the tool
      const result = await this.registry.invoke(name, args, cas);

      // Commit any pending writes
      if (cas.hasPendingWrites()) {
        await cas.commit();
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
   * Extract CAS keys from tool arguments
   *
   * Looks for string values that look like CAS keys (sha256:...)
   */
  private extractCasKeys(args: unknown): string[] {
    const keys: string[] = [];

    function traverse(value: unknown): void {
      if (typeof value === "string" && value.startsWith("sha256:")) {
        keys.push(value);
      } else if (Array.isArray(value)) {
        for (const item of value) {
          traverse(item);
        }
      } else if (typeof value === "object" && value !== null) {
        for (const prop of Object.values(value)) {
          traverse(prop);
        }
      }
    }

    traverse(args);
    return keys;
  }

  /**
   * Check if a tool might write to CAS
   *
   * For now, assume all tools might write.
   * In the future, we could analyze the tool definition.
   */
  private toolMayWrite(_name: string): boolean {
    // TODO: Analyze tool output schema for CAS key fields
    return true;
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
      shard: "dummy",
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
