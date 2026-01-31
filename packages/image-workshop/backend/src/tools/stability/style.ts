/**
 * Style Tool (Stability AI)
 *
 * Apply artistic styles to images
 */

import { defineTool } from "@agent-web-portal/awp-server-core";
import { z } from "zod";
import { callStabilityApi, getContentType } from "../../lib/stability-api.ts";
import { getStabilityApiKey } from "../../secrets.ts";

export const styleTool = defineTool((cas) => ({
  name: "style",
  description: "Apply an artistic style to an image while preserving its content",
  inputSchema: z.object({
    imageKey: z.string().describe("CAS key of the source image to stylize"),
    prompt: z.string().describe("Description of the style to apply"),
    negative_prompt: z.string().optional().describe("What to avoid in the stylization"),
    fidelity: z
      .number()
      .min(0)
      .max(1)
      .default(0.5)
      .describe("How much to preserve the original image (0=more style, 1=more original)"),
    seed: z.number().optional().describe("Random seed for reproducibility"),
    output_format: z.enum(["png", "jpeg", "webp"]).default("png").describe("Output image format"),
  }),
  outputSchema: z.object({
    resultKey: z.string().describe("CAS key of the stylized image"),
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
      "/v2beta/stable-image/control/style",
      apiKey,
      {
        prompt: args.prompt,
        negative_prompt: args.negative_prompt,
        fidelity: args.fidelity,
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
