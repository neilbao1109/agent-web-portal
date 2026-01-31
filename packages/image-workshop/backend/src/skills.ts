/**
 * Image Workshop Skills
 *
 * Skill definitions embedded as strings for Lambda deployment.
 * Content is copied from the skills/ directory.
 */

import { parseSkill, type DefinedSkill } from "@agent-web-portal/awp-server-core";

// Skill contents embedded as template literals
// These are generated from the skills/ directory

const textToImageContent = `---
name: Text-to-Image Generation
description: Generate stunning images from text descriptions using state-of-the-art AI models
version: 1.0.0
allowed-tools:
  - txt2img
  - flux_pro
  - flux_flex
---

# Text-to-Image Generation

Transform your creative ideas into stunning images using cutting-edge AI image generation models.

## Overview

This skill combines the power of Stability AI's Stable Diffusion and Black Forest Labs' FLUX models to generate high-quality images from text descriptions.

## Available Tools

### Stability AI
- **txt2img**: Generate images using Stable Diffusion Ultra - great for artistic and creative outputs

### FLUX Models (Black Forest Labs)
- **flux_pro**: FLUX Pro 1.1 - highest quality photorealistic generation with excellent text rendering
- **flux_flex**: Flexible generation with adjustable guidance scale for creative control

## When to Use Each Tool

| Tool | Best For | Quality | Speed |
|------|----------|---------|-------|
| flux_pro | Photorealistic images, product photos, text in images | Highest | ~30s |
| flux_flex | Creative freedom, artistic styles, experimentation | High | ~20s |
| txt2img | General purpose, diverse styles, quick iterations | High | ~10s |

## Important: Language Requirements

**⚠️ All prompts MUST be in English!**

The AI APIs only support English prompts. If the user provides a prompt in another language, you MUST translate it to detailed English descriptions before calling any image generation tool.
`;

const fluxImageGenerationContent = `---
name: FLUX Image Generation
description: State-of-the-art AI image generation using Black Forest Labs FLUX models
version: 1.0.0
allowed-tools:
  - flux_pro
  - flux_flex
  - flux_kontext
  - flux_fill
  - flux_expand
---

# FLUX Image Generation

State-of-the-art AI image generation using Black Forest Labs' FLUX models.

## Overview

This skill provides access to FLUX, one of the most advanced AI image generation models available. FLUX excels at photorealistic imagery, complex compositions, and accurate text rendering in images.

## Available Tools

### Text-to-Image
- **flux_pro**: High-quality image generation with FLUX Pro 1.1
- **flux_flex**: Flexible generation with adjustable guidance scale

### Image Editing
- **flux_kontext**: Context-aware image editing and transformation
- **flux_fill**: Inpaint/fill masked regions of images
- **flux_expand**: Outpaint/extend images beyond boundaries

## Key Features

- Exceptional photorealism
- Accurate text rendering in images
- Complex multi-subject compositions
- Consistent style and coherence

## Important: Language Requirements

**⚠️ All prompts MUST be in English!**
`;

const stabilityImageGenerationContent = `---
name: Stability Image Generation
description: Professional AI image generation and editing using Stability AI
version: 1.0.0
allowed-tools:
  - txt2img
  - erase
  - inpaint
  - outpaint
  - remove_bg
  - search_replace
  - search_recolor
  - sketch
  - structure
  - style
  - transfer
---

# Stability Image Generation

Professional AI image generation and editing using Stability AI's APIs.

## Overview

This skill provides comprehensive image generation and manipulation capabilities powered by Stability AI's Stable Diffusion models.

## Available Tools

### Text-to-Image
- **txt2img**: Generate images from text descriptions using Stable Diffusion Ultra

### Image Editing
- **erase**: Remove unwanted objects from images using mask-based erasing
- **inpaint**: Fill masked regions with AI-generated content
- **outpaint**: Extend images beyond their original boundaries
- **remove_bg**: Remove image backgrounds cleanly

### Search & Replace
- **search_replace**: Find and replace objects in images using text descriptions
- **search_recolor**: Find and recolor specific objects in images

### Control & Style
- **sketch**: Generate images from sketch inputs
- **structure**: Generate images following structural edge/depth maps
- **style**: Apply style references to generated images
- **transfer**: Transfer artistic styles between images

## Important: Language Requirements

**⚠️ All prompts MUST be in English!**
`;

const imageStylizationContent = `---
name: Image Stylization
description: Transform images with artistic styles, transfer aesthetics, and apply creative effects
version: 1.0.0
allowed-tools:
  - style
  - transfer
  - sketch
  - structure
  - flux_kontext
  - search_recolor
---

# Image Stylization

Transform your images with artistic styles, transfer aesthetics between images, and apply creative effects using AI.

## Overview

This skill enables powerful style transformations - from mimicking famous artists to applying consistent brand aesthetics.

## Available Tools

### Style Transfer
- **style**: Apply a style reference image to guide generation
- **transfer**: Transfer artistic style from one image to another

### Controlled Generation
- **sketch**: Generate images from sketch/line art input
- **structure**: Generate images following structural guides (edges, depth)

### Color & Context
- **search_recolor**: Find and recolor specific objects in images
- **flux_kontext**: Context-aware style and aesthetic modifications

## Tool Comparison

| Tool | Input | Best For | Preserves |
|------|-------|----------|-----------|
| style | Style ref + Prompt | New generation with style | Nothing (new image) |
| transfer | Content + Style images | Apply style to existing | Composition |
| sketch | Line drawing + Prompt | Colorize sketches | Outlines |
| structure | Edge/depth map + Prompt | Follow structure | Structure |
| flux_kontext | Image + Text instruction | Holistic style changes | Content |
| search_recolor | Image + Color prompt | Color specific objects | Everything else |
`;

const contentReplaceContent = `---
name: Content Replace & Inpaint
description: Replace, edit, or regenerate specific regions of images using AI-powered content replacement
version: 1.0.0
allowed-tools:
  - flux_fill
  - flux_kontext
  - search_replace
  - inpaint
  - erase
---

# Content Replace & Inpaint

Intelligently replace, edit, or regenerate specific regions of images using state-of-the-art AI models.

## Overview

This skill provides powerful content replacement capabilities using both mask-based inpainting and semantic search-based replacement.

## Available Tools

### FLUX-Based (Black Forest Labs)
- **flux_fill**: High-quality masked region filling
- **flux_kontext**: Context-aware editing - modify images based on text instructions

### Stability AI
- **search_replace**: Semantic search and replace - find objects by description and replace them
- **inpaint**: Fill masked regions with generated content
- **erase**: Remove unwanted objects seamlessly

## Tool Comparison

| Tool | Input | Use Case | Quality |
|------|-------|----------|---------|
| flux_fill | Image + Mask + Prompt | Precise region replacement | Highest |
| flux_kontext | Image + Prompt | Context-aware edits | Highest |
| search_replace | Image + Search/Replace prompts | Object replacement | High |
| inpaint | Image + Mask + Prompt | Fill masked areas | High |
| erase | Image + Mask | Remove objects cleanly | High |
`;

/**
 * All image workshop skills
 */
export const imageWorkshopSkills: DefinedSkill[] = [
  parseSkill("text-to-image", textToImageContent),
  parseSkill("flux-image-generation", fluxImageGenerationContent),
  parseSkill("stability-image-generation", stabilityImageGenerationContent),
  parseSkill("image-stylization", imageStylizationContent),
  parseSkill("content-replace", contentReplaceContent),
];
