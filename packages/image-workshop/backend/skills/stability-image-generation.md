---
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

This skill provides comprehensive image generation and manipulation capabilities powered by Stability AI's Stable Diffusion models. Generate images from text, edit existing images, remove backgrounds, and apply creative transformations.

## Available Tools

### Text-to-Image
- {{txt2img}}: Generate images from text descriptions using Stable Diffusion Ultra

### Image Editing
- {{erase}}: Remove unwanted objects from images using mask-based erasing
- {{inpaint}}: Fill masked regions with AI-generated content
- {{outpaint}}: Extend images beyond their original boundaries
- {{remove_bg}}: Remove image backgrounds cleanly

### Search & Replace
- {{search_replace}}: Find and replace objects in images using text descriptions
- {{search_recolor}}: Find and recolor specific objects in images

### Control & Style
- {{sketch}}: Generate images from sketch inputs using ControlNet
- {{structure}}: Generate images following structural edge/depth maps
- {{style}}: Apply style references to generated images
- {{transfer}}: Transfer artistic styles between images

## Usage Examples

### Example 1: Generate an Image

Use {{txt2img}} for text-to-image generation:

```json
{
  "prompt": "Beautiful sunset over mountains, dramatic clouds, golden hour lighting",
  "negative_prompt": "blurry, low quality, distorted",
  "output_format": "png"
}
```

### Example 2: Remove Background

Use {{remove_bg}} to extract subjects cleanly:

```json
{
  "output_format": "png"
}
```

**Blob inputs:** `image` (photo with subject to extract)

### Example 3: Replace Objects

Use {{search_replace}} for semantic replacement:

```json
{
  "search_prompt": "cat sitting on couch",
  "prompt": "golden retriever dog sitting on couch",
  "negative_prompt": "blurry, distorted",
  "output_format": "png"
}
```

**Blob inputs:** `image` (source photo with cat)

### Example 4: Apply Style

Use {{style}} with a reference image:

```json
{
  "prompt": "landscape painting, rolling hills, blue sky",
  "fidelity": 0.7,
  "output_format": "png"
}
```

**Blob inputs:** `image` (Van Gogh painting as style reference)

### Example 5: Erase Objects

Use {{erase}} with a mask to remove objects seamlessly:

```json
{
  "output_format": "png"
}
```

**Blob inputs:** `image` (source photo), `mask` (object region marked white)

### Example 6: Inpaint Region

Use {{inpaint}} to fill masked areas with new content:

```json
{
  "prompt": "beautiful garden with flowers",
  "negative_prompt": "blurry, distorted",
  "output_format": "png"
}
```

**Blob inputs:** `image` (source photo), `mask` (region to fill marked white)

## Parameters

### Common Parameters
| Parameter | Description | Default |
|-----------|-------------|---------|
| prompt | Text description of desired output | Required |
| negative_prompt | What to avoid in the output | None |
| seed | Random seed for reproducibility | Random |
| output_format | png, jpeg, or webp | png |

### Control Parameters
| Parameter | Description | Default |
|-----------|-------------|---------|
| control_strength | How strongly control images influence output (0-1) | 0.7 |
| fidelity | How closely to match style references (0-1) | 0.5 |

## Best Practices

1. **Be Descriptive**: More detailed prompts yield better results with {{txt2img}}
2. **Use Negative Prompts**: Exclude unwanted elements explicitly
3. **Control Strength**: Start with 0.7 for {{sketch}} and {{structure}}, adjust as needed
4. **Quality Masks**: Clean, precise masks produce better results with {{inpaint}} and {{erase}}

## Important: Language Requirements

**⚠️ All prompts MUST be in English!**

Stability AI's APIs only support English prompts. If the user provides a prompt in another language (e.g., Chinese, Japanese, Spanish), you MUST translate it to English before calling any tool. Enhance the translated prompt with descriptive English keywords while preserving the original intent.

## Limitations

- Maximum image resolution: 2048x2048 for most operations
- Processing time varies by complexity
- Some content may be filtered by safety systems
- **Prompts must be in English only**
