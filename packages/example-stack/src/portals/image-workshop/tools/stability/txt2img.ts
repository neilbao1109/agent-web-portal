/**
 * Text-to-Image Tool (Stability AI)
 *
 * Generates images from text prompts using Stable Diffusion XL
 */

import { defineTool, outputBlob } from "@agent-web-portal/core";
import { z } from "zod";
import { callStabilityApiV1, getContentType } from "../../lib/stability-api.ts";
import { getStabilityApiKey } from "../../secrets.ts";

export const txt2imgTool = defineTool({
  name: "txt2img",
  description: "Generate an image from a text prompt using Stable Diffusion XL",

  input: {
    prompt: z.string().describe("The text prompt describing what to generate"),
    negative_prompt: z.string().optional().describe("What to avoid in the generated image"),
    width: z.number().min(512).max(2048).default(1024).describe("Image width in pixels"),
    height: z.number().min(512).max(2048).default(1024).describe("Image height in pixels"),
    steps: z.number().min(10).max(50).default(30).describe("Number of diffusion steps"),
    cfg_scale: z.number().min(1).max(35).default(7.0).describe("How closely to follow the prompt"),
    seed: z.number().optional().describe("Random seed for reproducibility"),
    style_preset: z
      .enum([
        "3d-model",
        "analog-film",
        "anime",
        "cinematic",
        "comic-book",
        "digital-art",
        "enhance",
        "fantasy-art",
        "isometric",
        "line-art",
        "low-poly",
        "neon-punk",
        "origami",
        "photographic",
        "pixel-art",
      ])
      .optional()
      .describe("Style preset to guide generation"),
    output_format: z.enum(["png", "jpeg", "webp"]).default("png").describe("Output image format"),
  },

  output: {
    image: outputBlob({ accept: "image/png", description: "Generated image" }),
    metadata: z.object({
      seed: z.number().describe("Seed used for generation"),
      finish_reason: z.string().describe("Reason generation finished"),
    }),
  },

  handler: async (args, context) => {
    console.log("[txt2img] Starting handler with args:", {
      prompt: args.prompt,
      width: args.width,
      height: args.height,
    });
    console.log("[txt2img] Output blob URL:", context.blobs.output.image);

    const apiKey = await getStabilityApiKey();
    console.log("[txt2img] Got API key:", apiKey ? `${apiKey.slice(0, 8)}...` : "(none)");

    console.log("[txt2img] Calling Stability API...");
    const response = await callStabilityApiV1(
      "/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image",
      apiKey,
      {
        text_prompts: [
          { text: args.prompt, weight: 1 },
          ...(args.negative_prompt ? [{ text: args.negative_prompt, weight: -1 }] : []),
        ],
        width: args.width,
        height: args.height,
        steps: args.steps,
        cfg_scale: args.cfg_scale,
        seed: args.seed,
        style_preset: args.style_preset,
      },
      args.output_format
    );

    console.log(
      "[txt2img] Stability API response received, seed:",
      response.seed,
      "finishReason:",
      response.finishReason
    );

    // Write output blob to presigned URL
    const imageBuffer = Buffer.from(response.image, "base64");
    const contentType = getContentType(args.output_format);
    console.log("[txt2img] Writing image to blob URL, size:", imageBuffer.length, "bytes");

    await fetch(context.blobs.output.image, {
      method: "PUT",
      body: imageBuffer,
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
