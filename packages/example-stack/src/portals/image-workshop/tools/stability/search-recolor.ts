/**
 * Search & Recolor Tool (Stability AI)
 *
 * Find and recolor specific objects in images
 */

import { defineTool, inputBlob, outputBlob } from "@agent-web-portal/core";
import { z } from "zod";
import { callStabilityApi, getContentType } from "../../lib/stability-api.ts";
import { getStabilityApiKey } from "../../secrets.ts";

export const searchRecolorTool = defineTool({
  name: "search_recolor",
  description: "Find objects in an image using text and change their color",

  input: {
    image: inputBlob({ mimeType: "image/*", description: "Source image" }),
    select_prompt: z.string().describe("Description of the object to find and recolor"),
    prompt: z.string().describe("Description of the desired color/appearance"),
    negative_prompt: z.string().optional().describe("What to avoid"),
    grow_mask: z.number().min(0).max(100).default(3).describe("Pixels to expand detected area"),
    seed: z.number().optional().describe("Random seed for reproducibility"),
    output_format: z.enum(["png", "jpeg", "webp"]).default("png").describe("Output image format"),
  },

  output: {
    image: outputBlob({ accept: "image/png", description: "Image with recolored object" }),
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
      "/v2beta/stable-image/edit/search-and-recolor",
      apiKey,
      {
        select_prompt: args.select_prompt,
        prompt: args.prompt,
        negative_prompt: args.negative_prompt,
        grow_mask: args.grow_mask,
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
