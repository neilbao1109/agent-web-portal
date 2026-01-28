---
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

This skill combines the power of Stability AI's Stable Diffusion and Black Forest Labs' FLUX models to generate high-quality images from text descriptions. Choose the right model based on your needs - photorealism, artistic styles, or text rendering.

## Available Tools

### Stability AI

- {{txt2img}}: Generate images using Stable Diffusion Ultra - great for artistic and creative outputs

### FLUX Models (Black Forest Labs)

- {{flux_pro}}: FLUX Pro 1.1 - highest quality photorealistic generation with excellent text rendering
- {{flux_flex}}: Flexible generation with adjustable guidance scale for creative control

## When to Use Each Tool

| Tool | Best For | Quality | Speed |
|------|----------|---------|-------|
| {{flux_pro}} | Photorealistic images, product photos, text in images | Highest | ~30s |
| {{flux_flex}} | Creative freedom, artistic styles, experimentation | High | ~20s |
| {{txt2img}} | General purpose, diverse styles, quick iterations | High | ~10s |

## Usage Examples

### Example 1: Photorealistic Product Photography

Use {{flux_pro}} for the best photorealistic results:

```json
{
  "prompt": "Professional product photo of sleek wireless headphones on a marble surface, studio lighting, 4K, highly detailed",
  "width": 1024,
  "height": 1024,
  "prompt_upsampling": true,
  "output_format": "png"
}
```

### Example 2: Artistic Illustration

Use {{txt2img}} for artistic and creative styles:

```json
{
  "prompt": "Watercolor painting of a cozy coffee shop in autumn, warm colors, artistic style",
  "negative_prompt": "blurry, low quality, distorted",
  "output_format": "png"
}
```

### Example 3: Text in Images

Use {{flux_pro}} for accurate text rendering:

```json
{
  "prompt": "Motivational poster with the text 'Dream Big' in elegant typography, inspirational design",
  "width": 768,
  "height": 1024,
  "prompt_upsampling": true
}
```

### Example 4: Creative Experimentation

Use {{flux_flex}} with adjustable guidance for creative freedom:

```json
{
  "prompt": "Surreal landscape with floating islands, dreamlike atmosphere, fantasy art",
  "guidance": 2.5,
  "width": 1440,
  "height": 768
}
```

## Prompt Engineering Tips

### Be Descriptive
More details lead to better results:
- ❌ "a dog"
- ✅ "a golden retriever puppy playing in autumn leaves, soft afternoon sunlight, shallow depth of field"

### Specify Style
Include artistic style keywords:
- "cinematic lighting", "studio photography", "oil painting", "watercolor", "digital art"
- "4K", "highly detailed", "professional", "award-winning"

### Use Negative Prompts (Stability AI)
With {{txt2img}}, exclude unwanted elements:
- "blurry, low quality, distorted, disfigured"

### Aspect Ratios
Choose dimensions that match your content:
- **1024x1024**: Square format, balanced compositions
- **1024x768**: Landscape, scenic views
- **768x1024**: Portrait, vertical subjects
- **1440x1024**: Wide cinematic shots

## Parameters

### Common Parameters
| Parameter | Description | Default |
|-----------|-------------|---------|
| prompt | Text description of the image | Required |
| width | Image width (256-1440) | 1024 |
| height | Image height (256-1440) | 1024 |
| seed | Random seed for reproducibility | Random |
| output_format | png, jpeg, or webp | png |

### FLUX-Specific ({{flux_pro}}, {{flux_flex}})
| Parameter | Description | Default |
|-----------|-------------|---------|
| prompt_upsampling | Auto-enhance prompts | false |
| safety_tolerance | Content filter (0-6) | 2 |
| guidance | Guidance scale ({{flux_flex}} only) | 3.5 |

### Stability-Specific ({{txt2img}})
| Parameter | Description | Default |
|-----------|-------------|---------|
| negative_prompt | What to avoid | None |

## Best Practices

1. **Start with {{flux_pro}}** for most use cases - it provides the best quality
2. **Use prompt_upsampling** to automatically enhance your prompts with more details
3. **Save your seeds** to reproduce or iterate on good results
4. **Lower guidance (2-3)** in {{flux_flex}} for more creative freedom
5. **Higher guidance (4-5)** in {{flux_flex}} for strict prompt adherence

## Important: Language Requirements

**⚠️ All prompts MUST be in English!**

The Stability AI and FLUX APIs only support English prompts. If the user provides a prompt in another language (e.g., Chinese, Japanese, Spanish), you MUST:

1. **Translate the user's prompt to English** before calling the tool
2. **Enhance the translated prompt** with descriptive English keywords
3. Keep the original intent and style of the user's request

### Translation Example

User request: "画一个可爱的男孩牵着小狗在公园散步"

Translated and enhanced prompt for the tool:
```json
{
  "prompt": "A cute young boy walking a friendly dog in a sunny park, warm lighting, heartwarming scene, high quality, detailed illustration, soft colors"
}
```

**Always translate non-English prompts to detailed English descriptions before calling any image generation tool.**

## Limitations

- Maximum resolution: 1440x1440 (FLUX), 2048x2048 (Stability)
- Processing time: 10-60 seconds depending on model
- Some content may be filtered by safety systems
- API rate limits apply
- **Prompts must be in English only**
