/**
 * Blob Interceptor
 *
 * Intercepts tool calls to automatically handle blob field transformations
 * between LLM-facing URIs and Tool-facing presigned URLs.
 *
 * LLM-facing (what the LLM provides/receives):
 * - Input blob: { uri: string, contentType?: string }
 * - Output blob input: { accept?: string }
 * - Output blob result: { uri: string, contentType?: string }
 *
 * Tool-facing (what the Tool receives/returns):
 * - Input blob: { url: string, contentType?: string }
 * - Output blob input: { url: string, accept?: string }
 * - Output blob result: { contentType?: string }
 */

import type {
  BlobContext,
  BlobFieldDescriptor,
  LlmBlobInputValue,
  LlmBlobOutputInputValue,
  LlmBlobOutputResultValue,
  ToolBlobInputValue,
  ToolBlobOutputInputValue,
  ToolBlobOutputResultValue,
} from "@agent-web-portal/core";
import type { StorageProvider } from "./storage/types.ts";

/**
 * Blob schema information for a tool (new format)
 */
export interface ToolBlobSchema {
  /** Input blob field names */
  inputBlobs: string[];
  /** Output blob field names */
  outputBlobs: string[];
  /** Blob descriptors from _awp.blob (optional, for enhanced handling) */
  blobDescriptors?: Record<string, BlobFieldDescriptor>;
}

/**
 * Options for blob interceptor
 */
export interface BlobInterceptorOptions {
  /** Storage provider for generating presigned URLs */
  storage: StorageProvider;
  /** Default prefix for output blobs */
  outputPrefix?: string;
}

/**
 * Extended blob context with content type information
 */
export interface ExtendedBlobContext extends BlobContext {
  /** Content types for input blobs (from LLM args) */
  inputContentTypes: Record<string, string | undefined>;
  /** Accept types for output blobs (from LLM args) */
  outputAcceptTypes: Record<string, string | undefined>;
}

/**
 * Blob interceptor
 *
 * Handles the transformation of blob fields in tool call arguments and results:
 * - Before call: Transforms LLM-facing args to Tool-facing args with presigned URLs
 * - After call: Transforms Tool-facing results to LLM-facing results with URIs
 */
export class BlobInterceptor {
  private storage: StorageProvider;
  private outputPrefix: string;

  constructor(options: BlobInterceptorOptions) {
    this.storage = options.storage;
    this.outputPrefix = options.outputPrefix ?? "output";
  }

  /**
   * Prepare blob context and transform LLM args to Tool args
   *
   * LLM provides:
   * - Input blob: { uri: "s3://...", contentType?: "image/png" }
   * - Output blob: { accept?: "image/png" }
   *
   * Tool receives:
   * - Input blob: { url: "https://presigned...", contentType?: "image/png" }
   * - Output blob: { url: "https://presigned-put...", accept?: "image/png" }
   *
   * @param llmArgs - The LLM-provided arguments
   * @param blobSchema - The blob schema for the tool
   * @returns Object containing the transformed args and blob context
   */
  async transformLlmArgsToToolArgs(
    llmArgs: Record<string, unknown>,
    blobSchema: ToolBlobSchema
  ): Promise<{
    toolArgs: Record<string, unknown>;
    blobContext: ExtendedBlobContext;
  }> {
    const toolArgs = { ...llmArgs };
    const inputPresigned: Record<string, string> = {};
    const outputPresigned: Record<string, string> = {};
    const outputUri: Record<string, string> = {};
    const inputContentTypes: Record<string, string | undefined> = {};
    const outputAcceptTypes: Record<string, string | undefined> = {};

    // Transform input blob fields: { uri, contentType? } -> { url, contentType? }
    for (const field of blobSchema.inputBlobs) {
      const llmValue = llmArgs[field] as LlmBlobInputValue | string | undefined;

      if (llmValue) {
        // Support both old format (string uri) and new format (object with uri)
        const uri = typeof llmValue === "string" ? llmValue : llmValue.uri;
        const contentType = typeof llmValue === "object" ? llmValue.contentType : undefined;

        if (uri && this.storage.canHandle(uri)) {
          const presignedUrl = await this.storage.generatePresignedGetUrl(uri, {
            contentType,
          });
          inputPresigned[field] = presignedUrl;
          inputContentTypes[field] = contentType;

          // Transform to tool-facing format
          const toolValue: ToolBlobInputValue = { url: presignedUrl };
          if (contentType) {
            toolValue.contentType = contentType;
          }
          toolArgs[field] = toolValue;
        }
      }
    }

    // Transform output blob fields: { accept? } -> { url, accept? }
    for (const field of blobSchema.outputBlobs) {
      const llmValue = llmArgs[field] as LlmBlobOutputInputValue | undefined;
      const acceptType = llmValue?.accept;

      // Generate presigned PUT URL for output
      const { uri, presignedUrl } = await this.storage.generatePresignedPutUrl(
        `${this.outputPrefix}/${field}`,
        { contentType: acceptType }
      );
      outputPresigned[field] = presignedUrl;
      outputUri[field] = uri;
      outputAcceptTypes[field] = acceptType;

      // Transform to tool-facing format
      const toolValue: ToolBlobOutputInputValue = { url: presignedUrl };
      if (acceptType) {
        toolValue.accept = acceptType;
      }
      toolArgs[field] = toolValue;
    }

    return {
      toolArgs,
      blobContext: {
        input: inputPresigned,
        output: outputPresigned,
        outputUri,
        inputContentTypes,
        outputAcceptTypes,
      },
    };
  }

  /**
   * Transform Tool result to LLM result
   *
   * Tool returns:
   * - Output blob: { contentType?: "image/png" }
   *
   * LLM receives:
   * - Output blob: { uri: "s3://...", contentType?: "image/png" }
   *
   * @param toolResult - The tool's result
   * @param blobContext - The blob context used for the call
   * @param blobSchema - The blob schema for the tool
   * @returns The LLM-facing result with output blob URIs
   */
  transformToolResultToLlmResult(
    toolResult: Record<string, unknown>,
    blobContext: ExtendedBlobContext,
    blobSchema: ToolBlobSchema
  ): Record<string, unknown> {
    const llmResult = { ...toolResult };

    for (const field of blobSchema.outputBlobs) {
      const toolValue = toolResult[field] as ToolBlobOutputResultValue | undefined;
      const uri = blobContext.outputUri[field];

      if (uri) {
        // Build LLM-facing output blob result
        const llmValue: LlmBlobOutputResultValue = { uri };
        if (toolValue?.contentType) {
          llmValue.contentType = toolValue.contentType;
        }
        llmResult[field] = llmValue;
      }
    }

    return llmResult;
  }

  /**
   * Legacy method: Prepare blob context for a tool call
   * @deprecated Use transformLlmArgsToToolArgs instead
   *
   * @param args - The tool arguments (expecting string URIs)
   * @param blobSchema - The blob schema for the tool
   * @returns Object containing the blob context
   */
  async prepareBlobContext(
    args: Record<string, unknown>,
    blobSchema: ToolBlobSchema
  ): Promise<BlobContext> {
    const inputPresigned: Record<string, string> = {};
    const outputPresigned: Record<string, string> = {};
    const outputUri: Record<string, string> = {};

    // Generate presigned GET URLs for input blobs
    for (const field of blobSchema.inputBlobs) {
      const value = args[field];
      // Handle both old format (string) and new format (object with uri)
      const uri = typeof value === "string" ? value : (value as any)?.uri;
      if (typeof uri === "string" && this.storage.canHandle(uri)) {
        inputPresigned[field] = await this.storage.generatePresignedGetUrl(uri);
      }
    }

    // Generate presigned PUT URLs for output blobs
    for (const field of blobSchema.outputBlobs) {
      const { uri, presignedUrl } = await this.storage.generatePresignedPutUrl(
        `${this.outputPrefix}/${field}`
      );
      outputPresigned[field] = presignedUrl;
      outputUri[field] = uri;
    }

    return {
      input: inputPresigned,
      output: outputPresigned,
      outputUri,
    };
  }

  /**
   * Legacy method: Fill in output blob URIs in the result
   * @deprecated Use transformToolResultToLlmResult instead
   *
   * @param result - The tool result
   * @param blobContext - The blob context used for the call
   * @param blobSchema - The blob schema for the tool
   * @returns The result with output blob fields filled in
   */
  fillOutputBlobUris(
    result: Record<string, unknown>,
    blobContext: BlobContext,
    blobSchema: ToolBlobSchema
  ): Record<string, unknown> {
    const filledResult = { ...result };

    for (const field of blobSchema.outputBlobs) {
      if (blobContext.outputUri[field]) {
        filledResult[field] = blobContext.outputUri[field];
      }
    }

    return filledResult;
  }
}
