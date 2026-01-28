/**
 * Schema Transform Utilities
 *
 * Functions for transforming AWP tool schemas between Tool-facing and LLM-facing formats.
 */

import type { BlobDescriptors, McpToolSchema } from "@agent-web-portal/core";

/**
 * Blob schema information for a tool
 */
export interface BlobSchemaInfo {
  /** Input blob field names */
  inputBlobs: string[];
  /** Output blob field names */
  outputBlobs: string[];
  /** Blob descriptors from _awp.blob */
  blobDescriptors?: BlobDescriptors;
}

/**
 * Extract blob schema info from a tool's _awp extension
 */
export function extractBlobSchemaInfo(tool: McpToolSchema): BlobSchemaInfo {
  const awpBlob = tool._awp?.blob;
  if (!awpBlob) {
    return { inputBlobs: [], outputBlobs: [] };
  }

  return {
    inputBlobs: Object.keys(awpBlob.input || {}),
    outputBlobs: Object.keys(awpBlob.output || {}),
    blobDescriptors: awpBlob,
  };
}

/**
 * Transform Tool-facing schema to LLM-facing schema
 *
 * Tool-facing (what the tool handler receives):
 * - Input blobs: { url: string, contentType?: string }
 * - Output blobs: { url: string, accept?: string }
 *
 * LLM-facing (what the LLM sees/provides):
 * - Input blobs: { uri: string, contentType?: string }
 * - Output blobs: { accept?: string, prefix?: string }
 *
 * @param schema - The Tool-facing inputSchema
 * @param blobInfo - Blob schema information
 * @returns The LLM-facing schema
 */
export function transformSchemaToLlmFacing(
  schema: Record<string, unknown>,
  blobInfo: BlobSchemaInfo
): Record<string, unknown> {
  const allBlobFields = [...blobInfo.inputBlobs, ...blobInfo.outputBlobs];
  if (allBlobFields.length === 0) {
    return schema;
  }

  const newSchema = JSON.parse(JSON.stringify(schema)) as {
    properties?: Record<string, unknown>;
    required?: string[];
  };

  if (newSchema.properties && typeof newSchema.properties === "object") {
    // Transform input blob fields: url -> uri
    for (const field of blobInfo.inputBlobs) {
      const description = blobInfo.blobDescriptors?.input?.[field];
      newSchema.properties[field] = {
        type: "object",
        description: description ?? `Input blob: ${field}`,
        properties: {
          uri: {
            type: "string",
            format: "uri",
            description:
              "Resource identifier for the blob (e.g., s3://bucket/key)",
          },
          contentType: {
            type: "string",
            description: "MIME type of the blob content",
          },
        },
        required: ["uri"],
      };
    }

    // Transform output blob fields: remove url, add accept and prefix
    for (const field of blobInfo.outputBlobs) {
      const description = blobInfo.blobDescriptors?.output?.[field];
      newSchema.properties[field] = {
        type: "object",
        description: description ?? `Output blob: ${field}`,
        properties: {
          accept: {
            type: "string",
            description: "Accepted MIME types for the output",
          },
          prefix: {
            type: "string",
            description:
              "Storage prefix/path hint for where to allocate the blob (optional)",
          },
        },
      };
    }
  }

  // Update required array: output blob fields are not required for LLM
  if (Array.isArray(newSchema.required)) {
    newSchema.required = newSchema.required.filter(
      (field: string) => !blobInfo.outputBlobs.includes(field)
    );
    if (newSchema.required.length === 0) {
      delete newSchema.required;
    }
  }

  return newSchema;
}

/**
 * Transform a complete tool schema to LLM-facing format
 *
 * @param tool - The Tool-facing McpToolSchema
 * @returns The LLM-facing schema object
 */
export function transformToolToLlmFacing(
  tool: McpToolSchema
): Record<string, unknown> {
  const blobInfo = extractBlobSchemaInfo(tool);
  return transformSchemaToLlmFacing(tool.inputSchema, blobInfo);
}
