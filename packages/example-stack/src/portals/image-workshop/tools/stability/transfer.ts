/**
 * Style Transfer Tool (Stability AI)
 *
 * Transfer artistic styles between images
 */

import { defineTool, inputBlob, outputBlob } from "@agent-web-portal/core";
import { z } from "zod";
import { callStabilityApi, getContentType } from "../../lib/stability-api.ts";
import { getStabilityApiKey } from "../../secrets.ts";

export const transferTool = defineTool({
  name: "transfer",
  description: "Transfer the artistic style from one image to another",

  input: {
    source: inputBlob({ mimeType: "image/*", description: "Source image (content to keep)" }),
    style: inputBlob({ mimeType: "image/*", description: "Style image (style to apply)" }),
    prompt: z.string().optional().describe("Additional guidance for the transfer"),
    negative_prompt: z.string().optional().describe("What to avoid"),
    strength: z
      .number()
      .min(0)
      .max(1)
      .default(0.5)
      .describe("How much to transform the source (0=subtle, 1=strong)"),
    seed: z.number().optional().describe("Random seed for reproducibility"),
    output_format: z.enum(["png", "jpeg", "webp"]).default("png").describe("Output image format"),
  },

  output: {
    image: outputBlob({ accept: "image/png", description: "Image with transferred style" }),
    metadata: z.object({
      seed: z.number().describe("Seed used for generation"),
      finish_reason: z.string().describe("Reason generation finished"),
    }),
  },

  handler: async (args, context) => {
    const apiKey = await getStabilityApiKey();

    // Fetch input blobs
    const [sourceResponse, styleResponse] = await Promise.all([
      fetch(context.blobs.input.source),
      fetch(context.blobs.input.style),
    ]);

    const sourceBuffer = Buffer.from(await sourceResponse.arrayBuffer());
    const styleBuffer = Buffer.from(await styleResponse.arrayBuffer());

    // Use image-to-image with style reference
    const response = await callStabilityApi(
      "/v2beta/stable-image/generate/sd3",
      apiKey,
      {
        prompt: args.prompt || "Same image with applied artistic style",
        negative_prompt: args.negative_prompt,
        strength: args.strength,
        seed: args.seed,
        mode: "image-to-image",
      },
      {
        image: { buffer: sourceBuffer, filename: "source.png" },
        style_image: { buffer: styleBuffer, filename: "style.png" },
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
