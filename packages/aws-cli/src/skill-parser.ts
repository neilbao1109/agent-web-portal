/**
 * Skill parser - parses SKILL.md files
 */

import { readFileSync } from "node:fs";
import type { SkillFrontmatter } from "@agent-web-portal/core";

/**
 * Parse frontmatter from markdown content
 */
export function parseFrontmatter(content: string): {
  frontmatter: SkillFrontmatter;
  markdown: string;
} {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    // No frontmatter, return empty frontmatter and full content as markdown
    return {
      frontmatter: {},
      markdown: content,
    };
  }

  const frontmatterStr = match[1]!;
  const markdown = match[2]!;

  // Parse YAML-like frontmatter
  const frontmatter: SkillFrontmatter = {};
  const lines = frontmatterStr.split("\n");

  for (const line of lines) {
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    let value: unknown = line.slice(colonIndex + 1).trim();

    // Handle arrays (lines starting with -)
    if (value === "") {
      // Check if next lines are array items
      const arrayItems: string[] = [];
      const lineIndex = lines.indexOf(line);
      for (let i = lineIndex + 1; i < lines.length; i++) {
        const nextLine = lines[i]!.trim();
        if (nextLine.startsWith("- ")) {
          arrayItems.push(nextLine.slice(2).trim());
        } else if (nextLine !== "" && !nextLine.startsWith("-")) {
          break;
        }
      }
      if (arrayItems.length > 0) {
        value = arrayItems;
      }
    } else if (typeof value === "string") {
      // Handle inline arrays like [item1, item2]
      if (value.startsWith("[") && value.endsWith("]")) {
        value = value
          .slice(1, -1)
          .split(",")
          .map((s) => s.trim().replace(/^["']|["']$/g, ""));
      }
      // Handle quoted strings
      else if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
    }

    frontmatter[key] = value;
  }

  return { frontmatter, markdown };
}

/**
 * Parse a SKILL.md file
 */
export function parseSkillFile(filePath: string): {
  frontmatter: SkillFrontmatter;
  markdown: string;
} {
  const content = readFileSync(filePath, "utf-8");
  return parseFrontmatter(content);
}

/**
 * Validate skill frontmatter
 */
export function validateFrontmatter(
  frontmatter: SkillFrontmatter,
  skillName: string
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Required fields
  if (!frontmatter.name && !skillName) {
    errors.push("Missing 'name' in frontmatter");
  }

  // Validate allowed-tools if present
  const allowedTools = frontmatter["allowed-tools"];
  if (allowedTools !== undefined) {
    if (!Array.isArray(allowedTools)) {
      errors.push("'allowed-tools' must be an array");
    } else {
      for (const tool of allowedTools) {
        if (typeof tool !== "string") {
          errors.push(`Invalid tool reference in 'allowed-tools': ${tool}`);
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
