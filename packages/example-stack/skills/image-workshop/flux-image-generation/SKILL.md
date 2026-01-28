---
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
- {{flux_pro}}: High-quality image generation with FLUX Pro 1.1
- {{flux_flex}}: Flexible generation with adjustable guidance scale

### Image Editing
- {{flux_kontext}}: Context-aware image editing and transformation
- {{flux_fill}}: Inpaint/fill masked regions of images
- {{flux_expand}}: Outpaint/extend images beyond boundaries

## Key Features

### Superior Quality
FLUX Pro 1.1 represents the cutting edge of image generation, with:
- Exceptional photorealism
- Accurate text rendering in images
- Complex multi-subject compositions
- Consistent style and coherence

### Context Understanding
FLUX Kontext understands image context to make intelligent edits:
- Object modification while preserving surroundings
- Style transformation with content preservation
- Seamless blending of edited regions

## Usage Examples

### Example 1: Generate High-Quality Image

Use {{flux_pro}} for photorealistic generation:

```json
{
  "prompt": "Professional product photo of a smartwatch on marble surface, studio lighting",
  "width": 1024,
  "height": 1024,
  "prompt_upsampling": true,
  "output_format": "png"
}
```

### Example 2: Edit with Context

Use {{flux_kontext}} for context-aware transformations:

```json
{
  "prompt": "Change the season from summer to winter, add snow to the ground and trees",
  "guidance": 3.5
}
```

**Blob inputs:** `image` (summer photo to edit)

### Example 3: Expand Canvas

Use {{flux_expand}} to outpaint image boundaries:

```json
{
  "prompt": "Continue the background scenery naturally",
  "top": 256,
  "bottom": 0,
  "left": 128,
  "right": 128
}
```

**Blob inputs:** `image` (portrait to expand)

### Example 4: Fill Region

Use {{flux_fill}} with a mask to fill specific areas:

```json
{
  "prompt": "Beautiful sunset sky with orange and purple clouds",
  "guidance": 3.5,
  "prompt_upsampling": true
}
```

**Blob inputs:** `image` (source photo), `mask` (sky region marked white)

## Parameters

### Common Parameters
| Parameter | Description | Default |
|-----------|-------------|---------|
| prompt | Text description of desired output | Required |
| width/height | Output dimensions (256-1440) | 1024 |
| seed | Random seed for reproducibility | Random |
| output_format | png or jpeg | png |

### Generation Parameters ({{flux_pro}}, {{flux_flex}})
| Parameter | Description | Default |
|-----------|-------------|---------|
| guidance | Guidance scale (1.5-5) | 3.5 |
| prompt_upsampling | Auto-enhance prompts with details | false |
| safety_tolerance | Content filter level (0-6) | 2 |

### Expand Parameters ({{flux_expand}})
| Parameter | Description | Default |
|-----------|-------------|---------|
| top | Pixels to expand at top | 0 |
| bottom | Pixels to expand at bottom | 0 |
| left | Pixels to expand at left | 0 |
| right | Pixels to expand at right | 0 |

## Best Practices

1. **Prompt Upsampling**: Enable for more detailed results with {{flux_pro}}
2. **Guidance Scale**: Lower (2-3) for creative freedom, higher (4-5) for prompt adherence
3. **Safety Tolerance**: Adjust based on content needs (0=strict, 6=permissive)
4. **Seed Usage**: Save seeds to reproduce or iterate on good results

## Important: Language Requirements

**⚠️ All prompts MUST be in English!**

FLUX APIs only support English prompts. If the user provides a prompt in another language (e.g., Chinese, Japanese, Spanish), you MUST:
1. Translate the prompt to English
2. Enhance with descriptive keywords while preserving the original intent

Example: "可爱的男孩遛狗" → "A cute young boy walking a friendly dog in a sunny park, warm atmosphere, heartwarming scene, high quality"

## Limitations

- Async processing with polling (may take 10-60 seconds)
- Maximum dimensions: 1440x1440 pixels
- Some content filtered by safety systems
- API rate limits apply
- **Prompts must be in English only**
