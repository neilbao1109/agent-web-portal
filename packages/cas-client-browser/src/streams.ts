/**
 * CAS Client Browser - Stream Utilities
 *
 * Conversion utilities between Web ReadableStream and platform-agnostic ByteStream
 */

import type { ByteStream } from "@agent-web-portal/cas-client-core";

/**
 * Convert ByteStream (AsyncIterable<Uint8Array>) to Web ReadableStream
 */
export function byteStreamToReadableStream(stream: ByteStream): ReadableStream<Uint8Array> {
  const iterator = stream[Symbol.asyncIterator]();

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await iterator.next();
      if (done) {
        controller.close();
      } else {
        controller.enqueue(value);
      }
    },
    cancel() {
      // If the iterator has a return method, call it for cleanup
      if (iterator.return) {
        iterator.return();
      }
    },
  });
}

/**
 * Convert Web ReadableStream to ByteStream (AsyncIterable<Uint8Array>)
 */
export async function* readableStreamToByteStream(stream: ReadableStream<Uint8Array>): ByteStream {
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Convert ByteStream to Blob
 */
export async function byteStreamToBlob(
  stream: ByteStream,
  type: string = "application/octet-stream"
): Promise<Blob> {
  const chunks: ArrayBuffer[] = [];
  for await (const chunk of stream) {
    // Create a fresh ArrayBuffer copy to ensure compatibility
    const buffer = new ArrayBuffer(chunk.byteLength);
    new Uint8Array(buffer).set(chunk);
    chunks.push(buffer);
  }
  return new Blob(chunks, { type });
}

/**
 * Convert Blob to ByteStream
 */
export async function* blobToByteStream(blob: Blob): ByteStream {
  const stream = blob.stream();
  yield* readableStreamToByteStream(stream);
}

/**
 * Convert ByteStream to ArrayBuffer
 */
export async function byteStreamToArrayBuffer(stream: ByteStream): Promise<ArrayBuffer> {
  const chunks: Uint8Array[] = [];
  let totalLength = 0;

  for await (const chunk of stream) {
    chunks.push(chunk);
    totalLength += chunk.length;
  }

  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result.buffer;
}

/**
 * Create ByteStream from ArrayBuffer
 */
export async function* arrayBufferToByteStream(buffer: ArrayBuffer): ByteStream {
  yield new Uint8Array(buffer);
}
