/**
 * Image Workshop Portal
 *
 * AI Image Generation and Editing Workshop using Stability AI and FLUX
 */

import { createAgentWebPortal } from "@agent-web-portal/core";
import { fluxTools } from "./tools/flux/index.ts";
import { stabilityTools } from "./tools/stability/index.ts";

/**
 * Create the Image Workshop portal with all tools registered
 */
const builder = createAgentWebPortal({
  name: "image-workshop-portal",
  version: "1.0.0",
  description: "AI Image Generation and Editing Workshop",
});

// Register all Stability AI tools
for (const tool of stabilityTools) {
  builder.registerTool(tool.name, {
    description: tool.description,
    inputSchema: tool.inputSchema,
    outputSchema: tool.outputSchema,
    handler: tool.handler as any,
  });
}

// Register all FLUX tools
for (const tool of fluxTools) {
  builder.registerTool(tool.name, {
    description: tool.description,
    inputSchema: tool.inputSchema,
    outputSchema: tool.outputSchema,
    handler: tool.handler as any,
  });
}

// Register skills
builder.registerSkills({
  "stability-image-generation": {
    url: "/skills/stability-image-generation/SKILL.md",
    frontmatter: {
      name: "Stability Image Generation",
      description: "Professional AI image generation and editing using Stability AI",
      version: "1.0.0",
      "allowed-tools": stabilityTools.map((t) => t.name),
    },
  },
  "flux-image-generation": {
    url: "/skills/flux-image-generation/SKILL.md",
    frontmatter: {
      name: "FLUX Image Generation",
      description: "State-of-the-art AI image generation using Black Forest Labs FLUX models",
      version: "1.0.0",
      "allowed-tools": fluxTools.map((t) => t.name),
    },
  },
  "text-to-image": {
    url: "/skills/text-to-image/SKILL.md",
    frontmatter: {
      name: "Text-to-Image Generation",
      description:
        "Generate stunning images from text descriptions using state-of-the-art AI models",
      version: "1.0.0",
      "allowed-tools": ["txt2img", "flux_pro", "flux_flex"],
    },
  },
  "content-replace": {
    url: "/skills/content-replace/SKILL.md",
    frontmatter: {
      name: "Content Replace & Inpaint",
      description:
        "Replace, edit, or regenerate specific regions of images using AI-powered content replacement",
      version: "1.0.0",
      "allowed-tools": ["flux_fill", "flux_kontext", "search_replace", "inpaint", "erase"],
    },
  },
  "image-stylization": {
    url: "/skills/image-stylization/SKILL.md",
    frontmatter: {
      name: "Image Stylization",
      description:
        "Transform images with artistic styles, transfer aesthetics, and apply creative effects",
      version: "1.0.0",
      "allowed-tools": [
        "style",
        "transfer",
        "sketch",
        "structure",
        "flux_kontext",
        "search_recolor",
      ],
    },
  },
});

/**
 * Image Workshop Portal instance
 */
export const imageWorkshopPortal = builder.build();
