/**
 * @agent-web-portal/awp-server-lambda
 *
 * AWS Lambda adapter for AWP Server.
 *
 * @example
 * ```typescript
 * import { createServerHandler, defineTool } from "@agent-web-portal/awp-server-lambda";
 * import { z } from "zod";
 *
 * const processImage = defineTool((cas) => ({
 *   name: "process-image",
 *   description: "Process an image",
 *   inputSchema: z.object({
 *     imageKey: z.string().describe("CAS key of the input image"),
 *     width: z.number().describe("Target width"),
 *   }),
 *   outputSchema: z.object({
 *     resultKey: z.string().describe("CAS key of the processed image"),
 *   }),
 *   handler: async ({ imageKey, width }) => {
 *     // Read input from CAS
 *     const file = await cas.openFile(imageKey);
 *     const data = await file.bytes();
 *
 *     // Process the image...
 *     const result = await resizeImage(data, width);
 *
 *     // Write output to CAS (buffered until tool completes)
 *     const resultKey = await cas.putFile(result, "image/png");
 *
 *     return { resultKey };
 *   },
 * }));
 *
 * export const handler = createServerHandler({ name: "image-processor" })
 *   .withCasConfig({
 *     endpoint: process.env.CAS_ENDPOINT!,
 *     agentToken: process.env.CAS_AGENT_TOKEN!,
 *   })
 *   .registerTool(processImage)
 *   .build();
 * ```
 */

// Re-export from awp-server-core for convenience
export {
  // Types
  type CasConfig,
  // Errors
  CasNotConfiguredError,
  CommitError,
  type DefinedTool,
  defineSimpleTool,
  // Tool definition
  defineTool,
  type IBufferedCasClient,
  type ServerPortalConfig,
  TicketCreationError,
  type ToolDefinitionOptions,
  type ToolFactory,
  type ToolHandler,
  ToolNotFoundError,
  ToolValidationError,
} from "@agent-web-portal/awp-server-core";

// Builder
export { createServerHandler, LambdaHandlerBuilder } from "./builder.ts";

// Handler
export { createLambdaHandler } from "./handler.ts";

// Types
export type {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  LambdaCasConfig,
  LambdaContext,
  LambdaHandler,
  LambdaHandlerBuilderOptions,
  LambdaHandlerBuildOptions,
  LambdaRouteHandler,
} from "./types.ts";
