---
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

This skill enables powerful style transformations - from mimicking famous artists to applying consistent brand aesthetics. Combine reference-based styling with AI understanding to create stunning visual transformations.

## Available Tools

### Style Transfer

- {{style}}: Apply a style reference image to guide generation
- {{transfer}}: Transfer artistic style from one image to another

### Controlled Generation

- {{sketch}}: Generate images from sketch/line art input
- {{structure}}: Generate images following structural guides (edges, depth)

### Color & Context

- {{search_recolor}}: Find and recolor specific objects in images
- {{flux_kontext}}: Context-aware style and aesthetic modifications

## Tool Comparison

| Tool | Input | Best For | Preserves |
|------|-------|----------|-----------|
| {{style}} | Style ref + Prompt | New generation with style | Nothing (new image) |
| {{transfer}} | Content + Style images | Apply style to existing | Composition |
| {{sketch}} | Line drawing + Prompt | Colorize sketches | Outlines |
| {{structure}} | Edge/depth map + Prompt | Follow structure | Structure |
| {{flux_kontext}} | Image + Text instruction | Holistic style changes | Content |
| {{search_recolor}} | Image + Color prompt | Color specific objects | Everything else |

## Usage Examples

### Example 1: Apply Artist Style

Use {{transfer}} with content and style reference images:

```json
{
  "prompt": "landscape painting",
  "fidelity": 0.7,
  "output_format": "png"
}
```

**Blob inputs:** `content_image` (photo to stylize), `style_image` (Van Gogh painting)

### Example 2: Generate with Style Reference

Use {{style}} to generate new content matching a style reference:

```json
{
  "prompt": "portrait of a young woman, detailed face, beautiful lighting",
  "fidelity": 0.5,
  "output_format": "png"
}
```

**Blob inputs:** `image` (style reference, e.g., anime artwork)

### Example 3: Colorize Sketch

Use {{sketch}} to transform line art into full illustrations:

```json
{
  "prompt": "colorful fantasy illustration, vibrant colors, detailed shading",
  "control_strength": 0.8,
  "negative_prompt": "blurry, low quality",
  "output_format": "png"
}
```

**Blob inputs:** `image` (pencil sketch or line art)

### Example 4: Change Color Palette

Use {{search_recolor}} to recolor specific objects:

```json
{
  "search_prompt": "red sports car",
  "recolor_prompt": "electric blue metallic",
  "output_format": "png"
}
```

**Blob inputs:** `image` (source photo)

### Example 5: Vintage Style Transformation

Use {{flux_kontext}} for holistic style changes:

```json
{
  "prompt": "Transform this modern photo to look like a vintage 1960s photograph with film grain, faded colors, and period-appropriate aesthetics",
  "guidance": 3.5,
  "prompt_upsampling": true
}
```

**Blob inputs:** `image` (modern photo)

### Example 6: Structure-Guided Generation

Use {{structure}} to generate following an edge or depth map:

```json
{
  "prompt": "dense forest with tall trees, sunlight filtering through leaves, magical atmosphere",
  "control_strength": 0.7,
  "negative_prompt": "blurry, distorted",
  "output_format": "png"
}
```

**Blob inputs:** `image` (edge map or depth map)

## Workflow Guide

### Reference-Based Styling

1. **Choose a style reference**: Find an image with the desired aesthetic
2. **Select your tool**:
   - {{style}} for new generations with that style
   - {{transfer}} for applying style to existing content
3. **Adjust fidelity**: Higher values match style more closely

### From Sketch to Art

1. **Prepare your sketch**: Clean line art works best
2. **Use {{sketch}} tool**: Provide the sketch and describe desired output
3. **Adjust control_strength**: Higher values follow lines more strictly

### Recoloring Objects

1. **Identify the object**: Describe what to find
2. **Use {{search_recolor}}**: Specify the new color
3. **Be specific**: "bright red" vs "dark crimson" gives different results

## Parameters

### {{style}}
| Parameter | Description | Default |
|-----------|-------------|---------|
| image | Style reference image | Required (blob) |
| prompt | What to generate | Required |
| negative_prompt | What to avoid | None |
| fidelity | Style matching (0-1) | 0.5 |
| output_format | png, jpeg, webp | png |

### {{transfer}}
| Parameter | Description | Default |
|-----------|-------------|---------|
| content_image | Image to stylize | Required (blob) |
| style_image | Style reference | Required (blob) |
| prompt | Guide the transfer | Optional |
| fidelity | Style strength (0-1) | 0.5 |

### {{sketch}}
| Parameter | Description | Default |
|-----------|-------------|---------|
| image | Sketch/line art | Required (blob) |
| prompt | What to generate | Required |
| control_strength | How closely to follow (0-1) | 0.7 |
| negative_prompt | What to avoid | None |

### {{structure}}
| Parameter | Description | Default |
|-----------|-------------|---------|
| image | Structure guide (edge/depth) | Required (blob) |
| prompt | What to generate | Required |
| control_strength | Structure adherence (0-1) | 0.7 |
| negative_prompt | What to avoid | None |

### {{flux_kontext}}
| Parameter | Description | Default |
|-----------|-------------|---------|
| image | Source image | Required (blob) |
| prompt | Style/aesthetic changes | Required |
| guidance | Guidance scale (1.5-5) | 3.5 |

### {{search_recolor}}
| Parameter | Description | Default |
|-----------|-------------|---------|
| image | Source image | Required (blob) |
| search_prompt | Object to find | Required |
| recolor_prompt | New color/appearance | Required |

## Style Transfer Tips

### Choosing Reference Images
- **High quality**: Use clear, well-lit reference images
- **Representative**: Choose images that exemplify the style you want
- **Similar content**: Style transfer works better with similar subject matter

### Fidelity Settings
| Fidelity | Effect |
|----------|--------|
| 0.1-0.3 | Subtle style hints, mostly original |
| 0.4-0.6 | Balanced blend of content and style |
| 0.7-0.9 | Strong style application |
| 1.0 | Maximum style, may lose content detail |

### Prompt Engineering for Style
Include style-specific keywords:
- **Art movements**: "impressionist", "art deco", "baroque", "minimalist"
- **Media**: "oil painting", "watercolor", "digital art", "photograph"
- **Mood**: "moody", "vibrant", "ethereal", "dramatic"
- **Technical**: "high contrast", "soft focus", "hard lighting"

## Common Stylization Tasks

| Task | Tool | Tip |
|------|------|-----|
| Photo → Painting | {{transfer}} | Use painting as style reference |
| Sketch → Illustration | {{sketch}} | Describe colors and mood in prompt |
| Change color scheme | {{search_recolor}} | Be specific about colors |
| Vintage effect | {{flux_kontext}} | Describe era and aesthetic |
| Consistent brand style | {{style}} | Use brand imagery as reference |
| Anime/cartoon style | {{transfer}} | Use anime art as style reference |
| Portrait retouching | {{flux_kontext}} | Describe specific changes |

## Advanced Techniques

### Multi-Step Stylization
Combine tools for complex effects:
1. Use {{structure}} to establish composition
2. Apply {{style}} for aesthetic consistency
3. Fine-tune with {{search_recolor}} for specific elements

### Style Consistency Across Images
For a series of images:
1. Create one "master" styled image
2. Use that as the style reference for subsequent images
3. Keep prompts similar for consistency

### Preserving Identity
When stylizing portraits:
- Use lower fidelity (0.3-0.5) to preserve facial features
- Include "preserve facial features" in prompt
- Use {{flux_kontext}} for subtle changes

## Limitations

- Style transfer may not perfectly preserve all details
- Complex styles require high-quality reference images
- Processing time: 10-30 seconds
- Very different content types may not transfer styles well
- Some artistic styles are more "transferable" than others
