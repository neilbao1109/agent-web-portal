---
name: Multilingual Greeting
description: Generate personalized greetings in multiple languages
version: 1.0.0
allowed-tools:
  - greet
---

# Multilingual Greeting Skill

This skill uses the `greet` tool to generate personalized greeting messages in various languages.

## Overview

The greeting service supports the following languages:
- English (en)
- Spanish (es)
- French (fr)
- German (de)
- Japanese (ja)

## Usage Examples

### Example 1: Basic English Greeting

```json
{
  "name": "greet",
  "arguments": {
    "name": "Alice"
  }
}
```

**Result:**
```json
{
  "message": "Hello, Alice!",
  "timestamp": "2026-01-27T12:00:00.000Z"
}
```

### Example 2: Spanish Greeting

```json
{
  "name": "greet",
  "arguments": {
    "name": "Carlos",
    "language": "es"
  }
}
```

**Result:**
```json
{
  "message": "¡Hola, Carlos!",
  "timestamp": "2026-01-27T12:00:00.000Z"
}
```

### Example 3: Japanese Greeting

```json
{
  "name": "greet",
  "arguments": {
    "name": "田中",
    "language": "ja"
  }
}
```

**Result:**
```json
{
  "message": "こんにちは、田中さん！",
  "timestamp": "2026-01-27T12:00:00.000Z"
}
```

## Tool Reference

### greet

Generate a greeting message in the specified language.

**Input:**
- `name` (string, required): The name of the person to greet
- `language` (string, optional): The language code (en, es, fr, de, ja). Defaults to "en"

**Output:**
- `message` (string): The greeting message
- `timestamp` (string): ISO timestamp of when the greeting was generated
