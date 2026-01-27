---
name: Authenticated Greeting
description: Secure greeting service that requires AWP authentication
version: 1.0.0
allowed-tools:
  - secure_greet
---

# Authenticated Greeting Skill

This skill provides a secure greeting service that requires AWP (Agent Web Portal) authentication. Only authenticated agents can use this skill.

## Overview

The secure greeting service is similar to the basic greeting service but requires authentication. This demonstrates AWP's authentication mechanism for protecting sensitive tools.

### Authentication Flow

1. Agent initiates AWP auth flow via `/api/auth/init`
2. User authorizes the agent in the web UI
3. Agent receives authentication token
4. Agent can now call authenticated tools

### Supported Languages

- English (en)
- Spanish (es)
- French (fr)
- German (de)
- Japanese (ja)

## Usage Examples

### Example 1: Authenticated English Greeting

```json
{
  "name": "secure_greet",
  "arguments": {
    "name": "Alice"
  }
}
```

**Result:**
```json
{
  "message": "Hello, Alice! (authenticated)",
  "timestamp": "2026-01-27T12:00:00.000Z"
}
```

### Example 2: Authenticated Spanish Greeting

```json
{
  "name": "secure_greet",
  "arguments": {
    "name": "Carlos",
    "language": "es"
  }
}
```

**Result:**
```json
{
  "message": "¡Hola, Carlos! (autenticado)",
  "timestamp": "2026-01-27T12:00:00.000Z"
}
```

### Example 3: Unauthenticated Request

If an agent tries to call `secure_greet` without authentication, the request will be rejected with an authentication error.

**Error Response:**
```json
{
  "error": {
    "code": -32001,
    "message": "Authentication required"
  }
}
```

## Tool Reference

### secure_greet

Generate a secure greeting message that confirms authentication.

**Input:**
- `name` (string, required): The name of the person to greet
- `language` (string, optional): The language code (en, es, fr, de, ja). Defaults to "en"

**Output:**
- `message` (string): The greeting message with "(authenticated)" suffix
- `timestamp` (string): ISO timestamp of when the greeting was generated

## Security Notes

- This tool is protected by AWP authentication
- The agent must complete the AWP auth flow before calling this tool
- Authentication tokens have a configurable expiration time
- Users can revoke agent access at any time through the web UI
