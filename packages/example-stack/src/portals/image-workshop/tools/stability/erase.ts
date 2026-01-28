/**
 * Erase Tool (Stability AI)
 *
 * Remove unwanted objects from images using mask-based erasing
 */

import { defineTool, inputBlob, outputBlob } from "@agent-web-portal/core";
import { z } from "zod";
import { callStabilityApi, getContentType } from "../../lib/stability-api.ts";
import { getStabilityApiKey } from "../../secrets.ts";

export const eraseTool = defineTool({
  name: "erase",
  description: "Remove unwanted objects from images by masking the areas to erase",

  input: {
    image: inputBlob({ mimeType: "image/*", description: "Source image to edit" }),
    mask: inputBlob({
      mimeType: "image/*",
      description: "Mask image (white areas will be erased)",
    }),
    grow_mask: z.number().min(0).max(100).default(5).describe("Pixels to expand the mask by"),
    seed: z.number().optional().describe("Random seed for reproducibility"),
    output_format: z.enum(["png", "jpeg", "webp"]).default("png").describe("Output image format"),
  },

  output: {
    image: outputBlob({ accept: "image/png", description: "Result image with erased areas" }),
    metadata: z.object({
      seed: z.number().describe("Seed used for generation"),
      finish_reason: z.string().describe("Reason generation finished"),
    }),
  },

  handler: async (args, context) => {
    const apiKey = await getStabilityApiKey();

    // Fetch input blobs
    const [imageResponse, maskResponse] = await Promise.all([
      fetch(context.blobs.input.image),
      fetch(context.blobs.input.mask),
    ]);

    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
    const maskBuffer = Buffer.from(await maskResponse.arrayBuffer());

    const response = await callStabilityApi(
      "/v2beta/stable-image/edit/erase",
      apiKey,
      {
        grow_mask: args.grow_mask,
        seed: args.seed,
      },
      {
        image: { buffer: imageBuffer, filename: "image.png" },
        mask: { buffer: maskBuffer, filename: "mask.png" },
      },
      args.output_format
    );

    // Write output blob
    const outputBuffer = Buffer.from(response.image, "base64");
    const contentType = getContentType(args.output_format);

    await fetch(context.blobs.output.image, {
      method: "PUT",
      body: outputBuffer,
      headers: { "Content-Type": contentType },
    });

    return {
      metadata: {
        seed: response.seed,
        finish_reason: response.finishReason,
      },
    };
  },
});
