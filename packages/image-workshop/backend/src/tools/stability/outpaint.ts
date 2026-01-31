/**
 * Outpaint Tool (Stability AI)
 *
 * Extend images beyond their original borders
 */

import { defineTool } from "@agent-web-portal/awp-server-core";
import { z } from "zod";
import { callStabilityApi, getContentType } from "../../lib/stability-api.ts";
import { getStabilityApiKey } from "../../secrets.ts";

export const outpaintTool = defineTool((cas) => ({
  name: "outpaint",
  description: "Extend an image beyond its original borders (outpainting)",
  inputSchema: z.object({
    imageKey: z.string().describe("CAS key of the source image to extend"),
    prompt: z.string().optional().describe("Description of what to generate in the extended area"),
    negative_prompt: z.string().optional().describe("What to avoid generating"),
    left: z.number().min(0).max(2000).default(0).describe("Pixels to extend on the left"),
    right: z.number().min(0).max(2000).default(0).describe("Pixels to extend on the right"),
    up: z.number().min(0).max(2000).default(0).describe("Pixels to extend at the top"),
    down: z.number().min(0).max(2000).default(0).describe("Pixels to extend at the bottom"),
    creativity: z
      .number()
      .min(0)
      .max(1)
      .default(0.5)
      .describe("How creative the generation should be (0=conservative, 1=creative)"),
    seed: z.number().optional().describe("Random seed for reproducibility"),
    output_format: z.enum(["png", "jpeg", "webp"]).default("png").describe("Output image format"),
  }),
  outputSchema: z.object({
    resultKey: z.string().describe("CAS key of the extended image"),
    metadata: z.object({
      seed: z.number().describe("Seed used for generation"),
      finish_reason: z.string().describe("Reason generation finished"),
    }),
  }),
  handler: async (args) => {
    const apiKey = await getStabilityApiKey();

    // Read input image from CAS
    const imageHandle = await cas.openFile(args.imageKey);
    const imageData = await imageHandle.bytes();

    const response = await callStabilityApi(
      "/v2beta/stable-image/edit/outpaint",
      apiKey,
      {
        prompt: args.prompt,
        negative_prompt: args.negative_prompt,
        left: args.left,
        right: args.right,
        up: args.up,
        down: args.down,
        creativity: args.creativity,
        seed: args.seed,
      },
      {
        image: { buffer: imageData, filename: "image.png" },
      },
      args.output_format
    );

    // Decode base64 image and write to CAS
    const outputBuffer = Uint8Array.from(Buffer.from(response.image, "base64"));
    const contentType = getContentType(args.output_format);
    const resultKey = await cas.putFile(outputBuffer, contentType);

    return {
      resultKey,
      metadata: {
        seed: response.seed,
        finish_reason: response.finishReason,
      },
    };
  },
}));
