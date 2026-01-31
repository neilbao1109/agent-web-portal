/**
 * Stability AI Tools Index
 *
 * Exports all Stability AI image generation and editing tools
 */

import { eraseTool } from "./erase.ts";
import { inpaintTool } from "./inpaint.ts";
import { outpaintTool } from "./outpaint.ts";
import { removeBgTool } from "./remove-bg.ts";
import { searchRecolorTool } from "./search-recolor.ts";
import { searchReplaceTool } from "./search-replace.ts";
import { sketchTool } from "./sketch.ts";
import { structureTool } from "./structure.ts";
import { styleTool } from "./style.ts";
import { transferTool } from "./transfer.ts";
import { txt2imgTool } from "./txt2img.ts";

export {
  eraseTool,
  inpaintTool,
  outpaintTool,
  removeBgTool,
  searchRecolorTool,
  searchReplaceTool,
  sketchTool,
  structureTool,
  styleTool,
  transferTool,
  txt2imgTool,
};

export const stabilityTools = [
  txt2imgTool,
  inpaintTool,
  eraseTool,
  outpaintTool,
  removeBgTool,
  searchReplaceTool,
  searchRecolorTool,
  sketchTool,
  structureTool,
  styleTool,
  transferTool,
];
