# Agent Web Portal: An Extensible Agent Architecture

> A scenario-oriented, MCP-compatible framework for extending AI agents' capabilities through web services.

---

## 1. Extending Agents' Capabilities with Skills and MCP

### What is MCP?

**Model Context Protocol (MCP)** is an open standard that enables AI agents to interact with external systems through well-defined **Tools**. Each tool is an atomic function with typed inputs and outputs.

```
┌─────────────────────────────────────────────────────────────┐
│                        AI Agent                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  User: "Search for flights to Tokyo"                │    │
│  │                    ↓                                 │    │
│  │  Agent decides to call: search_flights(dest="Tokyo")│    │
│  └─────────────────────────────────────────────────────┘    │
│                          │                                   │
│                          ▼                                   │
│              ┌──────────────────────┐                       │
│              │    MCP Protocol      │                       │
│              │  • tools/list        │                       │
│              │  • tools/call        │                       │
│              └──────────────────────┘                       │
│                          │                                   │
└──────────────────────────┼───────────────────────────────────┘
                           ▼
              ┌──────────────────────┐
              │    MCP Server        │
              │  (Flight API)        │
              └──────────────────────┘
```

### What are Skills?

**Skills** (like Anthropic's Claude Code Skills) are contextual documents that guide AI agents on *how* to accomplish specific tasks. They are typically Markdown files containing:

- **Scenario descriptions**: What task can be accomplished
- **Step-by-step instructions**: How to use tools effectively
- **Examples**: Sample inputs/outputs for reference
- **Allowed tools**: Which tools can be used for this skill

```markdown
# Flight Booking Skill

## Scenario
Help users find and book flights to their destination.

## Steps
1. Use `search_flights` to find available options
2. Present top 3 choices with prices
3. Use `book_flight` to complete reservation

## Allowed Tools
- search_flights
- book_flight
- get_flight_details
```

---

## 2. Limitations of Ordinary Skills

### Skills Are Bound to Specific Agents

Traditional skills assume a fixed toolset available to the agent:

```
┌─────────────────────────────────────────────────────────────┐
│                     Agent A                                  │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐      │
│  │ Skill: Code │    │ Skill: Data │    │ Skill: Web  │      │
│  │  Review     │    │  Analysis   │    │  Search     │      │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘      │
│         │                  │                  │              │
│         ▼                  ▼                  ▼              │
│  ┌─────────────────────────────────────────────────┐        │
│  │        Agent A's Built-in Tools                 │        │
│  │  • read_file  • run_code  • search_web         │        │
│  └─────────────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────────┘

                    ✗ Cannot use external tools
                    ✗ Skills are hardcoded to agent's toolset
```

### Skills Are Isolated Islands

In reality, skills often need to reference each other—like academic papers citing other papers:

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Skill A   │     │   Skill B   │     │   Skill C   │
│ "Checkout"  │     │ "Inventory" │     │ "Shipping"  │
└──────┬──────┘     └─────────────┘     └─────────────┘
       │                                       
       │  "Before checkout, verify            
       │   inventory using Skill B,           
       │   then arrange shipping              
       │   using Skill C"                     
       │                                       
       ▼                                       
    ✗ No standard way to reference other skills
    ✗ No mechanism to load related skills dynamically
    ✗ Skills become duplicated across different systems
```

---

## 3. Limitations of Traditional MCP

### Focus on Individual Tools, Not Scenarios

MCP excels at defining atomic operations but lacks guidance on orchestrating them:

```
┌─────────────────────────────────────────────────────────────┐
│                    MCP Server                                │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │ Tool A   │  │ Tool B   │  │ Tool C   │  │ Tool D   │    │
│  │ search   │  │ filter   │  │ compare  │  │ purchase │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
│                                                              │
│     ✗ No guidance on: "To buy the best product, first      │
│       search, then filter by rating, compare prices,        │
│       and finally purchase"                                  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Lack of Authentication Standard

MCP tools often need to act on behalf of authenticated users:

```
Agent                        MCP Server                  User
  │                              │                         │
  │  tools/call: purchase_item   │                         │
  │  ───────────────────────────>│                         │
  │                              │                         │
  │     ✗ Whose credit card?     │                         │
  │     ✗ Is user authorized?    │                         │
  │     ✗ How to get consent?    │                         │
  │                              │                         │
  │  "error: unauthorized"       │                         │
  │  <───────────────────────────│                         │
  │                              │                         │
  │     ✗ No standard discovery  │                         │
  │     ✗ No auth flow defined   │                         │
  │                              │                         │
```

### No Standard for Binary Data (Blobs)

Including binary data in JSON payloads is problematic:

```
┌─────────────────────────────────────────────────────────────┐
│              Anti-Pattern: Inline Binary Data               │
│                                                              │
│  {                                                          │
│    "method": "tools/call",                                  │
│    "params": {                                              │
│      "name": "process_image",                               │
│      "arguments": {                                         │
│        "image": "data:image/png;base64,iVBORw0KGgo..."      │
│                  ↑                                          │
│                  │  ✗ Huge payload (megabytes)              │
│                  │  ✗ Memory inefficient                    │
│                  │  ✗ No streaming support                  │
│                  │  ✗ LLM cannot process binary             │
│      }                                                      │
│    }                                                        │
│  }                                                          │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. AWP: Goals and Use Cases

### The Goal

**Agent Web Portal (AWP)** aims to provide **complete knowledge** of a website's capabilities to AI agents, enabling them to extend their abilities **without code changes**.

```
┌─────────────────────────────────────────────────────────────┐
│                                                              │
│    AWP = Tools + Skills + Auth + Blobs                      │
│                                                              │
│    "Give agents everything they need to use your service"   │
│                                                              │
└─────────────────────────────────────────────────────────────┘

          ┌─────────────────────────────────────┐
          │           AI Agent                   │
          │                                      │
          │  "I need to create a presentation"  │
          │                                      │
          └───────────────┬─────────────────────┘
                          │
                          ▼
          ┌─────────────────────────────────────┐
          │     AWP Server (PowerPoint SaaS)    │
          │                                      │
          │  Skills:                             │
          │  • "Create Presentation from Topic" │
          │  • "Polish and Review Slides"       │
          │                                      │
          │  Tools:                              │
          │  • html_to_ppt                       │
          │  • add_slide                         │
          │  • apply_theme                       │
          │  • export_pdf                        │
          │                                      │
          │  Auth: User's account credentials    │
          │  Blobs: Upload/download PPT files    │
          └─────────────────────────────────────┘
```

### Example 1: PowerPoint Creation Service

```
┌─────────────────────────────────────────────────────────────┐
│                  PPT Creation AWP Server                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  SKILLS                          TOOLS                       │
│  ┌─────────────────────┐         ┌──────────────────────┐   │
│  │ Create Presentation │────────>│ html_to_ppt          │   │
│  │                     │         │ generate_outline     │   │
│  │ Workflow:           │         │ add_slide            │   │
│  │ 1. Generate outline │         └──────────────────────┘   │
│  │ 2. Create HTML for  │                                    │
│  │    each slide       │         ┌──────────────────────┐   │
│  │ 3. Convert to PPT   │────────>│ check_consistency    │   │
│  │ 4. Apply theme      │         │ suggest_improvements │   │
│  └─────────────────────┘         │ apply_theme          │   │
│                                   └──────────────────────┘   │
│  ┌─────────────────────┐                                    │
│  │ Polish & Review     │         BLOBS                       │
│  │                     │         ┌──────────────────────┐   │
│  │ Workflow:           │         │ Input:  source files │   │
│  │ 1. Check style      │────────>│ Output: .pptx, .pdf  │   │
│  │ 2. Fix issues       │         └──────────────────────┘   │
│  │ 3. Export final     │                                    │
│  └─────────────────────┘                                    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Example 2: E-Commerce Platform

```
┌─────────────────────────────────────────────────────────────┐
│                  E-Commerce AWP Server                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  SKILLS                                                      │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Smart Shopping Assistant                             │    │
│  │                                                      │    │
│  │ "Find the best deal for the user's requirements"    │    │
│  │                                                      │    │
│  │ Steps:                                               │    │
│  │ 1. Understand user needs                             │    │
│  │ 2. Search products (use search_products)            │    │
│  │ 3. Compare prices and reviews                        │    │
│  │ 4. Present top recommendations                       │    │
│  │ 5. ⚠️ Get user approval before checkout             │    │
│  │ 6. Complete purchase (use checkout)                  │    │
│  │                                                      │    │
│  │ Allowed Tools: search_products, get_reviews,        │    │
│  │                manage_cart, checkout                 │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  AUTH                            TOOLS                       │
│  ┌──────────────────────┐        ┌──────────────────────┐   │
│  │ User: alice@mail.com │        │ search_products      │   │
│  │ Delegated to: Agent  │        │ get_reviews          │   │
│  │ Permissions:         │        │ manage_cart          │   │
│  │ • View products ✓    │        │ checkout             │   │
│  │ • Add to cart ✓      │        │ track_order          │   │
│  │ • Checkout ✓         │        └──────────────────────┘   │
│  └──────────────────────┘                                   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. AWP as an Extension of MCP

AWP is fully **compatible with standard MCP** while providing essential extensions:

```
┌─────────────────────────────────────────────────────────────┐
│                     AWP Protocol Stack                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                AWP Extensions                        │    │
│  │  • skills/list          (Skill discovery)           │    │
│  │  • Cross-MCP references (mcp_alias:tool_name)       │    │
│  │  • Auth discovery       (401 + /auth/init)          │    │
│  │  • Blob auto-binding    (_blobContext)              │    │
│  └─────────────────────────────────────────────────────┘    │
│                           │                                  │
│                           ▼                                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                MCP Protocol (Standard)               │    │
│  │  • initialize                                        │    │
│  │  • tools/list                                        │    │
│  │  • tools/call                                        │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
└─────────────────────────────────────────────────────────────┘

        Any MCP Client ──────> AWP Server  ✓ Compatible
        AWP Client     ──────> AWP Server  ✓ Full features
        AWP Client     ──────> MCP Server  ✓ Fallback mode
```

### Extension Summary

| Feature | MCP | AWP | Purpose |
|---------|-----|-----|---------|
| Tools | ✓ | ✓ | Atomic operations |
| **Skills** | ✗ | ✓ | Scenario guidance |
| **Cross-MCP References** | ✗ | ✓ | Compose tools across servers |
| **Auth Discovery** | ✗ | ✓ | User delegation to agents |
| **Blob Handling** | ✗ | ✓ | Binary data exchange |

---

## 6. Extended Skills

AWP Skills extend traditional skills with **dynamic tool binding** and **cross-MCP references**.

### Skill Anatomy

```yaml
---
name: Shopping Assistant
description: Help users find and purchase products
version: 2.0.0
allowed-tools:
  - search_products           # Local tool
  - manage_cart               # Local tool
  - checkout                  # Local tool
  - reviews_api:get_reviews   # Cross-MCP reference
mcp-servers:
  reviews_api: https://reviews.example.com/mcp
---
```

### Cross-MCP Tool References

```
┌─────────────────────────────────────────────────────────────┐
│                    E-Commerce AWP                            │
│                                                              │
│  Skill: "Shopping Assistant"                                 │
│  allowed-tools:                                              │
│    - search_products        ─────────┐                      │
│    - manage_cart            ─────────┼─── Local Tools       │
│    - checkout               ─────────┘                      │
│    - reviews_api:get_reviews ───────────┐                   │
│                                          │                   │
│  mcp-servers:                            │                   │
│    reviews_api: https://reviews.../mcp ──┘                  │
│                                                              │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               │  Cross-MCP Call
                               ▼
              ┌─────────────────────────────────┐
              │       Reviews MCP Server        │
              │  https://reviews.example.com    │
              │                                 │
              │  Tools:                         │
              │  • get_reviews                  │
              │  • submit_review                │
              └─────────────────────────────────┘
```

### Dynamic Skill Loading

```
Agent                           AWP Server
  │                                 │
  │  1. GET /skills/list            │
  │  ──────────────────────────────>│
  │                                 │
  │  2. List of available skills    │
  │  <──────────────────────────────│
  │     • shopping-assistant        │
  │     • order-tracking            │
  │     • returns-processing        │
  │                                 │
  │  3. GET /skills/shopping-assist │
  │  ──────────────────────────────>│
  │                                 │
  │  4. Full skill content (MD)     │
  │  <──────────────────────────────│
  │     + allowed-tools             │
  │     + mcp-servers mapping       │
  │                                 │
  │  5. Agent now knows exactly     │
  │     how to help with shopping   │
  │                                 │
```

### Skill References in Content

Skills can reference tools inline using `{{tool_name}}` syntax:

```markdown
## How to Complete a Purchase

1. First, search for products using {{search_products}}
2. Check reviews with {{reviews_api:get_reviews}}  
3. Add items to cart via {{manage_cart}}
4. Complete purchase with {{checkout}}
```

---

## 7. Auth Discovery Mechanism

AWP uses **ECDSA P-256 keypair authentication** with **server-generated verification codes** to prevent phishing.

### The Problem

```
┌─────────────────────────────────────────────────────────────┐
│                     Phishing Attack                          │
│                                                              │
│  Attacker: "Click here to authorize the agent!"             │
│            ↓                                                 │
│  User clicks malicious link                                 │
│            ↓                                                 │
│  User unknowingly authorizes ATTACKER's key                 │
│            ↓                                                 │
│  Attacker now has access to user's account                  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### AWP's Solution: Verification Codes

```
┌───────────────────────────────────────────────────────────────────────┐
│                     AWP Auth Flow                                      │
├───────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  Client (Agent)              AWP Server              User's Browser    │
│       │                          │                         │           │
│       │  1. POST /auth/init      │                         │           │
│       │  {pubkey, client_name}   │                         │           │
│       │  ───────────────────────>│                         │           │
│       │                          │                         │           │
│       │  2. {auth_url,           │                         │           │
│       │      verification_code,  │                         │           │
│       │      expires_in}         │                         │           │
│       │  <───────────────────────│                         │           │
│       │                          │                         │           │
│       │  3. Display to user:     │                         │           │
│       │  ┌────────────────────┐  │                         │           │
│       │  │ Verification Code: │  │                         │           │
│       │  │     ABC-123        │  │                         │           │
│       │  │                    │  │                         │           │
│       │  │ Please visit the   │  │                         │           │
│       │  │ auth page and      │  │                         │           │
│       │  │ enter this code    │  │                         │           │
│       │  └────────────────────┘  │                         │           │
│       │                          │                         │           │
│       │                          │  4. User visits auth_url│           │
│       │                          │  <──────────────────────│           │
│       │                          │                         │           │
│       │                          │  5. User logs in AND    │           │
│       │                          │     enters "ABC-123"    │           │
│       │                          │  <──────────────────────│           │
│       │                          │                         │           │
│       │                          │  6. Code matches!       │           │
│       │                          │     Link pubkey→userId  │           │
│       │                          │                         │           │
│       │  7. Poll /auth/status    │                         │           │
│       │  ───────────────────────>│                         │           │
│       │  {authorized: true}      │                         │           │
│       │  <───────────────────────│                         │           │
│       │                          │                         │           │
│                                                                        │
└───────────────────────────────────────────────────────────────────────┘
```

### Why This Prevents Phishing

```
┌─────────────────────────────────────────────────────────────┐
│  Attacker sends phishing link                                │
│            ↓                                                 │
│  User opens attacker's auth page                            │
│            ↓                                                 │
│  ✗ User doesn't know the verification code!                 │
│    (Code only shown in legitimate client)                   │
│            ↓                                                 │
│  ✓ Attack fails - user cannot complete auth                 │
└─────────────────────────────────────────────────────────────┘
```

### Request Signing

After authorization, all requests are signed:

```
┌─────────────────────────────────────────────────────────────┐
│                    Signed Request                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  HTTP Headers:                                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ X-AWP-Pubkey:    <x>.<y>  (base64url)               │    │
│  │ X-AWP-Timestamp: 1706270400                         │    │
│  │ X-AWP-Signature: <signature> (base64url)            │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  Signature Payload:                                          │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ "${timestamp}.${METHOD}.${path}.${sha256(body)}"    │    │
│  │                                                      │    │
│  │ Example:                                             │    │
│  │ "1706270400.POST./tools/call.a1b2c3d4..."           │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  Algorithm: ECDSA-P256-SHA256                               │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 401 Challenge Response

```json
{
  "error": "unauthorized",
  "error_description": "Authentication required",
  "auth_init_endpoint": "/auth/init"
}
```

---

## 8. Blob Auto-Binding Mechanism

AWP solves binary data handling through **presigned URLs** and **automatic context binding**.

### The Pattern

```
┌─────────────────────────────────────────────────────────────┐
│                   Blob Exchange Flow                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Client                  AWP Server                 Storage  │
│    │                         │                         │     │
│    │  1. Generate presigned URLs                       │     │
│    │  ┌────────────────────────────────────────────────┤     │
│    │  │ Input:  GET  url for reading source           │     │
│    │  │ Output: PUT  url for writing result           │     │
│    │  │ Output: URI  for referencing result           │     │
│    │  └────────────────────────────────────────────────┤     │
│    │                         │                         │     │
│    │  2. tools/call + _blobContext                     │     │
│    │  ─────────────────────>│                         │     │
│    │                         │                         │     │
│    │                         │  3. GET input blob     │     │
│    │                         │  ─────────────────────>│     │
│    │                         │  <─────────────────────│     │
│    │                         │                         │     │
│    │                         │  [Process data...]     │     │
│    │                         │                         │     │
│    │                         │  4. PUT output blob    │     │
│    │                         │  ─────────────────────>│     │
│    │                         │                         │     │
│    │  5. Result with output URIs                       │     │
│    │  <─────────────────────│                         │     │
│    │                         │                         │     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### BlobContext Structure

```json
{
  "method": "tools/call",
  "params": {
    "name": "process_document",
    "arguments": {
      "document": "s3://bucket/input/doc.pdf",
      "options": { "quality": 80 }
    },
    "_blobContext": {
      "input": {
        "document": "https://s3.../doc.pdf?X-Amz-Signature=..."
      },
      "output": {
        "thumbnail": "https://s3.../thumb.png?X-Amz-Signature=..."
      },
      "outputUri": {
        "thumbnail": "s3://bucket/output/thumb.png"
      }
    }
  }
}
```

### Tool Definition with Blobs

```
┌─────────────────────────────────────────────────────────────┐
│                  Tool: process_document                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  INPUT                           OUTPUT                      │
│  ┌────────────────────┐          ┌────────────────────┐     │
│  │ document: blob     │          │ thumbnail: blob    │     │
│  │   mimeType: pdf    │          │   mimeType: png    │     │
│  │   maxSize: 10MB    │          │                    │     │
│  ├────────────────────┤          ├────────────────────┤     │
│  │ options: object    │          │ metadata: object   │     │
│  │   quality: number  │          │   pageCount: num   │     │
│  └────────────────────┘          │   title: string    │     │
│                                   └────────────────────┘     │
│                                                              │
│  Handler receives:                                           │
│  • args.options (non-blob fields)                           │
│  • context.blobs.input.document  (presigned GET URL)        │
│  • context.blobs.output.thumbnail (presigned PUT URL)       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Blob Metadata in tools/list

AWP exposes blob metadata in a separate `_awp` field to maintain JSON Schema compatibility:

```json
{
  "name": "process_document",
  "description": "Process a PDF and generate thumbnail",
  "inputSchema": {
    "type": "object",
    "properties": {
      "document": { "type": "string", "format": "uri" },
      "options": { "type": "object" }
    }
  },
  "_awp": {
    "blobs": {
      "input": {
        "document": { "mimeType": "application/pdf", "maxSize": 10485760 }
      },
      "output": {
        "thumbnail": { "mimeType": "image/png" }
      }
    }
  }
}
```

### Benefits

```
┌─────────────────────────────────────────────────────────────┐
│                                                              │
│  ✓ Binary data never travels through LLM                    │
│  ✓ Efficient streaming with presigned URLs                  │
│  ✓ Storage-agnostic (S3, Azure Blob, GCS, etc.)            │
│  ✓ Access control via signed URLs                           │
│  ✓ Large file support (no payload size limits)             │
│  ✓ Standard MCP clients can ignore _blobContext             │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Summary

Agent Web Portal (AWP) extends MCP to create a complete framework for AI agent integration:

```
┌─────────────────────────────────────────────────────────────┐
│                                                              │
│                    AWP = MCP + Extensions                    │
│                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   SKILLS    │  │    AUTH     │  │       BLOBS         │  │
│  │             │  │             │  │                     │  │
│  │ Scenario    │  │ Keypair +   │  │ Presigned URLs +    │  │
│  │ guidance    │  │ Verification│  │ Auto-binding        │  │
│  │ for agents  │  │ codes       │  │                     │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
│                          │                                   │
│                          ▼                                   │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              MCP Protocol (Standard)                │    │
│  │         Full backward compatibility                 │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

With AWP, websites can expose their complete capabilities to AI agents in a secure, standardized, and scenario-driven manner.

---

## References

- [MCP Specification](https://modelcontextprotocol.io)
- [AWP Development Guide](./AGENT_WEB_PORTAL_DEVELOPMENT.md)
- [Anthropic Claude Skills](https://docs.anthropic.com)
