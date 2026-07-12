# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.2.0] - 2026-07-12

### Added

- Structured, tool-forced outputs: reviewers return findings through a forced `submit_review` tool call validated against a shared Zod schema.
- Zod schemas defined once in `src/schema.ts`, with the tool's JSON schema generated from them so the contract cannot drift.
- Three parallel specialist reviewers (security, correctness, maintainability) running concurrently over the same diff.
- Synthesizer agent that deduplicates, ranks, and filters the specialists' findings into a single review comment.
- Noise countermeasures: significance filters and per-category confidence floors in the specialist prompts, plus the synthesizer's drop and merge rules.
- Per-specialist telemetry: structured JSON logs for each specialist, the synthesizer, and the run as a whole (tokens, latency, merge/drop/added counts, failures).

### Changed

- Reviewer output is now derived from structured, schema-validated findings rather than free-form markdown.

### Known limitations

- Still diff-only: no cross-file context or awareness of call sites outside the diff.
- Not truly agentic: the pipeline is fixed, with no LLM-driven control flow (Phase 3).
- Heuristic filtering: the synthesizer uses hand-set confidence thresholds and merge rules rather than measured calibration (Phase 4).
- No verifier agents: nothing independently checks a finding before it is posted (Phase 5).

## [0.1.0] - 2026-07-11

### Added

- GitHub Action scaffold, triggered on pull request events.
- Single-call reviewer: one prompt, one call to Claude, one parsed response.
- Idempotent PR commenting: reruns on the same PR update the existing bot comment instead of posting duplicates.
- Token and cost telemetry: usage and estimated cost appended as a footer on the review comment.
- Dogfood loop: Sentinel reviews its own pull requests via `.github/workflows/sentinel-self.yml`.
- Structured JSON logs for observability during Action runs.

### Known limitations

- Diff-only context: Sentinel sees the unified diff and nothing else, with no cross-file awareness.
- Single LLM call: not yet an agentic loop with tool use or multi-step reasoning.
- No eval harness yet: `evals/planted-bugs/` is an informal log, not an automated suite.
- No routing: every diff goes through the same prompt regardless of size, language, or risk profile.
- Unstructured markdown output: findings cannot be programmatically deduplicated or ranked.
