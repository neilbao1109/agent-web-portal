/**
 * CAS Client Core - Stream Utilities
 *
 * Platform-agnostic stream operations using AsyncIterable<Uint8Array>
 */

import type { ByteStream } from "./types.ts";

/**
 * Concatenate multiple byte arrays into one
 */
export function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

/**
 * Collect a byte stream into a single Uint8Array
 */
export async function collectBytes(stream: ByteStream): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return concatBytes(chunks);
}

/**
 * Create a byte stream from a Uint8Array
 */
export async function* bytesAsStream(data: Uint8Array): ByteStream {
  yield data;
}

/**
 * Create a byte stream from multiple Uint8Arrays
 */
export async function* chunksAsStream(chunks: Uint8Array[]): ByteStream {
  for (const chunk of chunks) {
    yield chunk;
  }
}

/**
 * Concatenate multiple byte streams into one
 */
export async function* concatStreams(streams: ByteStream[]): ByteStream {
  for (const stream of streams) {
    yield* stream;
  }
}

/**
 * Concatenate byte streams lazily (streams provided by factories)
 */
export async function* concatStreamFactories(
  factories: (() => ByteStream | Promise<ByteStream>)[]
): ByteStream {
  for (const factory of factories) {
    const stream = await factory();
    yield* stream;
  }
}

/**
 * Slice a byte stream to a specific range
 * Note: This consumes the entire stream up to `end`, so not efficient for large files
 */
export async function* sliceStream(stream: ByteStream, start: number, end: number): ByteStream {
  let position = 0;

  for await (const chunk of stream) {
    const chunkEnd = position + chunk.length;

    // Skip if entirely before start
    if (chunkEnd <= start) {
      position = chunkEnd;
      continue;
    }

    // Stop if entirely after end
    if (position >= end) {
      break;
    }

    // Calculate slice within this chunk
    const sliceStart = Math.max(0, start - position);
    const sliceEnd = Math.min(chunk.length, end - position);

    yield chunk.slice(sliceStart, sliceEnd);
    position = chunkEnd;

    // Stop if we've reached the end
    if (chunkEnd >= end) {
      break;
    }
  }
}

/**
 * Split content into chunks based on threshold
 */
export function splitIntoChunks(content: Uint8Array, threshold: number): Uint8Array[] {
  if (content.length <= threshold) {
    return [content];
  }

  const chunks: Uint8Array[] = [];
  let offset = 0;

  while (offset < content.length) {
    const end = Math.min(offset + threshold, content.length);
    chunks.push(content.slice(offset, end));
    offset = end;
  }

  return chunks;
}

/**
 * Check if content needs chunking
 */
export function needsChunking(size: number, threshold: number): boolean {
  return size > threshold;
}
