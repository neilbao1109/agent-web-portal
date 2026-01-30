/**
 * AWP Server Core - defineTool API
 *
 * Provides a wrapper function pattern for defining tools with CAS integration.
 * The CAS client is injected via a factory function, allowing buffered writes.
 */

import type { ZodSchema, z } from "zod";
import type {
  DefinedTool,
  IBufferedCasClient,
  ToolDefinitionOptions,
  ToolHandler,
} from "./types.ts";

/**
 * Tool factory function type
 *
 * Receives a BufferedCasClient and returns the tool definition options.
 * This pattern allows the handler to capture the CAS client in its closure.
 */
export type ToolFactory<
  TInputSchema extends ZodSchema = ZodSchema,
  TOutputSchema extends ZodSchema = ZodSchema,
> = (cas: IBufferedCasClient) => ToolDefinitionOptions<TInputSchema, TOutputSchema>;

/**
 * Define a tool with CAS integration using the wrapper function pattern.
 *
 * The factory function receives a BufferedCasClient that can be used within
 * the handler. All CAS writes are buffered until the tool execution completes.
 *
 * @param factory - Function that receives CAS client and returns tool definition
 * @returns A DefinedTool ready for registration with ServerPortal
 *
 * @example
 * ```typescript
 * import { defineTool } from "@agent-web-portal/awp-server-core";
 * import { z } from "zod";
 *
 * const processImage = defineTool((cas) => ({
 *   name: "process-image",
 *   description: "Process an image and return the result",
 *   inputSchema: z.object({
 *     imageKey: z.string().describe("CAS key of the input image"),
 *     width: z.number().describe("Target width in pixels"),
 *   }),
 *   outputSchema: z.object({
 *     resultKey: z.string().describe("CAS key of the processed image"),
 *   }),
 *   handler: async (args) => {
 *     // Read input from CAS
 *     const file = await cas.openFile(args.imageKey);
 *     const data = await file.bytes();
 *
 *     // Process the image...
 *     const result = await resizeImage(data, args.width);
 *
 *     // Write output to CAS (buffered until tool completes)
 *     const resultKey = await cas.putFile(result, "image/png");
 *
 *     return { resultKey };
 *   },
 * }));
 * ```
 */
export function defineTool<TInputSchema extends ZodSchema, TOutputSchema extends ZodSchema>(
  factory: ToolFactory<TInputSchema, TOutputSchema>
): DefinedTool<TInputSchema, TOutputSchema> {
  // Create a dummy CAS client for metadata extraction
  const dummyCas = createDummyCasClient();

  // Call factory to get metadata
  const options = factory(dummyCas);

  return {
    name: options.name,
    description: options.description,
    inputSchema: options.inputSchema,
    outputSchema: options.outputSchema,
    createHandler: (
      cas: IBufferedCasClient
    ): ToolHandler<z.infer<TInputSchema>, z.infer<TOutputSchema>> => {
      // Call the factory with the real CAS client to create the actual handler
      const toolOptions = factory(cas);
      return toolOptions.handler;
    },
  };
}

/**
 * Define a simple tool without CAS integration.
 *
 * Use this for tools that don't need to read or write CAS blobs.
 *
 * @param options - Tool definition options
 * @returns A DefinedTool ready for registration
 *
 * @example
 * ```typescript
 * import { defineSimpleTool } from "@agent-web-portal/awp-server-core";
 * import { z } from "zod";
 *
 * const greet = defineSimpleTool({
 *   name: "greet",
 *   description: "Greet a user",
 *   inputSchema: z.object({ name: z.string() }),
 *   outputSchema: z.object({ message: z.string() }),
 *   handler: async ({ name }) => ({ message: `Hello, ${name}!` }),
 * });
 * ```
 */
export function defineSimpleTool<TInputSchema extends ZodSchema, TOutputSchema extends ZodSchema>(
  options: ToolDefinitionOptions<TInputSchema, TOutputSchema>
): DefinedTool<TInputSchema, TOutputSchema> {
  return {
    name: options.name,
    description: options.description,
    inputSchema: options.inputSchema,
    outputSchema: options.outputSchema,
    createHandler: (
      _cas: IBufferedCasClient
    ): ToolHandler<z.infer<TInputSchema>, z.infer<TOutputSchema>> => {
      // Simple tools don't use CAS, just return the handler
      return options.handler;
    },
  };
}

/**
 * Create a dummy CAS client for metadata extraction
 *
 * This is used during tool definition to extract name, description, and schemas
 * without needing a real CAS context.
 */
function createDummyCasClient(): IBufferedCasClient {
  const notAvailable = () => {
    throw new Error("CAS client is not available during tool definition");
  };

  return {
    openFile: notAvailable,
    getNode: notAvailable,
    getRawNode: notAvailable,
    putFile: notAvailable,
    putCollection: notAvailable,
    commit: notAvailable,
    discard: () => {},
    hasPendingWrites: () => false,
    getPendingKeys: () => [],
  };
}
