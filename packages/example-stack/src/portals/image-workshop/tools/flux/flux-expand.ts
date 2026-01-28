/**
 * FLUX Expand Tool (Black Forest Labs)
 *
 * Outpainting/extending images beyond boundaries
 */

import { defineTool, inputBlob, outputBlob } from "@agent-web-portal/core";
import { z } from "zod";
import { callBflApi, getContentType } from "../../lib/bfl-api.ts";
import { getBflApiKey } from "../../secrets.ts";

export const fluxExpandTool = defineTool({
  name: "flux_expand",
  description: "Extend an image beyond its boundaries in any direction using FLUX",

  input: {
    image: inputBlob({ mimeType: "image/*", description: "Source image to extend" }),
    prompt: z.string().optional().describe("Description of content to generate in extended areas"),
    top: z.number().min(0).max(1024).default(0).describe("Pixels to extend upward"),
    bottom: z.number().min(0).max(1024).default(0).describe("Pixels to extend downward"),
    left: z.number().min(0).max(1024).default(0).describe("Pixels to extend on the left"),
    right: z.number().min(0).max(1024).default(0).describe("Pixels to extend on the right"),
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
  },

  output: {
    image: outputBlob({ accept: "image/png", description: "Extended image" }),
    metadata: z.object({
      id: z.string().describe("Task ID from BFL API"),
      seed: z.number().optional().describe("Seed used for generation"),
    }),
  },

  handler: async (args, context) => {
    const apiKey = await getBflApiKey();

    // Fetch input blob and convert to base64
    const imageResponse = await fetch(context.blobs.input.image);
    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
    const imageBase64 = imageBuffer.toString("base64");

    const result = await callBflApi("/v1/flux-pro-1.1-canny-expand", apiKey, {
      prompt: args.prompt || "Seamlessly extend the image",
      image: imageBase64,
      expand_top: args.top,
      expand_bottom: args.bottom,
      expand_left: args.left,
      expand_right: args.right,
      prompt_upsampling: args.prompt_upsampling,
      safety_tolerance: args.safety_tolerance,
      seed: args.seed,
      output_format: args.output_format,
    });

    // Fetch the generated image from URL
    const resultResponse = await fetch(result.imageUrl);
    const outputBuffer = Buffer.from(await resultResponse.arrayBuffer());
    const contentType = getContentType(args.output_format);

    await fetch(context.blobs.output.image, {
      method: "PUT",
      body: outputBuffer,
      headers: { "Content-Type": contentType },
    });

    return {
      metadata: {
        id: result.id,
        seed: result.seed,
      },
    };
  },
});
