/**
 * Search & Replace Tool (Stability AI)
 *
 * Find and replace objects in images using text descriptions
 */

import { defineTool, inputBlob, outputBlob } from "@agent-web-portal/core";
import { z } from "zod";
import { callStabilityApi, getContentType } from "../../lib/stability-api.ts";
import { getStabilityApiKey } from "../../secrets.ts";

export const searchReplaceTool = defineTool({
  name: "search_replace",
  description: "Find objects in an image using text and replace them with something else",

  input: {
    image: inputBlob({ mimeType: "image/*", description: "Source image" }),
    search_prompt: z.string().describe("Description of the object to find and replace"),
    prompt: z.string().describe("Description of what to replace it with"),
    negative_prompt: z.string().optional().describe("What to avoid in the replacement"),
    grow_mask: z.number().min(0).max(100).default(3).describe("Pixels to expand detected area"),
    seed: z.number().optional().describe("Random seed for reproducibility"),
    output_format: z.enum(["png", "jpeg", "webp"]).default("png").describe("Output image format"),
  },

  output: {
    image: outputBlob({ accept: "image/png", description: "Image with replaced object" }),
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
      "/v2beta/stable-image/edit/search-and-replace",
      apiKey,
      {
        search_prompt: args.search_prompt,
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
