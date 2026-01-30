/**
 * CAS Client Node.js - Stream Utilities
 *
 * Conversion utilities between Node.js streams and platform-agnostic ByteStream
 */

import { Readable } from "node:stream";
import type { ByteStream } from "@anthropic/cas-client-core";

/**
 * Convert a Node.js Readable stream to ByteStream (AsyncIterable<Uint8Array>)
 */
export async function* readableToByteStream(readable: Readable): ByteStream {
  for await (const chunk of readable) {
    yield Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
  }
}

/**
 * Convert ByteStream to Node.js Readable
 */
export function byteStreamToReadable(stream: ByteStream): Readable {
  return Readable.from(stream);
}

/**
 * Convert ByteStream to Buffer
 */
export async function byteStreamToBuffer(stream: ByteStream): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * Create ByteStream from Buffer
 */
export async function* bufferToByteStream(buffer: Buffer): ByteStream {
  yield buffer;
}
