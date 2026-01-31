/**
 * Black Forest Labs (BFL) FLUX API Client
 *
 * Supports async polling for result retrieval
 */

// ============================================================================
// Constants & Types
// ============================================================================

export const DEFAULT_BFL_API_HOST = "https://api.bfl.ai";

export function getBflApiHost(): string {
  const raw =
    process.env.BFL_API_HOST ??
    process.env.BFL_API_BASE_URL ??
    process.env.BFL_BASE_URL ??
    DEFAULT_BFL_API_HOST;
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

const POLL_INTERVAL_MS = 1000;
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export const BFL_ENDPOINTS = {
  FLUX_PRO_1_1: "/v1/flux-pro-1.1",
  FLUX_DEV: "/v1/flux-dev",
  FLUX_KONTEXT_PRO: "/v1/flux-kontext-pro",
  FLUX_KONTEXT_MAX: "/v1/flux-kontext-max",
  FLUX_FILL: "/v1/flux-pro-1.1-fill",
  FLUX_EXPAND: "/v1/flux-pro-1.1-canny-expand",
  GET_RESULT: "/v1/get_result",
} as const;

export type BflEndpoint = (typeof BFL_ENDPOINTS)[keyof typeof BFL_ENDPOINTS] | string;

export type BflTaskStatus =
  | "Pending"
  | "Ready"
  | "Error"
  | "Failed"
  | "Request Moderated"
  | "Content Moderated";

export interface BflResultResponse {
  id: string;
  status: BflTaskStatus;
  result?: {
    sample?: string;
    seed?: number;
  };
}

export interface BflImageResponse {
  id: string;
  imageUrl: string;
  seed?: number;
}

export interface BflSubmitResponse {
  id: string;
  pollingUrl?: string;
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Submit a task to the BFL API
 */
export async function submitBflTask(
  endpoint: BflEndpoint,
  apiKey: string,
  body: Record<string, unknown>
): Promise<BflSubmitResponse> {
  const url = `${getBflApiHost()}${endpoint}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      accept: "application/json",
      "Content-Type": "application/json",
      "x-key": apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`BFL API error: ${response.status} - ${errorText}`);
  }

  const data = (await response.json()) as {
    id?: unknown;
    polling_url?: unknown;
    pollingUrl?: unknown;
  };

  if (typeof data.id !== "string" || !data.id) {
    throw new Error(`BFL API error: invalid response from ${url} (missing id)`);
  }

  const pollingUrlRaw = data.polling_url ?? data.pollingUrl;

  return {
    id: data.id,
    pollingUrl: typeof pollingUrlRaw === "string" && pollingUrlRaw ? pollingUrlRaw : undefined,
  };
}

/**
 * Get the result of a task
 */
export async function getTaskResult(
  pollingUrlOrTaskId: string,
  apiKey: string
): Promise<BflResultResponse> {
  const url = resolvePollingUrlOrLegacyTaskId(pollingUrlOrTaskId);
  const response = await fetch(url, {
    method: "GET",
    headers: { accept: "application/json", "x-key": apiKey },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`BFL get_result error: ${response.status} - ${errorText}`);
  }

  return (await response.json()) as BflResultResponse;
}

function resolvePollingUrlOrLegacyTaskId(pollingUrlOrTaskId: string): string {
  if (pollingUrlOrTaskId.startsWith("http://") || pollingUrlOrTaskId.startsWith("https://")) {
    return pollingUrlOrTaskId;
  }

  if (pollingUrlOrTaskId.startsWith("/")) {
    return `${getBflApiHost()}${pollingUrlOrTaskId}`;
  }

  return `${getBflApiHost()}${BFL_ENDPOINTS.GET_RESULT}?id=${encodeURIComponent(pollingUrlOrTaskId)}`;
}

/**
 * Wait for a task to complete with polling
 */
export async function waitForResult(
  task: BflSubmitResponse,
  apiKey: string,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<BflResultResponse> {
  const startTime = Date.now();
  const pollingTarget = task.pollingUrl ?? task.id;

  while (Date.now() - startTime < timeoutMs) {
    const result = await getTaskResult(pollingTarget, apiKey);

    if (result.status === "Ready") {
      return result;
    }

    if (result.status === "Error" || result.status === "Failed") {
      throw new Error(`BFL task failed with status: ${result.status}`);
    }

    if (result.status === "Request Moderated" || result.status === "Content Moderated") {
      throw new Error(`BFL content moderated: ${result.status}`);
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error("BFL task timeout");
}

/**
 * Call BFL API and wait for result
 */
export async function callBflApi(
  endpoint: BflEndpoint,
  apiKey: string,
  body: Record<string, unknown>,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<BflImageResponse> {
  const task = await submitBflTask(endpoint, apiKey, body);
  const result = await waitForResult(task, apiKey, timeoutMs);

  if (!result.result?.sample) {
    throw new Error("No image URL in BFL result");
  }

  return {
    id: task.id,
    imageUrl: result.result.sample,
    seed: result.result.seed,
  };
}

/**
 * Fetch image from URL and return as Uint8Array
 */
export async function urlToBuffer(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status}`);
  }
  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
}

/**
 * Get content type from format
 */
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
