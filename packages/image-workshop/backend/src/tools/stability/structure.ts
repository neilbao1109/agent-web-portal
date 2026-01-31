/**
 * Structure Tool (Stability AI)
 *
 * Generate images following the structure of an input image
 */

import { defineTool } from "@agent-web-portal/awp-server-core";
import { z } from "zod";
import { callStabilityApi, getContentType } from "../../lib/stability-api.ts";
import { getStabilityApiKey } from "../../secrets.ts";

export const structureTool = defineTool((cas) => ({
  name: "structure",
  description: "Generate a new image that follows the structural composition of the input image",
  inputSchema: z.object({
    imageKey: z.string().describe("CAS key of the reference image for structure"),
    prompt: z.string().describe("Description of what to generate following the structure"),
    negative_prompt: z.string().optional().describe("What to avoid generating"),
    control_strength: z
      .number()
      .min(0)
      .max(1)
      .default(0.7)
      .describe("How closely to follow the structure (0=loose, 1=strict)"),
    seed: z.number().optional().describe("Random seed for reproducibility"),
    output_format: z.enum(["png", "jpeg", "webp"]).default("png").describe("Output image format"),
  }),
  outputSchema: z.object({
    resultKey: z.string().describe("CAS key of the generated image"),
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
      "/v2beta/stable-image/control/structure",
      apiKey,
      {
        prompt: args.prompt,
        negative_prompt: args.negative_prompt,
        control_strength: args.control_strength,
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
