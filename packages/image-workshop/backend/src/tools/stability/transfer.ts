/**
 * Style Transfer Tool (Stability AI)
 *
 * Transfer the style from one image to another
 */

import { defineTool } from "@agent-web-portal/awp-server-core";
import { z } from "zod";
import { callStabilityApi, getContentType } from "../../lib/stability-api.ts";
import { getStabilityApiKey } from "../../secrets.ts";

export const transferTool = defineTool((cas) => ({
  name: "transfer",
  description: "Transfer the artistic style from a style reference image to a content image",
  inputSchema: z.object({
    imageKey: z.string().describe("CAS key of the content image (what to stylize)"),
    styleKey: z.string().describe("CAS key of the style reference image (the style to apply)"),
    prompt: z.string().optional().describe("Additional description to guide the style transfer"),
    negative_prompt: z.string().optional().describe("What to avoid in the result"),
    fidelity: z
      .number()
      .min(0)
      .max(1)
      .default(0.5)
      .describe("How much to preserve the original content (0=more style, 1=more content)"),
    seed: z.number().optional().describe("Random seed for reproducibility"),
    output_format: z.enum(["png", "jpeg", "webp"]).default("png").describe("Output image format"),
  }),
  outputSchema: z.object({
    resultKey: z.string().describe("CAS key of the style-transferred image"),
    metadata: z.object({
      seed: z.number().describe("Seed used for generation"),
      finish_reason: z.string().describe("Reason generation finished"),
    }),
  }),
  handler: async (args) => {
    const apiKey = await getStabilityApiKey();

    // Read input images from CAS
    const [imageHandle, styleHandle] = await Promise.all([
      cas.openFile(args.imageKey),
      cas.openFile(args.styleKey),
    ]);

    const [imageData, styleData] = await Promise.all([imageHandle.bytes(), styleHandle.bytes()]);

    const response = await callStabilityApi(
      "/v2beta/stable-image/control/style",
      apiKey,
      {
        prompt: args.prompt ?? "",
        negative_prompt: args.negative_prompt,
        fidelity: args.fidelity,
        seed: args.seed,
      },
      {
        image: { buffer: imageData, filename: "image.png" },
        style_image: { buffer: styleData, filename: "style.png" },
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
