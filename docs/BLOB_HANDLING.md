# AWP Blob Handling Architecture

This document describes how binary data (blobs) flows between LLM, Agent Runtime, and AWP (Agent Web Portal) servers.

## Overview

AWP provides a seamless blob handling mechanism that abstracts away the complexity of binary data transfer. The system uses presigned URLs for secure, temporary access to blob storage, while presenting a clean URI-based interface to LLMs.

```
┌─────────┐     URI-based      ┌─────────────┐    URL-based     ┌─────────────┐
│   LLM   │ ◄─────────────────► │ AWP Client  │ ◄───────────────► │ AWP Server  │
│         │   (Permanent IDs)   │   (Agent)   │  (Presigned URLs) │   (Tools)   │
└─────────┘                     └─────────────┘                   └─────────────┘
```

## Key Concepts

### Two Schema Formats

AWP maintains two different schema representations for the same tool:

| Aspect | LLM-Facing (Agent Runtime) | Tool-Facing (MCP Server) |
|--------|---------------------------|-------------------------|
| Input Blob | `{ uri: string, contentType?: string }` | `{ url: string, contentType?: string }` |
| Output Blob Input | `{ accept?: string }` | `{ url: string, accept?: string }` |
| Output Blob Result | `{ uri: string, contentType?: string }` | `{ contentType?: string }` |

### Why Two Formats?

1. **LLM-Facing (URI-based)**
   - Uses permanent resource identifiers (e.g., `awp://portal/images/abc123`)
   - LLM doesn't need to know about temporary presigned URLs
   - URIs can be stored, referenced, and chained across tool calls
   - Output blobs don't require LLM to provide URLs (runtime generates them)

2. **Tool-Facing (URL-based)**
   - Uses presigned URLs for direct HTTP access
   - Tools can read/write blobs using standard HTTP GET/PUT
   - No SDK or special authentication required
   - URLs are short-lived and secure

## The `_awp` Extension

AWP extends the MCP tool schema with an `_awp` field that describes blob metadata:

```json
{
  "name": "remove_background",
  "description": "Remove background from an image",
  "inputSchema": {
    "type": "object",
    "properties": {
      "image": {
        "type": "object",
        "properties": {
          "url": { "type": "string", "format": "uri" },
          "contentType": { "type": "string" }
        },
        "required": ["url"]
      },
      "result": {
        "type": "object", 
        "properties": {
          "url": { "type": "string", "format": "uri" },
          "accept": { "type": "string" }
        },
        "required": ["url"]
      }
    },
    "required": ["image", "result"]
  },
  "_awp": {
    "blob": {
      "input": {
        "image": "Source image to process"
      },
      "output": {
        "result": "Processed image with background removed"
      }
    }
  }
}
```

The `_awp.blob` structure groups blob fields by direction:
- `input`: Fields the tool reads from (input blobs)
- `output`: Fields the tool writes to (output blobs)

## Data Flow

### 1. Tool Discovery (tools/list)

```
AWP Server                    AWP Client                      LLM
    │                             │                            │
    │◄─── tools/list ─────────────│                            │
    │                             │                            │
    │──── Tool schemas ──────────►│                            │
    │     (Tool-facing format)    │                            │
    │                             │                            │
    │                             │──── Transform to ─────────►│
    │                             │     LLM-facing format      │
    │                             │                            │
```

**Transformation (Tool → LLM):**
- Input blobs: `url` → `uri`
- Output blobs: Remove from input schema (LLM doesn't provide output URLs)

### 2. Tool Invocation (tools/call)

```
LLM                          AWP Client                     AWP Server
 │                               │                              │
 │── Call with:                  │                              │
 │   image: { uri: "awp://..." } │                              │
 │   result: { accept: "png" }   │                              │
 │──────────────────────────────►│                              │
 │                               │                              │
 │                               │── Resolve URIs ─────────────►│
 │                               │   to presigned GET URLs      │
 │                               │                              │
 │                               │── Generate output slots ────►│
 │                               │   (presigned PUT URLs)       │
 │                               │                              │
 │                               │── Forward to server: ───────►│
 │                               │   image: { url: "https://presigned-get..." }
 │                               │   result: { url: "https://presigned-put..." }
 │                               │                              │
 │                               │                              │── Tool reads image via GET
 │                               │                              │── Tool writes result via PUT
 │                               │                              │
 │                               │◄── Response: ────────────────│
 │                               │    result: { contentType: "image/png" }
 │                               │                              │
 │                               │── Inject output URIs ────────│
 │                               │                              │
 │◄──────────────────────────────│                              │
 │   Response:                   │                              │
 │   result: {                   │                              │
 │     uri: "awp://output/xyz",  │                              │
 │     contentType: "image/png"  │                              │
 │   }                           │                              │
```

### 3. Blob Chaining

One of AWP's powerful features is **blob chaining** - using output from one tool as input to another:

```
LLM Request 1: txt2img
  └─► result: { uri: "awp://output/generated-image" }

LLM Request 2: remove_bg  
  └─► image: { uri: "awp://output/generated-image" }  ◄── Uses previous output!
  └─► result: { uri: "awp://output/no-bg-image" }
```

The AWP Client automatically resolves `awp://output/...` URIs to presigned read URLs, enabling seamless chaining without the LLM needing to manage storage.

## Implementation Details

### Defining Blob Fields (Server-Side)

```typescript
import { defineTool, inputBlob, outputBlob } from "@agent-web-portal/core";
import { z } from "zod";

const removeBackground = defineTool({
  name: "remove_bg",
  description: "Remove background from an image",
  
  inputSchema: z.object({
    image: inputBlob({ 
      description: "Source image",
      mimeType: "image/*" 
    }),
  }),
  
  outputSchema: z.object({
    result: outputBlob({ 
      description: "Image with background removed",
      accept: "image/png" 
    }),
  }),

  handler: async ({ image, result }) => {
    // image.url = presigned GET URL
    // result.url = presigned PUT URL
    
    const imageData = await fetch(image.url);
    const processed = await processImage(imageData);
    
    await fetch(result.url, {
      method: "PUT",
      body: processed,
      headers: { "Content-Type": "image/png" }
    });
    
    return {
      result: { contentType: "image/png" }
    };
  }
});
```

### AWP Client Translation

The AWP Client performs bidirectional translation:

**Request Translation (LLM → Tool):**
1. Extract input blob URIs from LLM arguments
2. Resolve URIs to presigned GET URLs via storage provider
3. Generate output blob slots with presigned PUT URLs
4. Replace `uri` with `url` in arguments

**Response Translation (Tool → LLM):**
1. Extract output blob results from tool response
2. Inject generated `uri` into each output blob
3. Return enriched response to LLM

### Storage Provider Interface

```typescript
interface StorageProvider {
  // Resolve a URI to a presigned read URL
  getPresignedReadUrl(uri: string): Promise<string>;
  
  // Create an output slot and return presigned write URL + final URI
  createOutputSlot(options: {
    prefix: string;
    accept?: string;
  }): Promise<{ 
    url: string;      // Presigned PUT URL
    uri: string;      // Permanent URI for the blob
    key: string;      // Storage key for chaining
  }>;
  
  // Prepare download (for UI/external access)
  prepareDownload(key: string): Promise<{
    url: string;      // Presigned GET URL
    contentType?: string;
  }>;
}
```

## URI Schemes

AWP supports multiple URI schemes:

| Scheme | Description | Example |
|--------|-------------|---------|
| `awp://` | AWP-managed storage | `awp://portal/images/abc123` |
| `s3://` | Direct S3 reference | `s3://bucket/key` |
| `https://` | Public URL (pass-through) | `https://example.com/image.png` |

## Security Considerations

1. **Presigned URLs are temporary** - Typically expire in 15-60 minutes
2. **URIs are permanent but opaque** - LLM cannot directly access storage
3. **Access control at resolution time** - AWP Client validates permissions when resolving URIs
4. **Separate read/write URLs** - Input blobs get read-only URLs, output blobs get write-only URLs

## Summary

The AWP blob handling system provides:

- **Clean LLM interface**: URIs instead of complex presigned URLs
- **Secure access**: Temporary presigned URLs with appropriate permissions  
- **Blob chaining**: Output from one tool can be input to another
- **Standard HTTP**: Tools use simple GET/PUT, no special SDK needed
- **Extensible metadata**: `_awp.blob` describes blob fields without polluting JSON Schema
