/**
 * FLUX Kontext Tool (Black Forest Labs)
 *
 * Context-aware image editing and transformation
 */

import { defineTool } from "@agent-web-portal/awp-server-core";
import { z } from "zod";
import { callBflApi, getContentType, urlToBuffer } from "../../lib/bfl-api.ts";
import { getBflApiKey } from "../../secrets.ts";

export const fluxKontextTool = defineTool((cas) => ({
  name: "flux_kontext",
  description:
    "Transform an image using context-aware editing with FLUX Kontext. Perfect for style transfer, object replacement, and scene modification.",
  inputSchema: z.object({
    imageKey: z.string().describe("CAS key of the source image to transform"),
    prompt: z.string().describe("Description of the desired transformation or output"),
    prompt_upsampling: z
      .boolean()
      .default(false)
      .describe("Whether to enhance the prompt with more details"),
    safety_tolerance: z
      .number()
      .min(0)
      .max(6)
      .default(2)
      .describe("Safety filter tolerance (0=strict, 6=permissive)"),
    seed: z.number().optional().describe("Random seed for reproducibility"),
    output_format: z.enum(["png", "jpeg"]).default("png").describe("Output image format"),
  }),
  outputSchema: z.object({
    resultKey: z.string().describe("CAS key of the transformed image"),
    metadata: z.object({
      id: z.string().describe("Task ID from BFL API"),
      seed: z.number().optional().describe("Seed used for generation"),
    }),
  }),
  handler: async (args) => {
    const apiKey = await getBflApiKey();

    // Read input image from CAS
    const imageHandle = await cas.openFile(args.imageKey);
    const imageData = await imageHandle.bytes();
    const imageBase64 = Buffer.from(imageData).toString("base64");

    const result = await callBflApi("/v1/flux-kontext-pro", apiKey, {
      prompt: args.prompt,
      image: imageBase64,
      prompt_upsampling: args.prompt_upsampling,
      safety_tolerance: args.safety_tolerance,
      seed: args.seed,
      output_format: args.output_format,
    });

    // Fetch and store result
    const outputBuffer = await urlToBuffer(result.imageUrl);
    const contentType = getContentType(args.output_format);
    const resultKey = await cas.putFile(outputBuffer, contentType);

    return {
      resultKey,
      metadata: {
        id: result.id,
        seed: result.seed,
      },
    };
  },
}));
