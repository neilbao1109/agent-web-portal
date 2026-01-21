/**
 * @agent-web-portal/aws-lambda
 *
 * AWS Lambda adapter for Agent Web Portal
 *
 * @example
 * ```typescript
 * import { createAgentWebPortalHandler } from "@agent-web-portal/aws-lambda";
 * import { z } from "zod";
 *
 * const skillsConfig = {
 *   bucket: "my-bucket",
 *   prefix: "skills/",
 *   skills: [
 *     { name: "greeting-skill", s3Key: "greeting-skill.zip", frontmatter: { "allowed-tools": ["greet"] } },
 *   ],
 * };
 *
 * export const handler = createAgentWebPortalHandler({ name: "my-portal" })
 *   .registerTool("greet", {
 *     inputSchema: z.object({ name: z.string() }),
 *     outputSchema: z.object({ message: z.string() }),
 *     handler: async ({ name }) => ({ message: `Hello, ${name}!` }),
 *   })
 *   .withSkillsConfig(skillsConfig)
 *   .build();
 * ```
 */

// Primary API - fluent builder
export {
  createAgentWebPortalHandler,
  LambdaHandlerBuilder,
  type LambdaHandler,
  type LambdaHandlerBuilderOptions,
} from "./builder.ts";

// Low-level API - for advanced usage
export { createLambdaHandler } from "./handler.ts";

// Types
export type {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  LambdaAdapterOptions,
  LambdaContext,
  SkillConfig,
  SkillsConfig,
} from "./types.ts";
