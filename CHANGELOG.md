# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
