# @agent-web-portal/client-browser

Browser-specific storage implementations and utilities for the Agent Web Portal client SDK.

## Installation

```bash
npm install @agent-web-portal/client @agent-web-portal/client-browser
```

## Features

- **IndexedDBKeyStorage** - Persistent key storage using IndexedDB
- **LocalStorageKeyStorage** - Simple key storage using localStorage
- **Auth Window Utilities** - `openAuthWindow()`, `listenAuthComplete()` for postMessage-based auth flow

## Usage

### Key Storage

```typescript
import { AwpAuth } from "@agent-web-portal/client";
import { IndexedDBKeyStorage } from "@agent-web-portal/client-browser";

const auth = new AwpAuth({
  clientName: "My Web App",
  keyStorage: new IndexedDBKeyStorage(),
});
```

### Auth Window Flow

```typescript
import { pollAuthStatus } from "@agent-web-portal/client";
import {
  openAuthWindow,
  listenAuthComplete,
  watchWindowClosed,
} from "@agent-web-portal/client-browser";

// Open auth window
const authWindow = openAuthWindow(authUrl);

// Listen for postMessage from auth page
const cleanup = listenAuthComplete(pubkey, (result) => {
  if (result.authorized) {
    console.log("Authorized via postMessage!");
  }
});

// Also watch for window close (user cancelled)
const cleanupWatch = watchWindowClosed(authWindow, () => {
  console.log("User closed auth window");
});

// Fallback: poll for auth status
const controller = new AbortController();
const result = await pollAuthStatus(statusUrl, {
  interval: 10000, // 10 seconds
  signal: controller.signal,
});
```

## Storage Comparison

| Storage | Persistence | Capacity | Security |
|---------|-------------|----------|----------|
| IndexedDBKeyStorage | Permanent | Large (GB) | Good (origin-isolated) |
| LocalStorageKeyStorage | Permanent | Small (~5MB) | Basic (origin-isolated) |

## License

MIT
