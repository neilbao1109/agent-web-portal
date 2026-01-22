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
 *   .registerSkills({
 *     "search-skill": {
 *       url: "/skills/search-skill",
 *       frontmatter: { "allowed-tools": ["search"] },
 *     },
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
  type AgentWebPortalOptions,
  createAgentWebPortal,
} from "./src/agent-web-portal.ts";
// Blob exports
export {
  AWP_BLOB_MARKER,
  type BlobMetadata,
  type BlobOptions,
  type BlobSchema,
  blob,
  extractBlobFields,
  extractToolBlobInfo,
  getBlobMetadata,
  isBlob,
  type ToolBlobInfo,
} from "./src/blob.ts";
// Define tool exports
export {
  createEmptyBlobContext,
  type DefinedTool,
  type DefineToolOptions,
  defineTool,
  hasBlobs,
  type ToolHandlerContext,
  type ToolHandlerWithContext,
} from "./src/define-tool.ts";
export type { ParsedToolReference } from "./src/skill-registry.ts";
export { SkillRegistry } from "./src/skill-registry.ts";
// Registry exports (for advanced usage)
export { ToolRegistry } from "./src/tool-registry.ts";

// Type exports
export type {
  // Instance type
  AgentWebPortalInstance,
  // Blob types
  BlobContext,
  BlobFieldMetadata,
  // HTTP types
  HttpRequest,
  HttpResponseOptions,
  JsonRpcErrorResponse,
  // MCP types
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcSuccessResponse,
  McpToolSchema,
  McpToolsCallParams,
  McpToolsCallParamsWithBlob,
  McpToolsCallResponse,
  McpToolsListResponse,
  SkillDefinition,
  // Skill types
  SkillFrontmatter,
  SkillRegistrationOptions,
  SkillsListResponse,
  SkillsMap,
  ToolBlobMetadata,
  ToolDefinition,
  // Tool types
  ToolHandler,
  ToolHandlerBlobContext,
  ToolRegistrationOptions,
} from "./src/types.ts";

// Error exports
export {
  BlobContextError,
  SkillValidationError,
  ToolNotFoundError,
  ToolValidationError,
} from "./src/types.ts";

// Utility exports
export { zodToJsonSchema } from "./src/utils/zod-to-json-schema.ts";
