# Roadmap

## Phase 1: Walking skeleton - ✅ Complete (2026-07-11)

Phase 1 delivered an end-to-end path from "PR opened" to "comment posted," with no cross-file review intelligence yet.

### What was built

- GitHub Action scaffold, triggered on pull request events.
- Single-call reviewer: one prompt, one call to Claude, one parsed response.
- Idempotent PR commenting: reruns on the same PR update the existing bot comment instead of posting duplicates.
- Token and cost telemetry: usage and estimated cost appended as a footer on the review comment.
- Dogfood loop: Sentinel reviews its own pull requests via `.github/workflows/sentinel-self.yml`.
- Structured JSON logs for observability during Action runs.

### Known limitations of Phase 1

These are not apologies. They are the motivations for the phases that follow.

- **Diff-only context.** Sentinel sees the unified diff and nothing else: no access to the rest of the repo, so it cannot reason about cross-file effects or call sites outside the diff.
- **Single LLM call.** The review is one prompt/response round trip, not an agentic loop with tool use or multi-step reasoning.
- **No eval harness yet.** `evals/planted-bugs/` is an informal log of planted bugs and catch/miss/false-positive notes per dogfood PR, not an automated eval suite.
- **No routing.** Every diff goes through the same prompt regardless of size, language, or risk profile.
- **Unstructured markdown output.** Findings are free-form markdown, so they cannot be programmatically deduplicated, ranked, or merged across multiple reviewers.

## Phase 2: Structured output and specialist reviewers - 🚧 Next

- Structured JSON outputs with schema validation (replacing free-form markdown findings).
- Parallel specialist reviewers (e.g. correctness, security, performance) running independently over the same diff.
- A synthesizer step that deduplicates and ranks findings from the specialist reviewers into a single comment.
