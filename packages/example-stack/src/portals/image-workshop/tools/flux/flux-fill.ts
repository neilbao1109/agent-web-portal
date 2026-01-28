/**
 * FLUX Fill Tool (Black Forest Labs)
 *
 * Inpainting/filling masked regions
 */

import { defineTool, inputBlob, outputBlob } from "@agent-web-portal/core";
import { z } from "zod";
import { callBflApi, getContentType } from "../../lib/bfl-api.ts";
import { getBflApiKey } from "../../secrets.ts";

export const fluxFillTool = defineTool({
  name: "flux_fill",
  description: "Fill masked regions of an image with AI-generated content using FLUX",

  input: {
    image: inputBlob({ mimeType: "image/*", description: "Source image to edit" }),
    mask: inputBlob({
      mimeType: "image/*",
      description: "Mask image (white areas will be filled)",
    }),
    prompt: z.string().describe("Description of what to generate in the masked area"),
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
    image: outputBlob({ accept: "image/png", description: "Image with filled regions" }),
    metadata: z.object({
      id: z.string().describe("Task ID from BFL API"),
      seed: z.number().optional().describe("Seed used for generation"),
    }),
  },

  handler: async (args, context) => {
    const apiKey = await getBflApiKey();

    // Fetch input blobs and convert to base64
    const [imageResponse, maskResponse] = await Promise.all([
      fetch(context.blobs.input.image),
      fetch(context.blobs.input.mask),
    ]);

    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
    const maskBuffer = Buffer.from(await maskResponse.arrayBuffer());

    const imageBase64 = imageBuffer.toString("base64");
    const maskBase64 = maskBuffer.toString("base64");

    const result = await callBflApi("/v1/flux-pro-1.1-fill", apiKey, {
      prompt: args.prompt,
      image: imageBase64,
      mask: maskBase64,
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
