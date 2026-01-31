/**
 * FLUX Flex Tool (Black Forest Labs)
 *
 * Flexible text-to-image generation with aspect ratio control
 */

import { defineTool } from "@agent-web-portal/awp-server-core";
import { z } from "zod";
import { callBflApi, getContentType, urlToBuffer } from "../../lib/bfl-api.ts";
import { getBflApiKey } from "../../secrets.ts";

export const fluxFlexTool = defineTool((cas) => ({
  name: "flux_flex",
  description: "Generate an image with flexible aspect ratio control using FLUX Dev",
  inputSchema: z.object({
    prompt: z.string().describe("Text prompt describing the image to generate"),
    width: z.number().min(256).max(1440).default(1024).describe("Image width"),
    height: z.number().min(256).max(1440).default(1024).describe("Image height"),
    guidance: z
      .number()
      .min(1)
      .max(10)
      .default(3.5)
      .describe("How closely to follow the prompt"),
    num_steps: z.number().min(1).max(50).default(28).describe("Number of inference steps"),
    seed: z.number().optional().describe("Random seed for reproducibility"),
    output_format: z.enum(["png", "jpeg"]).default("png").describe("Output image format"),
  }),
  outputSchema: z.object({
    resultKey: z.string().describe("CAS key of the generated image"),
    metadata: z.object({
      id: z.string().describe("Task ID from BFL API"),
      seed: z.number().optional().describe("Seed used for generation"),
    }),
  }),
  handler: async (args) => {
    const apiKey = await getBflApiKey();

    const result = await callBflApi("/v1/flux-dev", apiKey, {
      prompt: args.prompt,
      width: args.width,
      height: args.height,
      guidance: args.guidance,
      num_steps: args.num_steps,
      seed: args.seed,
      output_format: args.output_format,
    });

    // Fetch the generated image
    const imageBuffer = await urlToBuffer(result.imageUrl);
    const contentType = getContentType(args.output_format);

    // Write to CAS
    const resultKey = await cas.putFile(imageBuffer, contentType);

    return {
      resultKey,
      metadata: {
        id: result.id,
        seed: result.seed,
      },
    };
  },
}));
