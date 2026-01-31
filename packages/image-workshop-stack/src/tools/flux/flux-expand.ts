/**
 * FLUX Expand Tool (Black Forest Labs)
 *
 * Expand/outpaint images beyond their borders
 */

import { defineTool } from "@agent-web-portal/awp-server-core";
import { z } from "zod";
import { callBflApi, getContentType, urlToBuffer } from "../../lib/bfl-api.ts";
import { getBflApiKey } from "../../secrets.ts";

export const fluxExpandTool = defineTool((cas) => ({
  name: "flux_expand",
  description: "Expand an image beyond its borders using FLUX (outpainting)",
  inputSchema: z.object({
    imageKey: z.string().describe("CAS key of the source image to expand"),
    prompt: z.string().describe("Description of what to generate in the expanded area"),
    top: z.number().min(0).max(512).default(0).describe("Pixels to expand at the top"),
    bottom: z.number().min(0).max(512).default(0).describe("Pixels to expand at the bottom"),
    left: z.number().min(0).max(512).default(0).describe("Pixels to expand on the left"),
    right: z.number().min(0).max(512).default(0).describe("Pixels to expand on the right"),
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
    image: z.object({
      "cas-node": z.string().describe("CAS key of the expanded image"),
      path: z.string().describe("Path within the CAS node"),
    }),
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

    const result = await callBflApi("/v1/flux-pro-1.1-canny-expand", apiKey, {
      prompt: args.prompt,
      image: imageBase64,
      top: args.top,
      bottom: args.bottom,
      left: args.left,
      right: args.right,
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
      image: {
        "cas-node": resultKey,
        path: ".",
      },
      metadata: {
        id: result.id,
        seed: result.seed,
      },
    };
  },
}));
