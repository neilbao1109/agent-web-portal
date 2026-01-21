/**
 * Lambda Handler Builder for Agent Web Portal
 *
 * Provides a fluent API for creating Lambda handlers with integrated
 * tool and skill registration.
 */

import type { ZodSchema } from "zod";
import {
  createAgentWebPortal,
  type AgentWebPortalOptions,
  type SkillRegistrationOptions,
  type ToolRegistrationOptions,
} from "@agent-web-portal/core";
import { createLambdaHandler } from "./handler.ts";
import type {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  LambdaAdapterOptions,
  LambdaContext,
  SkillsConfig,
} from "./types.ts";

/**
 * Lambda Handler type
 */
export type LambdaHandler = (
  event: APIGatewayProxyEvent,
  context: LambdaContext
) => Promise<APIGatewayProxyResult>;

/**
 * Options for creating a Lambda handler builder
 */
export interface LambdaHandlerBuilderOptions extends AgentWebPortalOptions {
  /** S3 client region (defaults to AWS_REGION env) */
  region?: string;
  /** Presigned URL expiration in seconds (default: 3600) */
  presignedUrlExpiration?: number;
}

/**
 * Lambda Handler Builder
 *
 * A fluent builder for creating AWS Lambda handlers with Agent Web Portal.
 * Automatically handles skill registration from SkillsConfig.
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
 *     { name: "greeting-skill", s3Key: "skills/greeting-skill.zip", frontmatter: { "allowed-tools": ["greet"] } },
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
export class LambdaHandlerBuilder {
  private portalOptions: AgentWebPortalOptions;
  private lambdaOptions: Omit<LambdaAdapterOptions, "skillsConfig" | "skillsConfigPath">;
  private tools: Array<{
    name: string;
    options: ToolRegistrationOptions<ZodSchema, ZodSchema>;
  }> = [];
  private skills: Record<string, SkillRegistrationOptions> = {};
  private skillsConfig?: SkillsConfig;

  constructor(options: LambdaHandlerBuilderOptions = {}) {
    this.portalOptions = {
      name: options.name ?? "agent-web-portal",
      version: options.version ?? "1.0.0",
      description: options.description ?? "Agent Web Portal Lambda",
    };
    this.lambdaOptions = {
      region: options.region,
      presignedUrlExpiration: options.presignedUrlExpiration,
    };
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
    this.tools.push({
      name,
      // biome-ignore lint/suspicious/noExplicitAny: Required for type erasure in builder pattern
      options: options as any,
    });
    return this;
  }

  /**
   * Register multiple skills at once
   *
   * @param skills - Map of skill names to skill definitions
   * @returns this - for method chaining
   */
  registerSkills(skills: Record<string, SkillRegistrationOptions>): this {
    this.skills = { ...this.skills, ...skills };
    return this;
  }

  /**
   * Set skills configuration from skills.yaml
   *
   * This will automatically register skills from the config and
   * configure S3 presigned URL generation for skill downloads.
   *
   * @param config - Skills configuration object
   * @returns this - for method chaining
   */
  withSkillsConfig(config: SkillsConfig): this {
    this.skillsConfig = config;

    // Auto-register skills from config
    const skillsFromConfig: Record<string, SkillRegistrationOptions> = {};
    for (const skill of config.skills) {
      skillsFromConfig[skill.name] = {
        url: `/skills/${skill.name}`,
        frontmatter: skill.frontmatter,
      };
    }
    this.skills = { ...this.skills, ...skillsFromConfig };

    return this;
  }

  /**
   * Build the Lambda handler
   *
   * Creates the Agent Web Portal instance and wraps it in a Lambda handler.
   *
   * @returns Lambda handler function
   */
  build(): LambdaHandler {
    // Build the portal
    const builder = createAgentWebPortal(this.portalOptions);

    // Register all tools
    for (const { name, options } of this.tools) {
      builder.registerTool(name, options);
    }

    // Register all skills
    if (Object.keys(this.skills).length > 0) {
      builder.registerSkills(this.skills);
    }

    const portal = builder.build();

    // Create and return the Lambda handler
    return createLambdaHandler(portal, {
      ...this.lambdaOptions,
      skillsConfig: this.skillsConfig,
    });
  }
}

/**
 * Create a new Lambda handler builder
 *
 * @param options - Optional configuration
 * @returns LambdaHandlerBuilder instance
 *
 * @example
 * ```typescript
 * import { createAgentWebPortalHandler } from "@agent-web-portal/aws-lambda";
 *
 * export const handler = createAgentWebPortalHandler({ name: "my-portal" })
 *   .registerTool("greet", { ... })
 *   .withSkillsConfig(skillsConfig)
 *   .build();
 * ```
 */
export function createAgentWebPortalHandler(
  options?: LambdaHandlerBuilderOptions
): LambdaHandlerBuilder {
  return new LambdaHandlerBuilder(options);
}
