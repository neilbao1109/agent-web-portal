/**
 * Blob Interceptor
 *
 * Intercepts tool calls to automatically handle blob field transformations
 * between permanent URIs and presigned URLs.
 */

import type { BlobContext } from "@agent-web-portal/core";
import type { StorageProvider } from "./storage/types.ts";

/**
 * Blob schema information for a tool
 */
export interface ToolBlobSchema {
  /** Input blob field names */
  inputBlobs: string[];
  /** Output blob field names */
  outputBlobs: string[];
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
 * Blob interceptor
 *
 * Handles the transformation of blob fields in tool call arguments and results:
 * - Before call: Generates presigned URLs for input and output blobs
 * - After call: Fills in permanent URIs for output blobs
 */
export class BlobInterceptor {
  private storage: StorageProvider;
  private outputPrefix: string;

  constructor(options: BlobInterceptorOptions) {
    this.storage = options.storage;
    this.outputPrefix = options.outputPrefix ?? "output";
  }

  /**
   * Prepare blob context for a tool call
   *
   * @param args - The tool arguments
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
      const uri = args[field];
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
   * Fill in output blob URIs in the result
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
