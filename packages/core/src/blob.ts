import { type ZodTypeAny, z } from "zod";

// ============================================================================
// Blob Types
// ============================================================================

/**
 * Blob direction type
 */
export type BlobDirection = "input" | "output";

/**
 * Options for defining an input blob field
 */
export interface InputBlobOptions {
  /** Human-readable description of the blob field */
  description: string;
  /** Expected MIME type of the blob (e.g., "image/png", "application/pdf") */
  mimeType?: string;
  /** Maximum size in bytes */
  maxSize?: number;
}

/**
 * Options for defining an output blob field
 */
export interface OutputBlobOptions {
  /** Human-readable description of the blob field */
  description: string;
  /** Default accepted MIME type for the output (e.g., "image/png") */
  accept?: string;
}

/**
 * Legacy options for defining a blob field (backward compatibility)
 * @deprecated Use inputBlob() or outputBlob() instead
 */
export interface BlobOptions {
  /** Expected MIME type of the blob (e.g., "image/png", "application/pdf") */
  mimeType?: string;
  /** Maximum size in bytes */
  maxSize?: number;
  /** Human-readable description */
  description?: string;
}

/**
 * Metadata stored on a blob schema
 */
export interface BlobMetadata {
  /** Direction of the blob: input (read) or output (write) */
  direction: BlobDirection;
  /** Human-readable description */
  description: string;
  /** Expected MIME type for input blobs / Default accept type for output blobs */
  mimeType?: string;
  /** Maximum size in bytes (for input blobs) */
  maxSize?: number;
}

/**
 * Symbol used to mark a Zod schema as a blob
 */
export const AWP_BLOB_MARKER = Symbol.for("awp-blob");

/**
 * Extended Zod string schema with blob marker
 */
export type BlobSchema = z.ZodString & {
  [AWP_BLOB_MARKER]: BlobMetadata;
};

// ============================================================================
// Blob Helper Functions
// ============================================================================

/**
 * Create an input blob schema for use in tool input definitions.
 *
 * Input blobs represent binary data that the tool will READ. The caller provides
 * a presigned GET URL for the tool to download the data.
 *
 * For Tools (MCP clients): The input parameter schema will be { url: string, contentType?: string }
 * For LLMs (AWP clients): The input parameter schema will be { uri: string, contentType?: string }
 *
 * @param options - Configuration for the input blob
 * @returns A Zod string schema marked as an input blob
 *
 * @example
 * ```typescript
 * import { inputBlob, defineTool } from "@agent-web-portal/core";
 *
 * const tool = defineTool({
 *   input: {
 *     document: inputBlob({ description: "PDF document to process", mimeType: "application/pdf" }),
 *   },
 *   // ...
 * });
 * ```
 */
export function inputBlob(options: InputBlobOptions): BlobSchema {
  const schema = z.string();

  // Attach blob metadata using the marker symbol
  (schema as BlobSchema)[AWP_BLOB_MARKER] = {
    direction: "input",
    description: options.description,
    mimeType: options.mimeType,
    maxSize: options.maxSize,
  };

  return schema as BlobSchema;
}

/**
 * Create an output blob schema for use in tool output definitions.
 *
 * Output blobs represent binary data that the tool will WRITE. The caller provides
 * a presigned PUT URL for the tool to upload the data.
 *
 * For Tools (MCP clients): The input parameter schema will be { url: string, accept?: string }
 *                          The output result includes { contentType?: string }
 * For LLMs (AWP clients): The input parameter schema will be { accept?: string }
 *                         The output result includes { uri: string, contentType?: string }
 *
 * @param options - Configuration for the output blob
 * @returns A Zod string schema marked as an output blob
 *
 * @example
 * ```typescript
 * import { outputBlob, defineTool } from "@agent-web-portal/core";
 *
 * const tool = defineTool({
 *   output: {
 *     thumbnail: outputBlob({ description: "Generated thumbnail", accept: "image/png" }),
 *   },
 *   // ...
 * });
 * ```
 */
export function outputBlob(options: OutputBlobOptions): BlobSchema {
  const schema = z.string();

  // Attach blob metadata using the marker symbol
  (schema as BlobSchema)[AWP_BLOB_MARKER] = {
    direction: "output",
    description: options.description,
    mimeType: options.accept,
  };

  return schema as BlobSchema;
}

/**
 * Create a blob schema for use in tool input/output definitions.
 *
 * @deprecated Use inputBlob() for input blobs or outputBlob() for output blobs instead.
 * This function is kept for backward compatibility but defaults to input blob behavior.
 *
 * Blob fields represent binary data that should be transferred via presigned URLs
 * rather than inline in the JSON payload. This is essential for:
 * - Large files (images, PDFs, etc.)
 * - Binary data that LLMs cannot interpret
 * - Data that needs access control
 *
 * @param options - Optional configuration for the blob
 * @returns A Zod string schema marked as a blob
 *
 * @example
 * ```typescript
 * import { blob } from "@agent-web-portal/core";
 *
 * const inputSchema = z.object({
 *   document: blob({ mimeType: "application/pdf" }),
 *   options: z.object({ quality: z.number() }),
 * });
 * ```
 */
export function blob(options?: BlobOptions): BlobSchema {
  const schema = z.string();

  // Attach blob metadata using the marker symbol
  // For backward compatibility, default to "input" direction
  (schema as BlobSchema)[AWP_BLOB_MARKER] = {
    direction: "input" as BlobDirection,
    description: options?.description ?? "",
    mimeType: options?.mimeType,
    maxSize: options?.maxSize,
  };

  return schema as BlobSchema;
}

/**
 * Check if a Zod schema is a blob schema
 *
 * @param schema - The schema to check
 * @returns True if the schema is marked as a blob
 */
export function isBlob(schema: unknown): schema is BlobSchema {
  return (
    typeof schema === "object" &&
    schema !== null &&
    AWP_BLOB_MARKER in schema &&
    typeof (schema as BlobSchema)[AWP_BLOB_MARKER] === "object"
  );
}

/**
 * Get blob metadata from a schema
 *
 * @param schema - The schema to extract metadata from
 * @returns Blob metadata if the schema is a blob, undefined otherwise
 */
export function getBlobMetadata(schema: unknown): BlobMetadata | undefined {
  if (isBlob(schema)) {
    return schema[AWP_BLOB_MARKER];
  }
  return undefined;
}

/**
 * Extract blob field names from a Zod object schema
 *
 * @param schema - A Zod object schema
 * @returns Array of field names that are blobs
 */
export function extractBlobFields(schema: ZodTypeAny): string[] {
  const def = (schema as any)._def;

  // Handle ZodObject
  if (def?.typeName === "ZodObject") {
    const shape = def.shape();
    const blobFields: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      // Check if the field itself is a blob
      if (isBlob(value)) {
        blobFields.push(key);
        continue;
      }

      // Check if it's wrapped in ZodOptional or ZodDefault
      const innerDef = (value as any)?._def;
      if (innerDef?.typeName === "ZodOptional" || innerDef?.typeName === "ZodDefault") {
        if (isBlob(innerDef.innerType)) {
          blobFields.push(key);
        }
      }
    }

    return blobFields;
  }

  return [];
}

/**
 * Blob field information extracted from input/output schemas
 */
export interface ToolBlobInfo {
  /** Field names in input schema that are blobs */
  inputBlobs: string[];
  /** Field names in output schema that are blobs */
  outputBlobs: string[];
}

/**
 * Detailed blob descriptor map (for _awp.blob extension)
 */
export interface BlobDescriptorMap {
  [fieldName: string]: {
    kind: "input" | "output";
    description: string;
  };
}

/**
 * Get the raw Zod schema for a potentially wrapped blob (handles optional, default, etc.)
 */
function getUnwrappedBlobSchema(value: unknown): BlobSchema | null {
  if (isBlob(value)) {
    return value as BlobSchema;
  }

  // Check if it's wrapped in ZodOptional or ZodDefault
  const innerDef = (value as any)?._def;
  if (innerDef?.typeName === "ZodOptional" || innerDef?.typeName === "ZodDefault") {
    if (isBlob(innerDef.innerType)) {
      return innerDef.innerType as BlobSchema;
    }
  }

  return null;
}

/**
 * Extract blob descriptors from a Zod object schema
 * Returns a map of field names to their blob type and description
 *
 * @param schema - A Zod object schema
 * @returns Object mapping field names to { type, description }
 */
export function extractBlobDescriptors(schema: ZodTypeAny): BlobDescriptorMap {
  const def = (schema as any)._def;

  // Handle ZodObject
  if (def?.typeName === "ZodObject") {
    const shape = def.shape();
    const descriptors: BlobDescriptorMap = {};

    for (const [key, value] of Object.entries(shape)) {
      const blobSchema = getUnwrappedBlobSchema(value);
      if (blobSchema) {
        const metadata = getBlobMetadata(blobSchema);
        if (metadata) {
          descriptors[key] = {
            kind: metadata.direction,
            description: metadata.description,
          };
        }
      }
    }

    return descriptors;
  }

  return {};
}

/**
 * Extract blob fields by direction from a Zod object schema
 *
 * @param schema - A Zod object schema
 * @param direction - Filter by direction ('input' or 'output')
 * @returns Array of field names that are blobs of the specified direction
 */
export function extractBlobFieldsByDirection(
  schema: ZodTypeAny,
  direction: BlobDirection
): string[] {
  const def = (schema as any)._def;

  // Handle ZodObject
  if (def?.typeName === "ZodObject") {
    const shape = def.shape();
    const blobFields: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      const blobSchema = getUnwrappedBlobSchema(value);
      if (blobSchema) {
        const metadata = getBlobMetadata(blobSchema);
        if (metadata?.direction === direction) {
          blobFields.push(key);
        }
      }
    }

    return blobFields;
  }

  return [];
}

/**
 * Extract blob information from input and output schemas
 *
 * @param inputSchema - The input Zod schema
 * @param outputSchema - The output Zod schema
 * @returns Object containing arrays of blob field names
 */
export function extractToolBlobInfo(
  inputSchema: ZodTypeAny,
  outputSchema: ZodTypeAny
): ToolBlobInfo {
  return {
    inputBlobs: extractBlobFields(inputSchema),
    outputBlobs: extractBlobFields(outputSchema),
  };
}

/**
 * Extract combined blob descriptors from both input and output schemas
 * This generates the format needed for _awp.blob extension
 *
 * @param inputSchema - The input Zod schema
 * @param outputSchema - The output Zod schema
 * @returns Combined blob descriptor map
 */
export function extractCombinedBlobDescriptors(
  inputSchema: ZodTypeAny,
  outputSchema: ZodTypeAny
): BlobDescriptorMap {
  // Start with input blobs from input schema
  const inputBlobs = extractBlobDescriptors(inputSchema);

  // Get output blobs from output schema
  const outputBlobs = extractBlobDescriptors(outputSchema);

  // In the output schema, blobs should be marked as 'output' direction
  // (using outputBlob() or having direction: 'output')
  // We need to merge them, with output schema descriptors overriding
  return { ...inputBlobs, ...outputBlobs };
}
