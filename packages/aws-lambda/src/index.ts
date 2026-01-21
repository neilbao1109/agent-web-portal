/**
 * @agent-web-portal/aws-lambda
 *
 * AWS Lambda adapter for Agent Web Portal
 *
 * @example
 * ```typescript
 * import { createAgentWebPortal } from "@agent-web-portal/core";
 * import { createLambdaHandler } from "@agent-web-portal/aws-lambda";
 *
 * const portal = createAgentWebPortal({ name: "my-portal" })
 *   .registerTool("greet", {
 *     inputSchema: z.object({ name: z.string() }),
 *     outputSchema: z.object({ message: z.string() }),
 *     handler: async ({ name }) => ({ message: `Hello, ${name}!` }),
 *   })
 *   .registerSkill("greeting-skill", {
 *     url: "/skills/greeting-skill",
 *     frontmatter: { "allowed-tools": ["greet"] },
 *   })
 *   .build();
 *
 * export const handler = createLambdaHandler(portal, {
 *   skillsConfigPath: "./skills.yaml",
 * });
 * ```
 */

export { createLambdaHandler } from "./handler.ts";
export type {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  LambdaAdapterOptions,
  LambdaContext,
  SkillConfig,
  SkillsConfig,
} from "./types.ts";
