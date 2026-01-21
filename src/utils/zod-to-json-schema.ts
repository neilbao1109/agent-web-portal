import type { ZodSchema } from "zod";

/**
 * Convert a Zod schema to JSON Schema format
 * This is a simplified implementation for common Zod types
 */
export function zodToJsonSchema(schema: ZodSchema): Record<string, unknown> {
  const def = (schema as any)._def;

  if (!def) {
    return { type: "object" };
  }

  return parseZodDef(def);
}

function parseZodDef(def: any): Record<string, unknown> {
  const typeName = def.typeName;

  switch (typeName) {
    case "ZodString":
      return {
        type: "string",
        ...(def.minLength !== null && { minLength: def.minLength }),
        ...(def.maxLength !== null && { maxLength: def.maxLength }),
      };

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
        items: parseZodDef(def.type._def),
      };

    case "ZodObject": {
      const properties: Record<string, unknown> = {};
      const required: string[] = [];

      const shape = def.shape();
      for (const [key, value] of Object.entries(shape)) {
        properties[key] = parseZodDef((value as any)._def);
        
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
      return parseZodDef(def.innerType._def);

    case "ZodNullable": {
      const inner = parseZodDef(def.innerType._def);
      return {
        ...inner,
        nullable: true,
      };
    }

    case "ZodDefault":
      return {
        ...parseZodDef(def.innerType._def),
        default: def.defaultValue(),
      };

    case "ZodUnion": {
      const options = def.options.map((opt: any) => parseZodDef(opt._def));
      return { oneOf: options };
    }

    case "ZodRecord":
      return {
        type: "object",
        additionalProperties: parseZodDef(def.valueType._def),
      };

    case "ZodTuple": {
      const items = def.items.map((item: any) => parseZodDef(item._def));
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
      return parseZodDef(def.schema._def);

    case "ZodIntersection": {
      const left = parseZodDef(def.left._def);
      const right = parseZodDef(def.right._def);
      return { allOf: [left, right] };
    }

    case "ZodDiscriminatedUnion": {
      const options = Array.from(def.optionsMap.values()).map((opt: any) =>
        parseZodDef(opt._def)
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
