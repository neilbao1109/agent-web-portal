# @agent-web-portal/client-react

React hooks and components for the Agent Web Portal client SDK.

## Installation

```bash
npm install @agent-web-portal/client @agent-web-portal/client-browser @agent-web-portal/client-react
```

## Features

- **useAwpAuth** - React hook for managing AWP authentication state
- **useAwpClient** - React hook for creating and using AWP client instances

## Usage

### Basic Setup

```tsx
import { useAwpAuth, useAwpClient } from "@agent-web-portal/client-react";

function MyApp() {
  const { isAuthenticated, startAuth, authState } = useAwpAuth({
    endpoint: "https://my-awp-server.com",
    clientName: "My Web App",
    pollInterval: 10000, // 10 seconds fallback polling
  });

  const client = useAwpClient({
    endpoint: "https://my-awp-server.com",
    auth: isAuthenticated ? authState.auth : undefined,
  });

  // Render auth UI when needed
  if (authState.status === "pending") {
    return (
      <div>
        <p>Verification code: {authState.verificationCode}</p>
        <a href={authState.authUrl} target="_blank">
          Complete authorization
        </a>
      </div>
    );
  }

  return (
    <button onClick={() => client.callTool("my-tool", { arg: "value" })}>
      Call Tool
    </button>
  );
}
```

### Custom Auth Popup

```tsx
import { useAwpAuth } from "@agent-web-portal/client-react";
import { Dialog } from "@mui/material";

function MyApp() {
  const { startAuth, authState, cancelAuth } = useAwpAuth({
    endpoint: "https://my-awp-server.com",
    clientName: "My Web App",
  });

  return (
    <>
      <button onClick={startAuth}>Login</button>

      {authState.status === "pending" && (
        <Dialog open onClose={cancelAuth}>
          <h2>Authorize Access</h2>
          <p>Code: {authState.verificationCode}</p>
          <a href={authState.authUrl} target="_blank">
            Open Authorization Page
          </a>
          <button onClick={cancelAuth}>Cancel</button>
        </Dialog>
      )}
    </>
  );
}
```

## Hooks API

### useAwpAuth

```typescript
interface UseAwpAuthOptions {
  endpoint: string;
  clientName: string;
  storage?: KeyStorage; // Default: IndexedDBKeyStorage
  pollInterval?: number; // Default: 10000 (10 seconds)
  autoAuth?: boolean; // Start auth immediately if not authenticated
}

interface UseAwpAuthResult {
  isAuthenticated: boolean;
  authState: AuthState;
  startAuth: () => Promise<void>;
  cancelAuth: () => void;
  logout: () => Promise<void>;
}
```

### useAwpClient

```typescript
interface UseAwpClientOptions {
  endpoint: string;
  auth?: AwpAuth;
  storage?: StorageProvider;
}

interface UseAwpClientResult {
  client: AwpClient;
  callTool: (name: string, args: unknown) => Promise<unknown>;
}
```

## License

MIT
