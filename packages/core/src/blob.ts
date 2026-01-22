import { type ZodTypeAny, z } from "zod";

// ============================================================================
// Blob Types
// ============================================================================

/**
 * Options for defining a blob field
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
  mimeType?: string;
  maxSize?: number;
  description?: string;
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
 * Create a blob schema for use in tool input/output definitions.
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
  (schema as BlobSchema)[AWP_BLOB_MARKER] = {
    mimeType: options?.mimeType,
    maxSize: options?.maxSize,
    description: options?.description,
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
