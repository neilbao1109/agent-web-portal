/**
 * Sketch Tool (Stability AI)
 *
 * Generate images from sketch inputs using ControlNet
 */

import { defineTool, inputBlob, outputBlob } from "@agent-web-portal/core";
import { z } from "zod";
import { callStabilityApi, getContentType } from "../../lib/stability-api.ts";
import { getStabilityApiKey } from "../../secrets.ts";

export const sketchTool = defineTool({
  name: "sketch",
  description: "Generate a detailed image from a sketch or line drawing",

  input: {
    image: inputBlob({
      mimeType: "image/*",
      description: "Sketch or line drawing to use as guide",
    }),
    prompt: z.string().describe("Description of the image to generate"),
    negative_prompt: z.string().optional().describe("What to avoid generating"),
    control_strength: z
      .number()
      .min(0)
      .max(1)
      .default(0.7)
      .describe("How closely to follow the sketch (0=ignore, 1=exact)"),
    seed: z.number().optional().describe("Random seed for reproducibility"),
    output_format: z.enum(["png", "jpeg", "webp"]).default("png").describe("Output image format"),
  },

  output: {
    image: outputBlob({ accept: "image/png", description: "Generated image from sketch" }),
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
      "/v2beta/stable-image/control/sketch",
      apiKey,
      {
        prompt: args.prompt,
        negative_prompt: args.negative_prompt,
        control_strength: args.control_strength,
        seed: args.seed,
      },
      {
        image: { buffer: imageBuffer, filename: "sketch.png" },
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
