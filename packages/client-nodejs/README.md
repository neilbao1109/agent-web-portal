# @agent-web-portal/client-nodejs

Node.js-specific storage implementation for the Agent Web Portal client SDK.

## Installation

```bash
npm install @agent-web-portal/client @agent-web-portal/client-nodejs
```

## Features

- **FileKeyStorage** - Persistent key storage using the file system

## Usage

```typescript
import { AwpAuth, AwpClient } from "@agent-web-portal/client";
import { FileKeyStorage } from "@agent-web-portal/client-nodejs";

const auth = new AwpAuth({
  clientName: "My AI Agent",
  keyStorage: new FileKeyStorage({ directory: "~/.awp/keys" }),
  callbacks: {
    onAuthRequired: async (challenge) => {
      console.log("Please visit:", challenge.authUrl);
      console.log("Verification code:", challenge.verificationCode);
      return true;
    },
  },
});

const client = new AwpClient({
  endpoint: "https://my-awp-server.com",
  auth,
});

// Make authenticated requests
const result = await client.callTool("my-tool", { arg: "value" });
```

## File Storage Location

Keys are stored as JSON files in the specified directory. The filename is derived from the endpoint URL:

```
~/.awp/keys/
├── https___example_com.json
└── https___another_server_com.json
```

## Requirements

- Node.js >= 18 (or Bun/Deno with Node.js compatibility)

## License

MIT
