/**
 * CAS Blob Interceptor
 *
 * Intercepts tool calls to automatically handle CAS blob field transformations.
 * Generates tickets and injects #cas-endpoint into blob references.
 *
 * LLM-facing (what the LLM provides):
 * - Input blob: { "cas-node": "sha256:...", path?: "." }
 * - Output blob: { accept?: "image/png" }
 *
 * Tool-facing (what the Tool receives):
 * - Input blob: { "#cas-endpoint": "https://...", "cas-node": "sha256:...", path?: "." }
 * - Output blob: { "#cas-endpoint": "https://...", "cas-node": "", accept?: "image/png" }
 */

import type {
  CasBlobRefInput,
  CasBlobRefOutput,
  CasBlobRefWithEndpoint,
  CreateTicketResponse,
  ToolBlobSchema,
} from "./types.ts";

/**
 * Options for CAS interceptor
 */
export interface CasInterceptorOptions {
  /** CAS API endpoint */
  casEndpoint: string;
  /** Function to create a ticket */
  createTicket: (scope: string | string[], writable: boolean) => Promise<CreateTicketResponse>;
}

/**
 * Context for CAS blob handling
 */
export interface CasBlobContext {
  /** Input blob tickets (field -> ticket endpoint) */
  inputTickets: Record<string, string>;
  /** Output blob ticket (single ticket for all outputs) */
  outputTicket?: {
    endpoint: string;
    scope: string[];
  };
  /** Output accept types (field -> accept) */
  outputAcceptTypes: Record<string, string | undefined>;
}

/**
 * CAS Blob Interceptor
 *
 * Handles the transformation of blob fields in tool call arguments and results
 * for CAS-based blob exchange.
 */
export class CasInterceptor {
  private createTicket: (
    scope: string | string[],
    writable: boolean
  ) => Promise<CreateTicketResponse>;

  constructor(options: CasInterceptorOptions) {
    this.createTicket = options.createTicket;
  }

  /**
   * Transform LLM args to Tool args with CAS endpoints
   *
   * LLM provides:
   * - Input blob: { "cas-node": "sha256:...", path?: "." }
   * - Output blob: { accept?: "image/png" }
   *
   * Tool receives:
   * - Input blob: { "#cas-endpoint": "https://...", "cas-node": "sha256:...", path: "." }
   * - Output blob: { "#cas-endpoint": "https://...", accept?: "image/png" }
   */
  async transformLlmArgsToToolArgs(
    llmArgs: Record<string, unknown>,
    blobSchema: ToolBlobSchema
  ): Promise<{
    toolArgs: Record<string, unknown>;
    blobContext: CasBlobContext;
  }> {
    const toolArgs = { ...llmArgs };
    const inputTickets: Record<string, string> = {};
    const outputAcceptTypes: Record<string, string | undefined> = {};

    // Collect input blob scopes
    const inputScopes: string[] = [];
    for (const field of blobSchema.inputBlobs) {
      const llmValue = llmArgs[field] as CasBlobRefInput | undefined;
      if (llmValue?.["cas-node"]) {
        inputScopes.push(llmValue["cas-node"]);
      }
    }

    // Create a single read ticket for all input blobs (if any)
    let inputTicketEndpoint: string | undefined;
    if (inputScopes.length > 0) {
      const ticket = await this.createTicket(inputScopes, false);
      inputTicketEndpoint = ticket.endpoint;
    }

    // Transform input blob fields
    for (const field of blobSchema.inputBlobs) {
      const llmValue = llmArgs[field] as CasBlobRefInput | undefined;
      if (llmValue?.["cas-node"] && inputTicketEndpoint) {
        inputTickets[field] = inputTicketEndpoint;

        // Transform to tool-facing format with #cas-endpoint
        const toolValue: CasBlobRefWithEndpoint = {
          "#cas-endpoint": inputTicketEndpoint,
          "cas-node": llmValue["cas-node"],
          path: llmValue.path ?? ".",
        };
        toolArgs[field] = toolValue;
      }
    }

    // Create a write ticket for output blobs (if any)
    let outputTicket: { endpoint: string; scope: string[] } | undefined;
    if (blobSchema.outputBlobs.length > 0) {
      // Create a writable ticket with empty scope (will be filled on write)
      const ticket = await this.createTicket([], true);
      outputTicket = {
        endpoint: ticket.endpoint,
        scope: [],
      };

      // Transform output blob fields
      for (const field of blobSchema.outputBlobs) {
        const llmValue = llmArgs[field] as { accept?: string } | undefined;
        const acceptType = llmValue?.accept;
        outputAcceptTypes[field] = acceptType;

        // Transform to tool-facing format with #cas-endpoint
        const toolValue: Record<string, unknown> = {
          "#cas-endpoint": ticket.endpoint,
        };
        if (acceptType) {
          toolValue.accept = acceptType;
        }
        toolArgs[field] = toolValue;
      }
    }

    return {
      toolArgs,
      blobContext: {
        inputTickets,
        outputTicket,
        outputAcceptTypes,
      },
    };
  }

  /**
   * Transform Tool result to LLM result
   *
   * Tool returns:
   * - Output blob: { "cas-node": "sha256:...", path?: "." }
   *
   * LLM receives:
   * - Output blob: { "cas-node": "sha256:...", path?: "." }
   */
  transformToolResultToLlmResult(
    toolResult: Record<string, unknown>,
    _blobContext: CasBlobContext,
    blobSchema: ToolBlobSchema
  ): {
    output: Record<string, unknown>;
    blobs: Record<string, CasBlobRefOutput>;
  } {
    const output: Record<string, unknown> = {};
    const blobs: Record<string, CasBlobRefOutput> = {};

    for (const [key, value] of Object.entries(toolResult)) {
      if (blobSchema.outputBlobs.includes(key)) {
        // Extract blob reference from result
        const blobValue = value as CasBlobRefOutput | undefined;
        if (blobValue?.["cas-node"]) {
          blobs[key] = {
            "cas-node": blobValue["cas-node"],
            path: blobValue.path,
          };
        }
      } else {
        // Copy non-blob fields to output
        output[key] = value;
      }
    }

    return { output, blobs };
  }
}
