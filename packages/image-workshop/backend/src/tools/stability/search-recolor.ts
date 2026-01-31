/**
 * Search and Recolor Tool (Stability AI)
 *
 * Find objects and change their color
 */

import { defineTool } from "@agent-web-portal/awp-server-core";
import { z } from "zod";
import { callStabilityApi, getContentType } from "../../lib/stability-api.ts";
import { getStabilityApiKey } from "../../secrets.ts";

export const searchRecolorTool = defineTool((cas) => ({
  name: "search_recolor",
  description: "Find objects in an image and change their color",
  inputSchema: z.object({
    imageKey: z.string().describe("CAS key of the source image"),
    select_prompt: z.string().describe("Description of the object to find and recolor"),
    prompt: z.string().describe("Description of the new color or appearance"),
    negative_prompt: z.string().optional().describe("What to avoid generating"),
    grow_mask: z.number().min(0).max(100).default(3).describe("Pixels to expand the detected mask by"),
    seed: z.number().optional().describe("Random seed for reproducibility"),
    output_format: z.enum(["png", "jpeg", "webp"]).default("png").describe("Output image format"),
  }),
  outputSchema: z.object({
    resultKey: z.string().describe("CAS key of the result image with recolored content"),
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
      "/v2beta/stable-image/edit/search-and-recolor",
      apiKey,
      {
        select_prompt: args.select_prompt,
        prompt: args.prompt,
        negative_prompt: args.negative_prompt,
        grow_mask: args.grow_mask,
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
