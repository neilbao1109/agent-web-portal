/**
 * BlobImage Component
 *
 * Renders images from blob:// URLs by converting them to presigned URLs
 */

import { useState, useEffect } from "react";
import { Box, CircularProgress, Typography } from "@mui/material";
import { BrokenImage } from "@mui/icons-material";
import type { StorageProvider } from "@agent-web-portal/client";

export interface BlobImageProps {
  /** The blob URI (e.g., blob://abc123 or the full URL) */
  src: string;
  /** Alt text for the image */
  alt?: string;
  /** Storage provider for resolving blob URLs */
  storage?: StorageProvider;
  /** Optional CSS styles */
  style?: React.CSSProperties;
  /** Optional class name */
  className?: string;
}

/**
 * Check if a URL is a blob URI that needs resolution
 * Matches: blob://..., awp://..., or output-* pattern (blob ID without prefix)
 */
export function isBlobUri(url: string): boolean {
  return (
    url.startsWith("blob://") ||
    url.startsWith("awp://") ||
    url.startsWith("output-") ||
    /^[a-zA-Z0-9]+-\d+-[a-zA-Z0-9]+$/.test(url) // Pattern: prefix-timestamp-random
  );
}

/**
 * Normalize a blob URI to ensure it has the blob:// prefix
 */
export function normalizeBlobUri(uri: string): string {
  if (uri.startsWith("blob://") || uri.startsWith("awp://")) {
    return uri;
  }
  // Add blob:// prefix if it's a blob ID without prefix
  if (uri.startsWith("output-") || /^[a-zA-Z0-9]+-\d+-[a-zA-Z0-9]+$/.test(uri)) {
    return `blob://${uri}`;
  }
  return uri;
}

/**
 * BlobImage component that resolves blob:// URLs to presigned URLs
 */
export function BlobImage({ src, alt, storage, style, className }: BlobImageProps) {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function resolveUrl() {
      // If it's not a blob URL, use it directly
      if (!isBlobUri(src)) {
        setResolvedUrl(src);
        setLoading(false);
        return;
      }

      // If no storage provider, we can't resolve
      if (!storage) {
        setError("No storage provider available");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // Normalize the URI to ensure it has the blob:// prefix
        const normalizedUri = normalizeBlobUri(src);
        console.log("[BlobImage] Resolving:", src, "->", normalizedUri);

        // Use the storage provider to get a presigned URL
        const presignedUrl = await storage.generatePresignedGetUrl(normalizedUri);
        console.log("[BlobImage] Presigned URL:", presignedUrl);

        if (!cancelled) {
          setResolvedUrl(presignedUrl);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to resolve blob URL:", err);
          setError(err instanceof Error ? err.message : "Failed to load image");
          setLoading(false);
        }
      }
    }

    resolveUrl();

    return () => {
      cancelled = true;
    };
  }, [src, storage]);

  if (loading) {
    return (
      <Box
        sx={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          minWidth: 100,
          minHeight: 100,
          bgcolor: "grey.100",
          borderRadius: 1,
        }}
      >
        <CircularProgress size={24} />
      </Box>
    );
  }

  if (error || !resolvedUrl) {
    return (
      <Box
        sx={{
          display: "inline-flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minWidth: 100,
          minHeight: 100,
          bgcolor: "grey.100",
          borderRadius: 1,
          p: 1,
        }}
      >
        <BrokenImage color="disabled" />
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
          {error || "Image not available"}
        </Typography>
      </Box>
    );
  }

  return (
    <img
      src={resolvedUrl}
      alt={alt || "Generated image"}
      style={{
        maxWidth: "100%",
        borderRadius: 8,
        ...style,
      }}
      className={className}
    />
  );
}
