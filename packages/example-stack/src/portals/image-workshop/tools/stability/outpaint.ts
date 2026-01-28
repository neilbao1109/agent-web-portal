/**
 * Outpaint Tool (Stability AI)
 *
 * Extend images beyond their original boundaries
 */

import { defineTool, inputBlob, outputBlob } from "@agent-web-portal/core";
import { z } from "zod";
import { callStabilityApi, getContentType } from "../../lib/stability-api.ts";
import { getStabilityApiKey } from "../../secrets.ts";

export const outpaintTool = defineTool({
  name: "outpaint",
  description: "Extend an image beyond its original boundaries in any direction",

  input: {
    image: inputBlob({ mimeType: "image/*", description: "Source image to extend" }),
    prompt: z.string().optional().describe("Description of content to generate in extended areas"),
    negative_prompt: z.string().optional().describe("What to avoid generating"),
    left: z.number().min(0).max(2000).default(0).describe("Pixels to extend on the left"),
    right: z.number().min(0).max(2000).default(0).describe("Pixels to extend on the right"),
    up: z.number().min(0).max(2000).default(0).describe("Pixels to extend upward"),
    down: z.number().min(0).max(2000).default(0).describe("Pixels to extend downward"),
    creativity: z
      .number()
      .min(0)
      .max(1)
      .default(0.5)
      .describe("How creative the generation should be (0=conservative, 1=creative)"),
    seed: z.number().optional().describe("Random seed for reproducibility"),
    output_format: z.enum(["png", "jpeg", "webp"]).default("png").describe("Output image format"),
  },

  output: {
    image: outputBlob({ accept: "image/png", description: "Extended image" }),
    metadata: z.object({
      seed: z.number().describe("Seed used for generation"),
      finish_reason: z.string().describe("Reason generation finished"),
    }),
  },

  handler: async (args, context) => {
    const apiKey = await getStabilityApiKey();

    // Fetch input blob
    const imageResponse = await fetch(context.blobs.input.image);
    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());

    const response = await callStabilityApi(
      "/v2beta/stable-image/edit/outpaint",
      apiKey,
      {
        prompt: args.prompt,
        negative_prompt: args.negative_prompt,
        left: args.left,
        right: args.right,
        up: args.up,
        down: args.down,
        creativity: args.creativity,
        seed: args.seed,
      },
      {
        image: { buffer: imageBuffer, filename: "image.png" },
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
