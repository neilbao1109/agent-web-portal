/**
 * Style Tool (Stability AI)
 *
 * Apply style references to generated images
 */

import { defineTool, inputBlob, outputBlob } from "@agent-web-portal/core";
import { z } from "zod";
import { callStabilityApi, getContentType } from "../../lib/stability-api.ts";
import { getStabilityApiKey } from "../../secrets.ts";

export const styleTool = defineTool({
  name: "style",
  description: "Generate an image with the visual style of a reference image",

  input: {
    image: inputBlob({ mimeType: "image/*", description: "Style reference image" }),
    prompt: z.string().describe("Description of the content to generate"),
    negative_prompt: z.string().optional().describe("What to avoid generating"),
    fidelity: z
      .number()
      .min(0)
      .max(1)
      .default(0.5)
      .describe("How closely to match the style (0=loose, 1=exact)"),
    seed: z.number().optional().describe("Random seed for reproducibility"),
    output_format: z.enum(["png", "jpeg", "webp"]).default("png").describe("Output image format"),
  },

  output: {
    image: outputBlob({ accept: "image/png", description: "Generated image with applied style" }),
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
      "/v2beta/stable-image/control/style",
      apiKey,
      {
        prompt: args.prompt,
        negative_prompt: args.negative_prompt,
        fidelity: args.fidelity,
        seed: args.seed,
      },
      {
        image: { buffer: imageBuffer, filename: "style.png" },
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
