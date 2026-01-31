---
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

This skill provides powerful content replacement capabilities using both mask-based inpainting and semantic search-based replacement. Perfect for removing unwanted objects, replacing backgrounds, or editing specific elements while maintaining context.

## Available Tools

### FLUX-Based (Black Forest Labs)

- {{flux_fill}}: High-quality masked region filling - specify what to generate in masked areas
- {{flux_kontext}}: Context-aware editing - modify images based on text instructions

### Stability AI

- {{search_replace}}: Semantic search and replace - find objects by description and replace them
- {{inpaint}}: Fill masked regions with generated content
- {{erase}}: Remove unwanted objects seamlessly

## Tool Comparison

| Tool | Input | Use Case | Quality |
|------|-------|----------|---------|
| {{flux_fill}} | Image + Mask + Prompt | Precise region replacement | Highest |
| {{flux_kontext}} | Image + Prompt | Context-aware edits | Highest |
| {{search_replace}} | Image + Search/Replace prompts | Object replacement | High |
| {{inpaint}} | Image + Mask + Prompt | Fill masked areas | High |
| {{erase}} | Image + Mask | Remove objects cleanly | High |

## Usage Examples

### Example 1: Replace Sky with Sunset (Mask-based)

Use {{flux_fill}} with an image and a mask (white areas indicate regions to fill):

```json
{
  "prompt": "dramatic orange and purple sunset sky, golden hour lighting, beautiful clouds",
  "guidance": 3.5,
  "prompt_upsampling": true,
  "output_format": "png"
}
```

**Blob inputs:** `image` (source photo), `mask` (sky region marked white)

### Example 2: Change Object by Description

Use {{search_replace}} to find and replace objects semantically:

```json
{
  "search_prompt": "red car in parking lot",
  "prompt": "blue sports car, matching perspective and lighting",
  "output_format": "png"
}
```

**Blob inputs:** `image` (source photo)

### Example 3: Context-Aware Edit

Use {{flux_kontext}} for holistic changes without a mask:

```json
{
  "prompt": "Change the person's outfit to a red dress while keeping everything else the same",
  "guidance": 3.5,
  "prompt_upsampling": true
}
```

**Blob inputs:** `image` (source photo)

### Example 4: Remove Unwanted Objects

Use {{erase}} with a mask to seamlessly remove objects:

```json
{
  "output_format": "png"
}
```

**Blob inputs:** `image` (source photo), `mask` (object region marked white)

### Example 5: Fill with Content

Use {{inpaint}} to fill masked regions with new content:

```json
{
  "prompt": "beautiful flower garden with roses and tulips",
  "negative_prompt": "blurry, low quality",
  "output_format": "png"
}
```

**Blob inputs:** `image` (source photo), `mask` (region to fill marked white)

## Workflow Guide

### For Precise Edits (Mask Required)

1. **Prepare the mask**: Create a black and white image where white indicates areas to edit
2. **Choose your tool**:
   - {{flux_fill}} for highest quality replacement
   - {{inpaint}} for quick fills
   - {{erase}} for object removal
3. **Provide context**: Include details about surrounding areas in your prompt

### For Semantic Edits (No Mask)

1. **Describe what to find**: Use {{search_replace}} with a clear search prompt
2. **Describe replacement**: Specify what should replace it
3. **Consider context**: Include style and lighting cues for seamless blending

### For Holistic Edits

1. **Use {{flux_kontext}}**: Describe the desired change in natural language
2. **Be specific**: "Change the weather to rainy" or "Make the room look modern"
3. **Preserve elements**: The AI understands context and preserves unrelated elements

## Parameters

### {{flux_fill}}
| Parameter | Description | Default |
|-----------|-------------|---------|
| image | Source image to edit | Required (blob) |
| mask | Mask image (white = fill region) | Required (blob) |
| prompt | What to generate in masked area | Required |
| guidance | Guidance scale (1.5-5) | 3.5 |
| prompt_upsampling | Auto-enhance prompts | false |
| safety_tolerance | Content filter (0-6) | 2 |

### {{flux_kontext}}
| Parameter | Description | Default |
|-----------|-------------|---------|
| image | Source image to edit | Required (blob) |
| prompt | Description of desired edit | Required |
| guidance | Guidance scale (1.5-5) | 3.5 |
| prompt_upsampling | Auto-enhance prompts | false |

### {{search_replace}}
| Parameter | Description | Default |
|-----------|-------------|---------|
| image | Source image | Required (blob) |
| search_prompt | What to find | Required |
| prompt | What to replace with | Required |
| negative_prompt | What to avoid | None |

### {{inpaint}} / {{erase}}
| Parameter | Description | Default |
|-----------|-------------|---------|
| image | Source image | Required (blob) |
| mask | Mask indicating edit region | Required (blob) |
| prompt | What to generate ({{inpaint}} only) | Required |

## Best Practices

### Creating Good Masks
- Use pure white (#FFFFFF) for areas to edit
- Use pure black (#000000) for areas to preserve
- Add slight feathering (2-5px) for smoother blending
- Ensure mask dimensions match the source image

### Writing Effective Prompts

**For {{flux_fill}}:**
```
✅ "A sunset sky with orange and purple clouds, golden hour lighting matching the scene"
❌ "sunset"
```

**For {{search_replace}}:**
```
✅ Search: "red car in parking lot"
✅ Replace: "blue sports car, matching perspective and lighting"
❌ Search: "car" → Too generic
```

**For {{flux_kontext}}:**
```
✅ "Change the person's hair color to blonde while keeping everything else the same"
❌ "blonde hair" → Too vague
```

### Maintaining Consistency
1. Match lighting and perspective in replacement prompts
2. Reference surrounding elements for coherent results
3. Use lower guidance (2-3) for subtle changes
4. Use higher guidance (4-5) for dramatic transformations

## Common Use Cases

| Task | Recommended Tool |
|------|-----------------|
| Remove watermark | {{erase}} |
| Change outfit/clothing | {{flux_kontext}} |
| Replace background | {{flux_fill}} + mask |
| Swap objects | {{search_replace}} |
| Fix faces/features | {{flux_fill}} |
| Seasonal changes | {{flux_kontext}} |
| Add/remove accessories | {{search_replace}} |

## Limitations

- Mask quality significantly affects results
- Complex semantic searches may have unpredictable results
- Large replaced areas may show inconsistencies
- Processing time: 15-60 seconds depending on complexity
