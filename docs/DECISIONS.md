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

## ADR-003: Placeholder prompt for plumbing validation

Status: Accepted

### Context

Phase 1's goal was an end-to-end path from "PR opened" to "comment posted," with no review intelligence yet.
Building the real review prompt at the same time as the plumbing (diff fetching, truncation, Claude call, comment posting/updating) makes it hard to tell whether a failure is in the plumbing or in the prompt.

### Decision

Ship Phase 1 with a placeholder/stub prompt in `prompts/reviewer.md`, and write the real review prompt by hand afterward, once plumbing is verified.

### Rationale

- Isolates failure modes: a broken comment update or a truncation bug looks the same whether the prompt is a stub or a finished one, so verifying plumbing first with a trivial prompt removes a variable.
- The real review prompt is a product artifact in its own right, worth iterating on deliberately rather than writing it under the pressure of also debugging Action wiring.

### Consequences

- Phase 1 dogfood runs do not reflect real review quality; they only validate that the pipeline runs and posts/updates comments correctly.
- The real prompt must be written and iterated on before Sentinel's review output is representative of its intended behavior.

## ADR-004: Markdown output instead of structured JSON in Phase 1

Status: Accepted

### Context

Claude's review response could be requested as structured JSON (with a schema for findings, severity, file/line references) or as free-form GitHub-flavored markdown.
Structured output enables programmatic deduplication, ranking, and merging of findings, which matters once multiple specialist reviewers run in parallel (Phase 2).

### Decision

Use markdown output in Phase 1, and defer structured JSON output with schema validation to Phase 2.

### Rationale

- Phase 1 has exactly one reviewer and one call, so there is nothing to deduplicate or merge yet; a schema would add complexity with no consumer.
- Feeling the actual pain of unstructured output (an inability to compare, dedupe, or rank findings) is what should motivate and shape the Phase 2 schema design, rather than guessing at a schema up front.

### Consequences

- Phase 1 findings are not machine-readable: they cannot be filtered, deduplicated, or scored without re-parsing markdown.
- Phase 2 needs a breaking change to the reviewer's output format and a corresponding schema in `src/reviewer.ts`.
