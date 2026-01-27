/**
 * Auth Window Utilities
 *
 * Provides utilities for browser-based authentication flows using
 * popup windows and postMessage for communication.
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Message sent from auth page to opener via postMessage
 */
export interface AuthCompleteMessage {
  type: "awp-auth-complete";
  pubkey: string;
  expiresAt?: number;
}

/**
 * Result of auth completion
 */
export interface AuthCompleteResult {
  authorized: boolean;
  expiresAt?: number;
}

/**
 * Options for opening auth window
 */
export interface OpenAuthWindowOptions {
  /** Window width (default: 600) */
  width?: number;
  /** Window height (default: 700) */
  height?: number;
  /** Window name (default: "awp-auth") */
  name?: string;
}

// ============================================================================
// Open Auth Window
// ============================================================================

/**
 * Open a popup window for authentication
 *
 * @param authUrl - The authorization URL to open
 * @param options - Window options
 * @returns The opened window reference, or null if blocked
 *
 * @example
 * ```typescript
 * const authWindow = openAuthWindow("https://example.com/auth/authorize?pubkey=xxx");
 * if (!authWindow) {
 *   alert("Please allow popups for this site");
 * }
 * ```
 */
export function openAuthWindow(
  authUrl: string,
  options: OpenAuthWindowOptions = {}
): Window | null {
  const { width = 600, height = 700, name = "awp-auth" } = options;

  // Calculate center position
  const left = Math.round((window.screen.width - width) / 2);
  const top = Math.round((window.screen.height - height) / 2);

  const features = [
    `width=${width}`,
    `height=${height}`,
    `left=${left}`,
    `top=${top}`,
    "menubar=no",
    "toolbar=no",
    "location=yes",
    "status=no",
    "resizable=yes",
    "scrollbars=yes",
  ].join(",");

  return window.open(authUrl, name, features);
}

// ============================================================================
// Listen for Auth Complete (postMessage)
// ============================================================================

/**
 * Listen for auth completion via postMessage from the auth page
 *
 * The auth page should send a message like:
 * ```javascript
 * window.opener?.postMessage({
 *   type: "awp-auth-complete",
 *   pubkey: "xxx",
 *   expiresAt: 1234567890000
 * }, document.referrer);
 * ```
 *
 * @param expectedPubkey - The public key to match
 * @param callback - Called when auth completes
 * @returns Cleanup function to remove listener
 *
 * @example
 * ```typescript
 * const cleanup = listenAuthComplete(pubkey, (result) => {
 *   if (result.authorized) {
 *     console.log("Authorized! Expires:", result.expiresAt);
 *   }
 * });
 *
 * // Later, when done:
 * cleanup();
 * ```
 */
export function listenAuthComplete(
  expectedPubkey: string,
  callback: (result: AuthCompleteResult) => void
): () => void {
  const handler = (event: MessageEvent) => {
    // Validate message structure
    const data = event.data as AuthCompleteMessage;
    if (
      data &&
      typeof data === "object" &&
      data.type === "awp-auth-complete" &&
      data.pubkey === expectedPubkey
    ) {
      callback({
        authorized: true,
        expiresAt: data.expiresAt,
      });
    }
  };

  window.addEventListener("message", handler);

  return () => {
    window.removeEventListener("message", handler);
  };
}

// ============================================================================
// Watch Window Closed
// ============================================================================

/**
 * Watch for auth window being closed by user
 *
 * @param authWindow - The window reference from openAuthWindow
 * @param callback - Called when window is closed
 * @param checkInterval - Interval to check window status (default: 500ms)
 * @returns Cleanup function to stop watching
 *
 * @example
 * ```typescript
 * const authWindow = openAuthWindow(authUrl);
 * const stopWatching = watchWindowClosed(authWindow, () => {
 *   console.log("User closed the auth window");
 * });
 *
 * // Later, when done:
 * stopWatching();
 * ```
 */
export function watchWindowClosed(
  authWindow: Window | null,
  callback: () => void,
  checkInterval = 500
): () => void {
  if (!authWindow) {
    // Window was blocked, call callback immediately
    setTimeout(callback, 0);
    return () => {};
  }

  const intervalId = setInterval(() => {
    if (authWindow.closed) {
      clearInterval(intervalId);
      callback();
    }
  }, checkInterval);

  return () => {
    clearInterval(intervalId);
  };
}

// ============================================================================
// Combined Auth Flow Helper
// ============================================================================

/**
 * Options for starting browser auth flow
 */
export interface BrowserAuthFlowOptions {
  /** The authorization URL */
  authUrl: string;
  /** The public key being authorized */
  pubkey: string;
  /** Callback when authorized (via postMessage or polling) */
  onAuthorized: (result: AuthCompleteResult) => void;
  /** Callback when user closes window without authorizing */
  onCancelled?: () => void;
  /** Window options */
  windowOptions?: OpenAuthWindowOptions;
}

/**
 * Start browser auth flow with postMessage listener and window close detection
 *
 * This combines openAuthWindow, listenAuthComplete, and watchWindowClosed
 * into a single convenient function.
 *
 * @returns Object with cleanup function and window reference
 *
 * @example
 * ```typescript
 * const { cleanup, authWindow } = startBrowserAuthFlow({
 *   authUrl: "https://example.com/auth/authorize?pubkey=xxx",
 *   pubkey: "xxx",
 *   onAuthorized: (result) => {
 *     console.log("Authorized!", result);
 *   },
 *   onCancelled: () => {
 *     console.log("User cancelled");
 *   },
 * });
 *
 * // Also start polling as fallback
 * pollAuthStatus(statusUrl, { interval: 10000 }).then((result) => {
 *   if (result.authorized) {
 *     cleanup();
 *     // Handle success
 *   }
 * });
 * ```
 */
export function startBrowserAuthFlow(options: BrowserAuthFlowOptions): {
  cleanup: () => void;
  authWindow: Window | null;
} {
  const { authUrl, pubkey, onAuthorized, onCancelled, windowOptions } = options;

  let completed = false;

  // Open auth window
  const authWindow = openAuthWindow(authUrl, windowOptions);

  // Listen for postMessage
  const cleanupListener = listenAuthComplete(pubkey, (result) => {
    if (!completed) {
      completed = true;
      cleanupWatch();
      onAuthorized(result);
    }
  });

  // Watch for window close
  const cleanupWatch = watchWindowClosed(authWindow, () => {
    if (!completed) {
      completed = true;
      cleanupListener();
      onCancelled?.();
    }
  });

  return {
    cleanup: () => {
      completed = true;
      cleanupListener();
      cleanupWatch();
      if (authWindow && !authWindow.closed) {
        authWindow.close();
      }
    },
    authWindow,
  };
}
