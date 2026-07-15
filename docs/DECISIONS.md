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

## ADR-005: Tool-forced structured output over "please respond in JSON"

Status: Accepted

### Context

Phase 2 makes findings machine-readable so they can be deduplicated, ranked, and filtered (the direction anticipated in ADR-004).
There are two ways to get structured output from Claude: instruct the model in the prompt to "respond in JSON matching this shape," or force a tool call whose input schema defines the shape and let the API constrain generation to it.
Prompt-only JSON is best-effort: the model can add prose around the JSON, omit fields, or drift from the shape, and every consumer must defensively parse.

### Decision

Use tool-forced structured output: each reviewer is forced to call a `submit_review` tool whose input schema is generated from the Zod schema, and the tool input is validated with Zod before use.

### Rationale

- Schema-enforced reliability is a prerequisite for downstream synthesis: the synthesizer consumes findings from three specialists, so a single malformed response cannot be tolerated or hand-patched.
- Forcing the tool call constrains generation to the schema at the API level, rather than relying on the model to remember formatting instructions buried in a prompt.
- Validating the tool input with Zod gives a single, explicit boundary where a bad response fails loudly instead of silently corrupting a finding.

### Consequences

- Reviewers cannot return free-form commentary alongside findings; everything they want to convey must fit the schema.
- The schema and the tool definition must be kept aligned; this is handled by generating the tool's JSON schema from the Zod schema rather than hand-writing it twice.

## ADR-006: Three specialists, not more

Status: Accepted

### Context

The parallel-specialist design generalizes to any number of categories: performance, style, documentation, accessibility, dependency hygiene, and more could each get a dedicated reviewer.
More specialists means more coverage but also more cost, more latency, and more overlapping findings for the synthesizer to reconcile.

### Decision

Ship exactly three specialists in Phase 2 - security, correctness, and maintainability - and defer any category expansion.

### Rationale

- Adding specialists without eval data is speculation: without measured precision and recall per category, there is no evidence that a fourth or fifth specialist improves review quality rather than just adding noise and cost.
- Three broad categories cover the highest-value findings while keeping the synthesizer's job tractable.
- Category expansion is deferred to post-Phase-4, when the eval harness makes per-category precision and recall measurable and expansion can be justified with data.

### Consequences

- Some real findings that fall outside the three categories (for example, pure performance regressions) are not surfaced yet.
- The specialist set is intentionally revisited only after calibration exists, not on intuition.

## ADR-007: Synthesizer as LLM judge, not merge function

Status: Accepted

### Context

Three specialists reviewing the same diff produce overlapping findings that must be deduplicated, ranked, and filtered into one comment.
This could be a deterministic merge function (group by file and line, compare strings) or an LLM pass that reasons over the combined findings.

### Decision

Implement the synthesizer as an LLM judge that reasons over the specialists' findings, rather than a deterministic string- or line-based merge function.

### Rationale

- Semantic deduplication requires reasoning, not string matching: "SQL injection" and "unvalidated query input" reported on the same line are the same issue, but no string comparison recognizes that.
- Ranking findings by real severity and merging near-duplicates worded differently is a judgment task that a merge function cannot do without effectively reimplementing an LLM's understanding.

### Consequences

- Synthesis adds an extra model call, with its own cost, latency, and non-determinism.
- Counts that must be reliable (how many findings were merged, dropped, or added) are derived deterministically in code from the inputs and outputs rather than trusted to the model's self-report.

## ADR-008: Diff-only context preserved through Phase 2

Status: Accepted

### Context

Cross-file context is the single biggest lever on review quality: most of what Sentinel currently misses is a consequence of seeing only the diff, with no view of call sites, callers, or type definitions outside the changed lines.
Phase 2 already introduces two large changes at once: structured tool-forced outputs and a parallel-specialist-plus-synthesizer pipeline.

### Decision

Keep Sentinel diff-only through Phase 2, and defer cross-file context to later phases.

### Rationale

- Adding cross-file context at the same time as structured outputs and parallel specialists would mean three simultaneous unknowns, making it impossible to attribute a change in review quality to any one of them.
- Sequencing the changes keeps each phase's effect measurable: Phase 2 isolates the value of structure and specialization before context is added.
- Cross-file context is deferred to Phase 3 (a deterministic one-hop import walk) and Phase 5 (agent-driven retrieval), where it can be introduced and evaluated on its own.

### Consequences

- Phase 2 review quality is still bounded by what appears in the diff; findings that depend on cross-file effects remain out of reach until Phase 3.
- The specialists and synthesizer are designed to consume structured findings, so adding a context-gathering step ahead of them later does not require reworking their contracts.

## ADR-009: Git-committed JSON traces and a static GitHub Pages dashboard

Status: Accepted

### Context

The parallel pipeline (ADR-006, ADR-007) makes each run a multi-step process: three specialists, a synthesizer, merge/drop bookkeeping, token and cost accounting.
Understanding a run after the fact, and spotting trends across runs, needs an observability surface richer than the review comment itself.
ADR-001 chose a GitHub Action over a hosted app specifically to avoid running an always-on service, which rules out a hosted database or backend for telemetry.

### Decision

Emit a versioned JSON trace (`traces/{runId}.json`, format version 2, defined in `src/trace.ts`) for every run, commit those traces into the repository, and render them with a static React/Vite dashboard deployed to GitHub Pages.
The dashboard reads the trace files at build time (a Vite glob over `traces/*.json`) and validates each against a Zod schema (`dashboard/src/data/schema.ts`) that mirrors the producer types in `src/trace.ts`.

### Rationale

- No hosted component: committing traces to git and building a static site keeps Sentinel a pure Action plus a static site, consistent with ADR-001. There is no server to run, no database to operate.
- Traces are the eval substrate: a durable, versioned record of what each run actually did is exactly what the Phase 3 eval harness needs, so producing it now is not throwaway instrumentation.
- Deterministic bookkeeping in the trace: merge, drop, and cost figures are computed in code (see ADR-007) and recorded in the trace, so the dashboard reports facts rather than the model's self-report.
- One schema, checked: generating the dashboard's view from a Zod schema that mirrors `src/trace.ts`, plus a schema checksum embedded in each trace, is intended to make producer/consumer drift visible rather than silent.

### Consequences

- Telemetry lives in git history: traces accumulate in the repository over time, coupling observability data to the source tree. This is acceptable at current volume but is a known scaling limit.
- The pipeline reviews a repository that contains its own traces, so `src/context.ts` skips `traces/` during review to avoid Sentinel reviewing its own telemetry and burning tokens on it.
- Two schema definitions must be kept in sync by hand (`src/trace.ts` and `dashboard/src/data/schema.ts`); the checksum and validation surface drift but do not prevent it. A test that fails on drift would be a stronger guard and is a candidate for a future change.
- The trace-commit step in the dogfooding workflow pushes to the PR branch, so it only works for same-repo PRs and must fail loudly (not silently) when it cannot, or a broken pipeline can leave the dashboard empty without any signal.
