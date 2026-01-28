/**
 * BlobMarkdown Component
 *
 * A Markdown renderer that automatically resolves blob:// URLs in images
 */

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components, UrlTransform } from "react-markdown";
import type { StorageProvider } from "@agent-web-portal/client";
import { BlobImage, isBlobUri } from "./BlobImage";

export interface BlobMarkdownProps {
  /** The markdown content to render */
  children: string;
  /** Storage provider for resolving blob URLs */
  storage?: StorageProvider;
  /** Additional components to override */
  components?: Components;
  /** Class name for the container */
  className?: string;
}

/**
 * Custom URL transform that allows blob:// and awp:// URLs
 * By default, react-markdown sanitizes URLs and removes non-http(s) protocols
 */
const allowBlobUrlTransform: UrlTransform = (url: string) => {
  // Allow blob:// and awp:// URLs through without modification
  if (url.startsWith("blob://") || url.startsWith("awp://")) {
    return url;
  }
  // Allow http(s) URLs
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("/")) {
    return url;
  }
  // Allow data URLs
  if (url.startsWith("data:")) {
    return url;
  }
  // Default: allow the URL as-is (could also return empty string to block)
  return url;
};

/**
 * BlobMarkdown - Renders markdown with automatic blob URL resolution for images
 *
 * Usage:
 * ```tsx
 * <BlobMarkdown storage={storageProvider}>
 *   Here is an image: ![Generated](blob://abc123)
 * </BlobMarkdown>
 * ```
 */
export function BlobMarkdown({
  children,
  storage,
  components,
  className,
}: BlobMarkdownProps) {
  // Create custom components that handle blob URLs
  const blobComponents: Components = {
    // Override img to use BlobImage for blob:// URLs
    img: ({ src, alt, node, ...props }) => {
      // Handle case where src might be an object (e.g., { uri: "blob://..." })
      let resolvedSrc = src;
      if (typeof src === "object" && src !== null) {
        const srcObj = src as { uri?: string; url?: string };
        resolvedSrc = srcObj.uri || srcObj.url || "";
      }
      
      if (resolvedSrc && typeof resolvedSrc === "string" && isBlobUri(resolvedSrc)) {
        return <BlobImage src={resolvedSrc} alt={alt} storage={storage} />;
      }
      // Regular image
      return (
        <img
          src={typeof resolvedSrc === "string" ? resolvedSrc : ""}
          alt={alt}
          style={{ maxWidth: "100%", borderRadius: 8 }}
          {...props}
        />
      );
    },
    // Merge with user-provided components
    ...components,
  };

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={blobComponents}
      urlTransform={allowBlobUrlTransform}
      className={className}
    >
      {children}
    </ReactMarkdown>
  );
}

/**
 * Helper to extract blob URIs from markdown content
 */
export function extractBlobUris(content: string): string[] {
  const uris: string[] = [];
  
  // Match markdown image syntax: ![alt](blob://...)
  const markdownImageRegex = /!\[([^\]]*)\]\((blob:\/\/[^)]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = markdownImageRegex.exec(content)) !== null) {
    if (match[2]) {
      uris.push(match[2]);
    }
  }

  // Match awp:// URLs as well
  const awpImageRegex = /!\[([^\]]*)\]\((awp:\/\/[^)]+)\)/g;
  while ((match = awpImageRegex.exec(content)) !== null) {
    if (match[2]) {
      uris.push(match[2]);
    }
  }

  return uris;
}
