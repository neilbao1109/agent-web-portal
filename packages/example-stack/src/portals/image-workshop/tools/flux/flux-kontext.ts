/**
 * FLUX Kontext Tool (Black Forest Labs)
 *
 * Context-aware image editing and transformation
 */

import { defineTool, inputBlob, outputBlob } from "@agent-web-portal/core";
import { z } from "zod";
import { callBflApi, getContentType } from "../../lib/bfl-api.ts";
import { getBflApiKey } from "../../secrets.ts";

export const fluxKontextTool = defineTool({
  name: "flux_kontext",
  description: "Edit or transform an image using context-aware FLUX Kontext model",

  input: {
    image: inputBlob({ mimeType: "image/*", description: "Source image to edit" }),
    prompt: z.string().describe("Description of the edit or transformation to apply"),
    aspect_ratio: z
      .enum(["1:1", "16:9", "9:16", "4:3", "3:4", "21:9", "9:21"])
      .default("1:1")
      .describe("Output aspect ratio"),
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
    image: outputBlob({ accept: "image/png", description: "Edited image" }),
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

    const result = await callBflApi("/v1/flux-kontext-pro", apiKey, {
      prompt: args.prompt,
      input_image: imageBase64,
      aspect_ratio: args.aspect_ratio,
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
