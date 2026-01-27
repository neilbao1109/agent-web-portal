/**
 * @agent-web-portal/client-nodejs
 *
 * Node.js-specific storage implementation for AWP client.
 *
 * @example
 * ```typescript
 * import { AwpAuth } from "@agent-web-portal/client";
 * import { FileKeyStorage } from "@agent-web-portal/client-nodejs";
 *
 * const auth = new AwpAuth({
 *   clientName: "My AI Agent",
 *   keyStorage: new FileKeyStorage({ directory: "~/.awp/keys" }),
 * });
 * ```
 */

export { FileKeyStorage, type FileKeyStorageOptions } from "./file-storage.ts";
