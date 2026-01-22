import type { ZodObject, ZodRawShape, z } from "zod";
import { type BlobSchema, extractToolBlobInfo } from "./blob.ts";

// ============================================================================
// Type Utilities for Blob Handling
// ============================================================================

/**
 * Extract keys from a Zod object shape that are blob schemas
 */
type ExtractBlobKeys<T extends ZodRawShape> = {
  [K in keyof T]: T[K] extends BlobSchema ? K : never;
}[keyof T];

/**
 * Extract keys from a Zod object shape that are NOT blob schemas
 */
type ExtractNonBlobKeys<T extends ZodRawShape> = {
  [K in keyof T]: T[K] extends BlobSchema ? never : K;
}[keyof T];

/**
 * Omit blob fields from a Zod inferred type
 */
type OmitBlobFields<T extends ZodRawShape> = {
  [K in ExtractNonBlobKeys<T>]: z.infer<T[K]>;
};

/**
 * Extract only blob fields as a record of strings (presigned URLs)
 */
type BlobFieldsAsUrls<T extends ZodRawShape> = {
  [K in ExtractBlobKeys<T>]: string;
};

// ============================================================================
// Handler Context Types
// ============================================================================

/**
 * Context passed to tool handlers containing blob presigned URLs
 */
export interface ToolHandlerContext<
  TInputBlobs extends Record<string, string> = Record<string, string>,
  TOutputBlobs extends Record<string, string> = Record<string, string>,
> {
  /**
   * Blob presigned URLs for reading input and writing output
   */
  blobs: {
    /** Presigned GET URLs for input blobs (read-only) */
    input: TInputBlobs;
    /** Presigned PUT URLs for output blobs (write-only) */
    output: TOutputBlobs;
  };
}

/**
 * Tool handler function type with blob context
 */
export type ToolHandlerWithContext<
  TArgs = unknown,
  TReturn = unknown,
  TInputBlobs extends Record<string, string> = Record<string, string>,
  TOutputBlobs extends Record<string, string> = Record<string, string>,
> = (args: TArgs, context: ToolHandlerContext<TInputBlobs, TOutputBlobs>) => Promise<TReturn>;

// ============================================================================
// Define Tool Types
// ============================================================================

/**
 * Options for defineTool when input/output have blob fields
 */
export interface DefineToolOptions<
  TInputShape extends ZodRawShape,
  TOutputShape extends ZodRawShape,
> {
  /** Tool name */
  name: string;
  /** Human-readable description */
  description?: string;
  /** Input schema shape (use blob() for blob fields) */
  input: TInputShape;
  /** Output schema shape (use blob() for blob fields) */
  output: TOutputShape;
  /**
   * Handler function that receives:
   * - args: Input with blob fields excluded (blobs are accessed via context)
   * - context: Contains presigned URLs for blob fields
   *
   * Returns: Output with blob fields excluded (framework fills them automatically)
   */
  handler: ToolHandlerWithContext<
    OmitBlobFields<TInputShape>,
    OmitBlobFields<TOutputShape>,
    BlobFieldsAsUrls<TInputShape>,
    BlobFieldsAsUrls<TOutputShape>
  >;
}

/**
 * Result of defineTool containing everything needed for registration
 */
export interface DefinedTool<TInputShape extends ZodRawShape, TOutputShape extends ZodRawShape> {
  /** Tool name */
  name: string;
  /** Human-readable description */
  description?: string;
  /** Full input schema (including blob fields as strings) */
  inputSchema: ZodObject<TInputShape>;
  /** Full output schema (including blob fields as strings) */
  outputSchema: ZodObject<TOutputShape>;
  /** Handler function with context */
  handler: ToolHandlerWithContext<
    OmitBlobFields<TInputShape>,
    OmitBlobFields<TOutputShape>,
    BlobFieldsAsUrls<TInputShape>,
    BlobFieldsAsUrls<TOutputShape>
  >;
  /** Blob field information extracted from schemas */
  blobInfo: {
    inputBlobs: string[];
    outputBlobs: string[];
  };
}

// ============================================================================
// Define Tool Function
// ============================================================================

/**
 * Define a tool with automatic blob handling.
 *
 * This is the recommended way to define tools that work with binary data.
 * The function automatically:
 * - Extracts blob fields from input/output schemas
 * - Computes proper TypeScript types for the handler
 * - Provides typed context with presigned URLs for blob access
 *
 * @param options - Tool definition options
 * @returns A defined tool ready for registration
 *
 * @example
 * ```typescript
 * import { defineTool, blob } from "@agent-web-portal/core";
 * import { z } from "zod";
 *
 * const processDocument = defineTool({
 *   name: "process-document",
 *   description: "Process a PDF document and generate a thumbnail",
 *
 *   input: {
 *     document: blob({ mimeType: "application/pdf" }),
 *     options: z.object({ quality: z.number() }),
 *   },
 *
 *   output: {
 *     thumbnail: blob({ mimeType: "image/png" }),
 *     metadata: z.object({ pageCount: z.number() }),
 *   },
 *
 *   handler: async (args, context) => {
 *     // args.options is available (non-blob input)
 *     // args.document is NOT here - access via context.blobs.input.document
 *
 *     const pdfData = await fetch(context.blobs.input.document);
 *     const thumbnail = await generateThumbnail(pdfData, args.options.quality);
 *
 *     // Write output blob via presigned PUT URL
 *     await fetch(context.blobs.output.thumbnail, {
 *       method: "PUT",
 *       body: thumbnail,
 *     });
 *
 *     // Return only non-blob fields
 *     return { metadata: { pageCount: 10 } };
 *   },
 * });
 *
 * // Register with the portal
 * portal.registerDefinedTool(processDocument);
 * ```
 */
export function defineTool<TInputShape extends ZodRawShape, TOutputShape extends ZodRawShape>(
  options: DefineToolOptions<TInputShape, TOutputShape>
): DefinedTool<TInputShape, TOutputShape> {
  // Import z dynamically to avoid circular dependencies
  const { z } = require("zod");

  // Build the full schemas from the shapes
  const inputSchema = z.object(options.input) as ZodObject<TInputShape>;
  const outputSchema = z.object(options.output) as ZodObject<TOutputShape>;

  // Extract blob information
  const blobInfo = extractToolBlobInfo(inputSchema, outputSchema);

  return {
    name: options.name,
    description: options.description,
    inputSchema,
    outputSchema,
    handler: options.handler,
    blobInfo,
  };
}

/**
 * Check if a defined tool has any blob fields
 */
export function hasBlobs(tool: DefinedTool<ZodRawShape, ZodRawShape>): boolean {
  return tool.blobInfo.inputBlobs.length > 0 || tool.blobInfo.outputBlobs.length > 0;
}

/**
 * Create an empty blob context (for tools without blobs or testing)
 */
export function createEmptyBlobContext(): ToolHandlerContext {
  return {
    blobs: {
      input: {},
      output: {},
    },
  };
}
