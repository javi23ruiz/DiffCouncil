# Architecture Decision Log

This log records significant architectural decisions for Sentinel, along with the context and alternatives considered.
Entries are numbered sequentially and are not rewritten after the fact; superseding decisions get a new entry that references the old one.

## ADR-001: GitHub Action over GitHub App

Status: Accepted

### Context

Sentinel needs to run automatically when a pull request is opened or updated, read the diff, and post a review comment.
There are two common ways to integrate this kind of bot with GitHub: a GitHub Action (runs inside the repo's own CI, triggered by workflow events) or a GitHub App (a separately hosted service that receives webhooks and calls back to the GitHub API).

### Decision

Build Sentinel as a GitHub Action rather than a GitHub App.

### Rationale

- Auth is simpler: the Action uses the automatically provided `GITHUB_TOKEN` (or a user-supplied PAT) with no separate app registration, private key management, or installation flow.
- No hosting required: the Action runs on GitHub-hosted (or self-hosted) runners as part of the repo's own CI. A GitHub App requires a always-on server to receive webhooks.
- Distribution matches the open-source goal: a user adopts Sentinel by adding a workflow file, not by installing and granting permissions to a third-party hosted app.

### Consequences

- Sentinel only runs when CI runs, so latency depends on runner availability, not on Sentinel's own uptime.
- Cross-repo features (e.g. a dashboard aggregating reviews across many repos) are harder without a hosted component. This is acceptable for Phase 1 scope and can be revisited later.

## ADR-002: Raw Anthropic SDK over agent frameworks

Status: Accepted

### Context

Several frameworks exist for building LLM-backed applications (e.g. LangChain, LlamaIndex, various agent orchestration libraries).
Sentinel's core loop is straightforward: build a prompt, call Claude, parse the response, act on it.

### Decision

Use the raw `@anthropic-ai/sdk` directly instead of an agent framework.

### Rationale

- Learning primitives: building directly on the SDK keeps the underlying request/response shape, prompt construction, and token accounting visible and understood, rather than hidden behind framework abstractions.
- Minimal dependencies: fewer transitive dependencies means a smaller attack surface, faster installs, and less exposure to breaking changes in a framework's API.
- Sentinel's needs (one prompt, one call, one response) do not require the orchestration, memory, or multi-step agent tooling these frameworks are built for.

### Consequences

- Any future functionality that frameworks provide out of the box (retries, streaming helpers, multi-step agent loops) must be implemented directly if and when Sentinel needs it.
- This keeps the codebase legible to contributors already familiar with the Anthropic API docs, without a framework-specific learning curve.
