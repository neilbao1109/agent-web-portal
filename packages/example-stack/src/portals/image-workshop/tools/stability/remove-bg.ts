/**
 * Remove Background Tool (Stability AI)
 *
 * Remove image backgrounds cleanly
 */

import { defineTool, inputBlob, outputBlob } from "@agent-web-portal/core";
import { z } from "zod";
import { callStabilityApi, getContentType } from "../../lib/stability-api.ts";
import { getStabilityApiKey } from "../../secrets.ts";

export const removeBgTool = defineTool({
  name: "remove_bg",
  description: "Remove the background from an image, leaving only the main subject",

  input: {
    image: inputBlob({ mimeType: "image/*", description: "Source image" }),
    output_format: z
      .enum(["png", "webp"])
      .default("png")
      .describe("Output format (PNG for transparency)"),
  },

  output: {
    image: outputBlob({ accept: "image/png", description: "Image with background removed" }),
    metadata: z.object({
      finish_reason: z.string().describe("Reason generation finished"),
    }),
  },

  handler: async (args, context) => {
    const apiKey = await getStabilityApiKey();

    // Fetch input blob
    const imageResponse = await fetch(context.blobs.input.image);
    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());

    const response = await callStabilityApi(
      "/v2beta/stable-image/edit/remove-background",
      apiKey,
      {},
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
        finish_reason: response.finishReason,
      },
    };
  },
});
