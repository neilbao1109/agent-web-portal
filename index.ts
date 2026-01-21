/**
 * Agent Web Portal (AWP)
 *
 * An MCP-compatible, skill-focused framework that exposes site functionality
 * to AI Agents in a structured way.
 *
 * AWP = Controller + Skills + Tools
 *
 * @example
 * ```typescript
 * import { createAgentWebPortal } from "agent-web-portal";
 * import { z } from "zod";
 *
 * const portal = createAgentWebPortal({ name: "my-site" })
 *   .registerTool("search", {
 *     inputSchema: z.object({ query: z.string() }),
 *     outputSchema: z.object({ results: z.array(z.string()) }),
 *     handler: async ({ query }) => ({ results: ["result1", "result2"] }),
 *   })
 *   .registerSkill("search-skill", {
 *     url: "/skills/search.md",
 *     frontmatter: { "allowed-tools": ["search"] },
 *   })
 *   .build();
 *
 * // Use with Bun
 * Bun.serve({
 *   port: 3000,
 *   fetch: (req) => portal.handleRequest(req),
 * });
 * ```
 */

// Core exports
export {
  AgentWebPortalBuilder,
  createAgentWebPortal,
  type AgentWebPortalOptions,
} from "./src/agent-web-portal.ts";

// Type exports
export type {
  // Skill types
  SkillFrontmatter,
  SkillDefinition,
  SkillsListResponse,
  SkillRegistrationOptions,

  // Tool types
  ToolHandler,
  ToolDefinition,
  ToolRegistrationOptions,

  // MCP types
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcSuccessResponse,
  JsonRpcErrorResponse,
  McpToolSchema,
  McpToolsListResponse,
  McpToolsCallParams,
  McpToolsCallResponse,

  // HTTP types
  HttpRequest,
  HttpResponseOptions,

  // Instance type
  AgentWebPortalInstance,
} from "./src/types.ts";

// Error exports
export {
  ToolNotFoundError,
  SkillValidationError,
  ToolValidationError,
} from "./src/types.ts";

// Registry exports (for advanced usage)
export { ToolRegistry } from "./src/tool-registry.ts";
export { SkillRegistry } from "./src/skill-registry.ts";
export type { ParsedToolReference } from "./src/skill-registry.ts";

// Utility exports
export { zodToJsonSchema } from "./src/utils/zod-to-json-schema.ts";