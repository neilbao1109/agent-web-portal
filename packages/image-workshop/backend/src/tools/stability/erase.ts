/**
 * Erase Tool (Stability AI)
 *
 * Remove objects from images by erasing masked regions
 */

import { defineTool } from "@agent-web-portal/awp-server-core";
import { z } from "zod";
import { callStabilityApi, getContentType } from "../../lib/stability-api.ts";
import { getStabilityApiKey } from "../../secrets.ts";

export const eraseTool = defineTool((cas) => ({
  name: "erase",
  description: "Remove objects from an image by erasing the masked regions and filling with background",
  inputSchema: z.object({
    imageKey: z.string().describe("CAS key of the source image"),
    maskKey: z.string().describe("CAS key of the mask image (white areas will be erased)"),
    grow_mask: z.number().min(0).max(100).default(5).describe("Pixels to expand the mask by"),
    seed: z.number().optional().describe("Random seed for reproducibility"),
    output_format: z.enum(["png", "jpeg", "webp"]).default("png").describe("Output image format"),
  }),
  outputSchema: z.object({
    resultKey: z.string().describe("CAS key of the result image with erased content"),
    metadata: z.object({
      seed: z.number().describe("Seed used for generation"),
      finish_reason: z.string().describe("Reason generation finished"),
    }),
  }),
  handler: async (args) => {
    const apiKey = await getStabilityApiKey();

    // Read input images from CAS
    const [imageHandle, maskHandle] = await Promise.all([
      cas.openFile(args.imageKey),
      cas.openFile(args.maskKey),
    ]);

    const [imageData, maskData] = await Promise.all([imageHandle.bytes(), maskHandle.bytes()]);

    const response = await callStabilityApi(
      "/v2beta/stable-image/edit/erase",
      apiKey,
      {
        grow_mask: args.grow_mask,
        seed: args.seed,
      },
      {
        image: { buffer: imageData, filename: "image.png" },
        mask: { buffer: maskData, filename: "mask.png" },
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
