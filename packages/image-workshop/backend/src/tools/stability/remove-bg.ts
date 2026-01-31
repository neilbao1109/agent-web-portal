/**
 * Remove Background Tool (Stability AI)
 *
 * Remove the background from an image
 */

import { defineTool } from "@agent-web-portal/awp-server-core";
import { z } from "zod";
import { callStabilityApi } from "../../lib/stability-api.ts";
import { getStabilityApiKey } from "../../secrets.ts";

export const removeBgTool = defineTool((cas) => ({
  name: "remove_bg",
  description: "Remove the background from an image, leaving only the foreground subject",
  inputSchema: z.object({
    imageKey: z.string().describe("CAS key of the source image"),
  }),
  outputSchema: z.object({
    resultKey: z.string().describe("CAS key of the image with background removed (PNG with transparency)"),
    metadata: z.object({
      finish_reason: z.string().describe("Reason generation finished"),
    }),
  }),
  handler: async (args) => {
    const apiKey = await getStabilityApiKey();

    // Read input image from CAS
    const imageHandle = await cas.openFile(args.imageKey);
    const imageData = await imageHandle.bytes();

    const response = await callStabilityApi(
      "/v2beta/stable-image/edit/remove-background",
      apiKey,
      {},
      {
        image: { buffer: imageData, filename: "image.png" },
      },
      "png" // Always PNG for transparency
    );

    // Decode base64 image and write to CAS
    const outputBuffer = Uint8Array.from(Buffer.from(response.image, "base64"));
    const resultKey = await cas.putFile(outputBuffer, "image/png");

    return {
      resultKey,
      metadata: {
        finish_reason: response.finishReason,
      },
    };
  },
}));
