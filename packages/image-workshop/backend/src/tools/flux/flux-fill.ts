/**
 * FLUX Fill Tool (Black Forest Labs)
 *
 * Inpainting/filling masked regions
 */

import { defineTool } from "@agent-web-portal/awp-server-core";
import { z } from "zod";
import { callBflApi, getContentType, urlToBuffer } from "../../lib/bfl-api.ts";
import { getBflApiKey } from "../../secrets.ts";

export const fluxFillTool = defineTool((cas) => ({
  name: "flux_fill",
  description: "Fill masked regions of an image with AI-generated content using FLUX",
  inputSchema: z.object({
    imageKey: z.string().describe("CAS key of the source image to edit"),
    maskKey: z.string().describe("CAS key of the mask image (white areas will be filled)"),
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
  }),
  outputSchema: z.object({
    resultKey: z.string().describe("CAS key of the image with filled regions"),
    metadata: z.object({
      id: z.string().describe("Task ID from BFL API"),
      seed: z.number().optional().describe("Seed used for generation"),
    }),
  }),
  handler: async (args) => {
    const apiKey = await getBflApiKey();

    // Read input images from CAS
    const [imageHandle, maskHandle] = await Promise.all([
      cas.openFile(args.imageKey),
      cas.openFile(args.maskKey),
    ]);

    const [imageData, maskData] = await Promise.all([imageHandle.bytes(), maskHandle.bytes()]);

    // Convert to base64 for BFL API
    const imageBase64 = Buffer.from(imageData).toString("base64");
    const maskBase64 = Buffer.from(maskData).toString("base64");

    const result = await callBflApi("/v1/flux-pro-1.1-fill", apiKey, {
      prompt: args.prompt,
      image: imageBase64,
      mask: maskBase64,
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
