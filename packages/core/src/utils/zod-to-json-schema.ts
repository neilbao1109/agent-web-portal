import type { ZodSchema } from "zod";
import { AWP_BLOB_MARKER, type BlobMetadata } from "../blob.ts";

/**
 * Convert a Zod schema to JSON Schema format
 * This is a simplified implementation for common Zod types
 */
export function zodToJsonSchema(schema: ZodSchema): Record<string, unknown> {
  const def = (schema as any)._def;

  if (!def) {
    return { type: "object" };
  }

  return parseZodDef(def, schema);
}

/**
 * Check if a schema has blob marker and return its metadata
 */
function getBlobMetadataFromSchema(schema: any): BlobMetadata | undefined {
  if (schema && typeof schema === "object" && AWP_BLOB_MARKER in schema) {
    return schema[AWP_BLOB_MARKER] as BlobMetadata;
  }
  return undefined;
}

function parseZodDef(def: any, originalSchema?: any): Record<string, unknown> {
  const typeName = def.typeName;

  switch (typeName) {
    case "ZodString": {
      // Check if this is a blob schema
      const blobMetadata = originalSchema ? getBlobMetadataFromSchema(originalSchema) : undefined;

      if (blobMetadata) {
        // Return blob-specific JSON Schema with x-awp-blob extension
        return {
          type: "string",
          format: "uri",
          "x-awp-blob": {
            ...(blobMetadata.mimeType && { mimeType: blobMetadata.mimeType }),
            ...(blobMetadata.maxSize && { maxSize: blobMetadata.maxSize }),
            ...(blobMetadata.description && { description: blobMetadata.description }),
          },
        };
      }

      return {
        type: "string",
        ...(def.minLength !== null && { minLength: def.minLength }),
        ...(def.maxLength !== null && { maxLength: def.maxLength }),
      };
    }

    case "ZodNumber":
      return {
        type: "number",
        ...(def.minimum !== undefined && { minimum: def.minimum }),
        ...(def.maximum !== undefined && { maximum: def.maximum }),
      };

    case "ZodBoolean":
      return { type: "boolean" };

    case "ZodNull":
      return { type: "null" };

    case "ZodUndefined":
      return {};

    case "ZodLiteral":
      return { const: def.value };

    case "ZodEnum":
      return {
        type: "string",
        enum: def.values,
      };

    case "ZodArray":
      return {
        type: "array",
        items: parseZodDef(def.type._def, def.type),
      };

    case "ZodObject": {
      const properties: Record<string, unknown> = {};
      const required: string[] = [];

      const shape = def.shape();
      for (const [key, value] of Object.entries(shape)) {
        // Pass the original schema to detect blob markers
        properties[key] = parseZodDef((value as any)._def, value);

        // Check if field is required (not optional)
        if ((value as any)._def.typeName !== "ZodOptional") {
          required.push(key);
        }
      }

      return {
        type: "object",
        properties,
        ...(required.length > 0 && { required }),
      };
    }

    case "ZodOptional":
      // Pass through the inner type's original schema for blob detection
      return parseZodDef(def.innerType._def, def.innerType);

    case "ZodNullable": {
      const inner = parseZodDef(def.innerType._def, def.innerType);
      return {
        ...inner,
        nullable: true,
      };
    }

    case "ZodDefault":
      return {
        ...parseZodDef(def.innerType._def, def.innerType),
        default: def.defaultValue(),
      };

    case "ZodUnion": {
      const options = def.options.map((opt: any) => parseZodDef(opt._def, opt));
      return { oneOf: options };
    }

    case "ZodRecord":
      return {
        type: "object",
        additionalProperties: parseZodDef(def.valueType._def, def.valueType),
      };

    case "ZodTuple": {
      const items = def.items.map((item: any) => parseZodDef(item._def, item));
      return {
        type: "array",
        items,
        minItems: items.length,
        maxItems: items.length,
      };
    }

    case "ZodAny":
      return {};

    case "ZodUnknown":
      return {};

    case "ZodVoid":
      return {};

    case "ZodEffects":
      // For transformed schemas, use the inner schema
      return parseZodDef(def.schema._def, def.schema);

    case "ZodIntersection": {
      const left = parseZodDef(def.left._def, def.left);
      const right = parseZodDef(def.right._def, def.right);
      return { allOf: [left, right] };
    }

    case "ZodDiscriminatedUnion": {
      const options = Array.from(def.optionsMap.values()).map((opt: any) =>
        parseZodDef(opt._def, opt)
      );
      return {
        oneOf: options,
        discriminator: { propertyName: def.discriminator },
      };
    }

    default:
      // Fallback for unknown types
      return { type: "object" };
  }
}
