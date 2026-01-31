/**
 * Stability AI API Client
 *
 * Utilities for interacting with Stability AI v1 and v2beta endpoints
 */

// ============================================================================
// Constants & Types
// ============================================================================

export const STABILITY_API_HOST = "https://api.stability.ai";

export interface StabilityImageResponse {
  image: string; // Base64 encoded image
  mimeType: string;
  seed: number;
  finishReason: "SUCCESS" | "CONTENT_FILTERED" | "ERROR";
}

// ============================================================================
// Helpers
// ============================================================================

export function getContentType(format: string): string {
  switch (format) {
    case "jpeg":
    case "jpg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    default:
      return "image/png";
  }
}

// ============================================================================
// Multipart Form Data Builder
// ============================================================================

function buildMultipartFormData(
  fields: Record<string, string | number | undefined>,
  files: Record<string, { buffer: Uint8Array; filename: string } | undefined>
): { body: Uint8Array; contentType: string } {
  const boundary = `----FormBoundary${Date.now()}${Math.random().toString(36).substring(2)}`;
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];

  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    parts.push(
      encoder.encode(
        `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="${key}"\r\n\r\n` +
          `${value}\r\n`
      )
    );
  }

  for (const [key, file] of Object.entries(files)) {
    if (!file) continue;
    parts.push(
      encoder.encode(
        `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="${key}"; filename="${file.filename}"\r\n` +
          `Content-Type: application/octet-stream\r\n\r\n`
      )
    );
    parts.push(file.buffer);
    parts.push(encoder.encode("\r\n"));
  }

  parts.push(encoder.encode(`--${boundary}--\r\n`));

  // Concatenate all parts
  const totalLength = parts.reduce((acc, part) => acc + part.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }

  return {
    body: result,
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

// ============================================================================
// API Calls
// ============================================================================

/**
 * Call Stability AI v2beta API (multipart form)
 */
export async function callStabilityApi(
  endpoint: string,
  apiKey: string,
  fields: Record<string, string | number | undefined>,
  files: Record<string, { buffer: Uint8Array; filename: string } | undefined>,
  outputFormat = "png"
): Promise<StabilityImageResponse> {
  const { body, contentType } = buildMultipartFormData(
    { ...fields, output_format: outputFormat },
    files
  );

  const response = await fetch(`${STABILITY_API_HOST}${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": contentType,
      Accept: "application/json",
    },
    body: body as BodyInit,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Stability API error: ${response.status} - ${errorText}`);
  }

  const data = (await response.json()) as Record<string, unknown>;

  interface StabilityArtifact {
    base64?: string;
    image?: string;
    seed?: number;
    finish_reason?: string;
    finishReason?: string;
  }
  const artifacts = data.artifacts as StabilityArtifact[] | undefined;
  const artifact: StabilityArtifact = artifacts?.[0] ?? (data as StabilityArtifact);

  const imageData = artifact.base64 || artifact.image;
  if (!imageData) {
    throw new Error("No image data in Stability API response");
  }

  const finishReason = artifact.finish_reason || artifact.finishReason || "SUCCESS";
  const validFinishReasons = ["SUCCESS", "CONTENT_FILTERED", "ERROR"] as const;
  const normalizedFinishReason = validFinishReasons.includes(
    finishReason as (typeof validFinishReasons)[number]
  )
    ? (finishReason as StabilityImageResponse["finishReason"])
    : "SUCCESS";

  return {
    image: imageData,
    mimeType: getContentType(outputFormat),
    seed: artifact.seed ?? 0,
    finishReason: normalizedFinishReason,
  };
}

/**
 * Call Stability AI v1 API (JSON body, for text-to-image)
 */
export async function callStabilityApiV1(
  endpoint: string,
  apiKey: string,
  body: Record<string, unknown>,
  outputFormat = "png"
): Promise<StabilityImageResponse> {
  const response = await fetch(`${STABILITY_API_HOST}${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Stability API error: ${response.status} - ${errorText}`);
  }

  const data = (await response.json()) as Record<string, unknown>;

  interface StabilityArtifact {
    base64?: string;
    seed?: number;
    finishReason?: string;
  }
  const artifacts = data.artifacts as StabilityArtifact[] | undefined;
  const artifact = artifacts?.[0];

  if (!artifact || !artifact.base64) {
    throw new Error("No image returned from Stability API");
  }

  const finishReason = artifact.finishReason || "SUCCESS";
  const validFinishReasons = ["SUCCESS", "CONTENT_FILTERED", "ERROR"] as const;
  const normalizedFinishReason = validFinishReasons.includes(
    finishReason as (typeof validFinishReasons)[number]
  )
    ? (finishReason as StabilityImageResponse["finishReason"])
    : "SUCCESS";

  return {
    image: artifact.base64,
    mimeType: getContentType(outputFormat),
    seed: artifact.seed ?? 0,
    finishReason: normalizedFinishReason,
  };
}
