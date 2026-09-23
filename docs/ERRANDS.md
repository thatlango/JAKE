# JakeOS Errands Runtime

JakeOS Errands turns canonical Work into governed delegated execution.

## Operating flow

```text
Ask Jake / Work / MCP
        ↓
canonical work_items record
        ↓
agent run + agent_work_dispatch
        ↓
executor selection
  ├─ local Jake AI
  ├─ OpenAI remote executor
  └─ external Agent OS connector
        ↓
scoped tools + budget + context packet
        ↓
tool audit / artifacts / approval gates
        ↓
review
        ↓
explicit acceptance → Work done
```

JakeOS remains the system of record. Executors do not receive a browser session or unrestricted credentials.

## OpenAI remote executor

The OpenAI runner uses the Responses API. When enabled it can use:

- governed web search;
- JakeOS Work, opportunity and relationship context;
- internal JakeOS writes;
- Google Calendar reads;
- optional Gmail and Drive tools after Google consent;
- optional GitHub tools after a dedicated server credential is configured;
- an optional, separate Ops executor for production mutations.

External writes are paused before execution. The pending function call and Responses API response id are persisted, a JakeOS decision is created, and the same model response is resumed only after a human decision.

### Server configuration

Required to activate remote execution:

```env
OPENAI_API_KEY=...
```

Optional defaults:

```env
OPENAI_ERRAND_ENABLED=true
OPENAI_ERRAND_MODEL=gpt-5.6-terra
OPENAI_ERRAND_INTERVAL_MS=10000
OPENAI_ERRAND_DEFAULT_MAX_COST_USD=2
OPENAI_ERRAND_DEFAULT_MAX_TOOL_CALLS=24
```

The server reports Setup required when the API credential is absent. Queued OpenAI errands are not silently redirected to another executor when they explicitly requested OpenAI.

## Google Workspace

Calendar support remains available independently.

To allow governed Gmail and Drive tools, use:

```env
JAKEOS_GOOGLE_WORKSPACE_EXTENDED=true
```

Then reconnect Google from JakeOS Integrations and approve the additional requested scopes.

Read operations may execute within the errand scope. Gmail send and Calendar writes are approval-gated.

## GitHub

GitHub errand tools use a dedicated service credential:

```env
JAKEOS_GITHUB_TOKEN=...
```

Reads may execute when granted. Branch creation, file writes and PR creation are approval-gated. PR merge is classified as executive-only.

Do not place the token in Work descriptions, prompts, artifacts, browser storage or repository files.

## Production operations

JakeOS does not receive Docker socket or host-level mutation authority.

Production actions require a separately deployed executor:

```env
JAKEOS_OPS_EXECUTOR_URL=...
JAKEOS_OPS_EXECUTOR_TOKEN=...
```

The corresponding tool is executive-only and cannot be auto-approved.

## Approval policy

Tool actions are classified as:

| Class | Typical behavior |
| --- | --- |
| read | execute when the scope is granted |
| internal_write | may update canonical JakeOS records |
| external_write | pause and ask for approval |
| executive | pause and require explicit executive approval |

Model output cannot expand scopes.

## Evidence and audit

Each errand records:

- executor and model;
- persisted context snapshot;
- granted tool scopes;
- tool-call audit and action fingerprints;
- tool-call count;
- estimated token spend;
- approval decisions;
- versioned artifacts with SHA-256;
- result history;
- notification events.

External-action idempotency is enforced by the dispatch plus action fingerprint.

## ChatGPT / MCP bridge

JakeOS exposes a separate MCP endpoint at:

```text
/mcp/jakeos
```

It is disabled unless:

```env
JAKEOS_MCP_TOKEN=...
```

The MCP credential is separate from Tuku web sessions and the Agent OS connector credential.

The initial tool surface lets an approved MCP client:

- read the executive snapshot;
- list/create canonical Work;
- list opportunities;
- inspect errand status;
- create a governed errand;
- inspect an errand's audit/artifact/decision metadata.

External-action tools are intentionally not exposed directly through this MCP surface. They must run through the errand approval model.

## Failure behavior

If an optional connector is unavailable, the tool is omitted from the remote executor instead of failing the whole runtime.

If OpenAI is unavailable or unconfigured, explicitly requested OpenAI errands remain visible and queued/setup-required.

If a worker dies, leases expire and work becomes claimable again.

A model cannot mark Work done. Agent results enter review and the canonical Work item closes only after explicit acceptance.
