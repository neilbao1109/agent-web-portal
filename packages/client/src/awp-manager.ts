/**
 * AWP Manager
 *
 * Manages multiple AWP endpoints with:
 * - Automatic short hash prefixes for namespacing
 * - Shared auth and storage providers
 * - Aggregated skill and tool listing
 */

import { AwpAuth } from "./auth/index.ts";
import { AwpClient, type AwpToolSchema, type ToolCallResult } from "./client.ts";
import type { KeyStorage } from "./auth/types.ts";
import type { StorageProvider } from "./storage/types.ts";
import { HashRegistry } from "./utils/hash.ts";

/**
 * Skill information from an endpoint
 */
export interface SkillInfo {
  /** Unique endpoint identifier (short hash) */
  endpointId: string;
  /** Skill name */
  skillName: string;
  /** Full prefixed skill ID: `${endpointId}:${skillName}` */
  fullId: string;
  /** Skill URL for fetching SKILL.md */
  url: string;
  /** Skill frontmatter */
  frontmatter: SkillFrontmatter;
}

/**
 * Skill frontmatter parsed from SKILL.md
 */
export interface SkillFrontmatter {
  name?: string;
  description?: string;
  version?: string;
  "allowed-tools"?: string[];
  [key: string]: unknown;
}

/**
 * Tool information with endpoint prefix
 */
export interface PrefixedTool {
  /** Unique endpoint identifier (short hash) */
  endpointId: string;
  /** Original tool name */
  originalName: string;
  /** Full prefixed tool name: `${endpointId}:${originalName}` */
  prefixedName: string;
  /** Tool schema */
  schema: AwpToolSchema;
}

/**
 * Registered endpoint information
 */
export interface RegisteredEndpoint {
  /** Unique endpoint identifier (short hash) */
  endpointId: string;
  /** Original endpoint URL */
  url: string;
  /** Optional alias for display */
  alias?: string;
  /** AWP client instance */
  client: AwpClient;
  /** Auth instance */
  auth: AwpAuth;
  /** Whether currently authenticated */
  isAuthenticated: boolean;
}

/**
 * Skills list response from AWP server
 */
interface SkillsListResponse {
  [skillName: string]: {
    url: string;
    frontmatter: SkillFrontmatter;
  };
}

/**
 * AWP Manager Options
 */
export interface AwpManagerOptions {
  /** Client name for auth (displayed during authorization) */
  clientName?: string;
  /** Custom key storage (must be provided by platform-specific package) */
  keyStorage: KeyStorage;
  /** Storage provider for blob handling (optional, but required for blob tools) */
  storage?: StorageProvider;
  /** Default prefix for output blobs */
  outputPrefix?: string;
}

/**
 * AWP Manager
 *
 * Central manager for multiple AWP endpoints. Provides:
 * - Endpoint registration with automatic namespacing
 * - Aggregated skill and tool discovery
 * - Prefixed tool calling with automatic routing
 */
export class AwpManager {
  private endpoints = new Map<string, RegisteredEndpoint>();
  private hashRegistry = new HashRegistry();
  private keyStorage: KeyStorage;
  private clientName: string;
  private storage?: StorageProvider;
  private outputPrefix?: string;

  constructor(options: AwpManagerOptions) {
    this.clientName = options.clientName ?? "AWP Agent";
    this.keyStorage = options.keyStorage;
    this.storage = options.storage;
    this.outputPrefix = options.outputPrefix;
  }

  /**
   * Register an AWP endpoint
   * @param url - The endpoint URL
   * @param alias - Optional display alias
   * @returns The registered endpoint info
   */
  async registerEndpoint(url: string, alias?: string): Promise<RegisteredEndpoint> {
    // Normalize URL
    const normalizedUrl = url.replace(/\/$/, "");

    // Check if already registered
    const existingHash = this.hashRegistry.getHash(normalizedUrl);
    if (existingHash && this.endpoints.has(existingHash)) {
      return this.endpoints.get(existingHash)!;
    }

    // Generate unique hash
    const endpointId = await this.hashRegistry.getOrCreate(normalizedUrl);

    // Create auth instance
    const auth = new AwpAuth({
      clientName: this.clientName,
      keyStorage: this.keyStorage,
    });

    // Check if we have a valid key
    const isAuthenticated = await auth.hasValidKey(normalizedUrl);

    // Create client with storage if available
    const client = new AwpClient({
      endpoint: normalizedUrl,
      auth,
      storage: this.storage,
      outputPrefix: this.outputPrefix,
    });

    const registered: RegisteredEndpoint = {
      endpointId,
      url: normalizedUrl,
      alias,
      client,
      auth,
      isAuthenticated,
    };

    this.endpoints.set(endpointId, registered);
    return registered;
  }

  /**
   * Unregister an endpoint
   * @param endpointId - The endpoint ID to unregister
   */
  unregisterEndpoint(endpointId: string): boolean {
    const endpoint = this.endpoints.get(endpointId);
    if (endpoint) {
      this.hashRegistry.remove(endpoint.url);
      this.endpoints.delete(endpointId);
      return true;
    }
    return false;
  }

  /**
   * Get all registered endpoints
   */
  getEndpoints(): RegisteredEndpoint[] {
    return Array.from(this.endpoints.values());
  }

  /**
   * Get endpoint by ID
   */
  getEndpoint(endpointId: string): RegisteredEndpoint | undefined {
    return this.endpoints.get(endpointId);
  }

  /**
   * Get endpoint by URL
   */
  getEndpointByUrl(url: string): RegisteredEndpoint | undefined {
    const normalizedUrl = url.replace(/\/$/, "");
    const hash = this.hashRegistry.getHash(normalizedUrl);
    return hash ? this.endpoints.get(hash) : undefined;
  }

  /**
   * List all skills from all endpoints
   */
  async listAllSkills(): Promise<SkillInfo[]> {
    const allSkills: SkillInfo[] = [];

    for (const endpoint of this.endpoints.values()) {
      try {
        const skills = await this.listSkillsForEndpoint(endpoint.endpointId);
        allSkills.push(...skills);
      } catch (error) {
        console.warn(`Failed to list skills for endpoint ${endpoint.endpointId}:`, error);
      }
    }

    return allSkills;
  }

  /**
   * List skills for a specific endpoint
   */
  async listSkillsForEndpoint(endpointId: string): Promise<SkillInfo[]> {
    const endpoint = this.endpoints.get(endpointId);
    if (!endpoint) {
      throw new Error(`Endpoint not found: ${endpointId}`);
    }

    // Use JSON-RPC to call skills/list
    const response = await this.sendRpcRequest(endpoint, "skills/list");
    const skillsMap = response as SkillsListResponse;

    return Object.entries(skillsMap).map(([skillName, skill]) => ({
      endpointId,
      skillName,
      fullId: `${endpointId}:${skillName}`,
      url: skill.url,
      frontmatter: skill.frontmatter,
    }));
  }

  /**
   * List all tools from all endpoints with prefixed names
   */
  async listAllTools(): Promise<PrefixedTool[]> {
    const allTools: PrefixedTool[] = [];

    for (const endpoint of this.endpoints.values()) {
      try {
        const tools = await this.listToolsForEndpoint(endpoint.endpointId);
        allTools.push(...tools);
      } catch (error) {
        console.warn(`Failed to list tools for endpoint ${endpoint.endpointId}:`, error);
      }
    }

    return allTools;
  }

  /**
   * List tools for a specific endpoint with prefixed names
   */
  async listToolsForEndpoint(endpointId: string): Promise<PrefixedTool[]> {
    const endpoint = this.endpoints.get(endpointId);
    if (!endpoint) {
      throw new Error(`Endpoint not found: ${endpointId}`);
    }

    const response = await endpoint.client.listTools();

    return response.tools.map((schema) => ({
      endpointId,
      originalName: schema.name,
      prefixedName: `${endpointId}:${schema.name}`,
      schema,
    }));
  }

  /**
   * Call a tool by its prefixed name
   * @param prefixedName - Tool name in format `${endpointId}:${toolName}`
   * @param args - Tool arguments
   */
  async callTool<TOutput = unknown, TBlobs = Record<string, unknown>>(
    prefixedName: string,
    args: Record<string, unknown>
  ): Promise<ToolCallResult<TOutput, TBlobs>> {
    console.log(`[AwpManager] callTool: ${prefixedName}`, args);
    const { endpointId, toolName } = this.parsePrefixedName(prefixedName);

    const endpoint = this.endpoints.get(endpointId);
    if (!endpoint) {
      console.error(`[AwpManager] Endpoint not found: ${endpointId}`);
      throw new Error(`Endpoint not found: ${endpointId}`);
    }

    console.log(`[AwpManager] Calling ${toolName} on endpoint ${endpoint.url}`);
    try {
      const result = await endpoint.client.callTool<TOutput, TBlobs>(toolName, args);
      console.log(`[AwpManager] Tool ${toolName} result:`, JSON.stringify(result, null, 2));
      return result;
    } catch (err) {
      console.error(`[AwpManager] Tool ${toolName} failed:`, err);
      throw err;
    }
  }

  /**
   * Parse a prefixed name into endpoint ID and tool/skill name
   */
  parsePrefixedName(prefixedName: string): { endpointId: string; toolName: string } {
    const colonIndex = prefixedName.indexOf(":");
    if (colonIndex === -1) {
      throw new Error(`Invalid prefixed name (missing colon): ${prefixedName}`);
    }

    return {
      endpointId: prefixedName.substring(0, colonIndex),
      toolName: prefixedName.substring(colonIndex + 1),
    };
  }

  /**
   * Fetch skill content (SKILL.md)
   */
  async fetchSkillContent(skillInfo: SkillInfo): Promise<string> {
    const response = await fetch(skillInfo.url);
    if (!response.ok) {
      throw new Error(`Failed to fetch skill: ${response.status} ${response.statusText}`);
    }
    return response.text();
  }

  /**
   * Update auth status for an endpoint
   */
  async updateAuthStatus(endpointId: string): Promise<boolean> {
    const endpoint = this.endpoints.get(endpointId);
    if (!endpoint) {
      return false;
    }

    const isAuthenticated = await endpoint.auth.hasValidKey(endpoint.url);
    endpoint.isAuthenticated = isAuthenticated;
    return isAuthenticated;
  }

  /**
   * Get the auth instance for an endpoint (for auth flow)
   */
  getAuth(endpointId: string): AwpAuth | undefined {
    return this.endpoints.get(endpointId)?.auth;
  }

  /**
   * Send a raw JSON-RPC request to an endpoint
   */
  private async sendRpcRequest(
    endpoint: RegisteredEndpoint,
    method: string,
    params?: Record<string, unknown>
  ): Promise<unknown> {
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method,
      params,
    });

    let headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // Sign if authenticated
    if (await endpoint.auth.hasValidKey(endpoint.url)) {
      const authHeaders = await endpoint.auth.sign(endpoint.url, "POST", endpoint.url, body);
      headers = { ...headers, ...authHeaders };
    }

    const response = await fetch(endpoint.url, {
      method: "POST",
      headers,
      body,
    });

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
    }

    const result = (await response.json()) as {
      jsonrpc: "2.0";
      id: number;
      result?: unknown;
      error?: { code: number; message: string };
    };

    if (result.error) {
      throw new Error(`RPC error: ${result.error.message}`);
    }

    return result.result;
  }
}
