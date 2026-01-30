/**
 * CAS Client Core - Blob Reference Utilities
 *
 * Tools for creating, parsing, and manipulating CAS blob references
 */

import type { CasBlobRef, CasNode, CasRawCollectionNode, ParsedEndpoint } from "./types.ts";

/**
 * Create a CAS blob reference
 *
 * @param endpoint - Full endpoint URL with ticket: https://host/api/cas/{shard}/ticket/{ticketId}
 * @param casNode - DAG root node key (e.g., "sha256:...")
 * @param path - Path to the blob ("." for node itself, "./path/to/file" for collection child)
 * @param pathKey - Optional custom path key name (default: "path")
 */
export function createBlobRef(
  endpoint: string,
  casNode: string,
  path: string = ".",
  pathKey: string = "path"
): CasBlobRef {
  return {
    "#cas-endpoint": endpoint,
    "cas-node": casNode,
    [pathKey]: path,
  };
}

/**
 * Parse the #cas-endpoint URL to extract components
 *
 * Expected format: https://host/api/cas/{shard}/ticket/{ticketId}
 *
 * @throws Error if URL format is invalid
 */
export function parseEndpoint(endpointUrl: string): ParsedEndpoint {
  const url = new URL(endpointUrl);

  // Match pattern: /api/cas/{shard}/ticket/{ticketId}
  const match = url.pathname.match(/^\/api\/cas\/([^/]+)\/ticket\/([^/]+)$/);
  if (!match) {
    throw new Error(
      `Invalid CAS endpoint URL format: ${endpointUrl}. Expected: https://host/api/cas/{shard}/ticket/{ticketId}`
    );
  }

  const [, shard, ticketId] = match;
  const baseUrl = `${url.protocol}//${url.host}`;

  return {
    baseUrl,
    shard: shard!,
    ticketId: ticketId!,
  };
}

/**
 * Build a CAS endpoint URL from components
 */
export function buildEndpoint(baseUrl: string, shard: string, ticketId: string): string {
  const base = baseUrl.replace(/\/$/, "");
  return `${base}/api/cas/${encodeURIComponent(shard)}/ticket/${encodeURIComponent(ticketId)}`;
}

/**
 * Extract path fields from a blob reference (excluding #cas-endpoint and cas-node)
 */
export function extractPaths(ref: CasBlobRef): Record<string, string> {
  const paths: Record<string, string> = {};
  for (const [key, value] of Object.entries(ref)) {
    if (key !== "#cas-endpoint" && key !== "cas-node") {
      paths[key] = value;
    }
  }
  return paths;
}

/**
 * Check if a value is a CAS blob reference
 */
export function isBlobRef(value: unknown): value is CasBlobRef {
  return (
    typeof value === "object" &&
    value !== null &&
    "#cas-endpoint" in value &&
    "cas-node" in value &&
    typeof (value as CasBlobRef)["#cas-endpoint"] === "string" &&
    typeof (value as CasBlobRef)["cas-node"] === "string"
  );
}

/**
 * Resolve a path within a collection node to get the target key
 *
 * @param rootNode - The root node (must be a collection for non-"." paths)
 * @param path - Path to resolve ("." or "./path/to/child")
 * @param getNode - Function to fetch child nodes for nested paths
 * @returns The CAS key of the resolved node
 * @throws Error if path is invalid or node not found
 *
 * @example
 * ```typescript
 * // For a file node
 * const key = await resolvePath(fileNode, ".", getNode); // returns fileNode.key
 *
 * // For a collection
 * const key = await resolvePath(collectionNode, "./images/photo.png", getNode);
 * ```
 */
export async function resolvePath(
  rootNode: CasNode,
  path: string,
  getNode: (key: string) => Promise<CasNode>
): Promise<string> {
  // "." means the node itself
  if (path === ".") {
    return rootNode.key;
  }

  // Must start with "./"
  if (!path.startsWith("./")) {
    throw new Error(`Invalid path format: ${path}. Must be "." or start with "./"`);
  }

  // Split path and traverse
  const parts = path.slice(2).split("/").filter(Boolean);

  if (parts.length === 0) {
    return rootNode.key;
  }

  let currentNode = rootNode;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;

    if (currentNode.kind !== "collection") {
      const remainingPath = parts.slice(i).join("/");
      throw new Error(`Cannot traverse into ${currentNode.kind} node at path: ${remainingPath}`);
    }

    const childKey = currentNode.children[part];
    if (!childKey) {
      throw new Error(`Child "${part}" not found in collection`);
    }

    // If this is the last part, return the key
    if (i === parts.length - 1) {
      // childKey is a CasNode, extract its key
      return typeof childKey === "string" ? childKey : (childKey as CasNode).key;
    }

    // Fetch the child node for further traversal
    const childNode = typeof childKey === "string" ? await getNode(childKey) : childKey;
    currentNode = childNode as CasNode;
  }

  return currentNode.key;
}

/**
 * Resolve a path using raw collection nodes (for internal use)
 */
export async function resolvePathRaw(
  rootKey: string,
  path: string,
  getRawNode: (key: string) => Promise<CasRawCollectionNode | null>
): Promise<string> {
  if (path === ".") {
    return rootKey;
  }

  if (!path.startsWith("./")) {
    throw new Error(`Invalid path format: ${path}. Must be "." or start with "./"`);
  }

  const parts = path.slice(2).split("/").filter(Boolean);

  if (parts.length === 0) {
    return rootKey;
  }

  let currentKey = rootKey;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;

    const node = await getRawNode(currentKey);
    if (!node) {
      throw new Error(`Node not found: ${currentKey}`);
    }

    if (node.kind !== "collection") {
      throw new Error(`Cannot traverse into ${node.kind} node`);
    }

    const childKey = node.children[part];
    if (!childKey) {
      throw new Error(`Child "${part}" not found in collection`);
    }

    currentKey = childKey;
  }

  return currentKey;
}
