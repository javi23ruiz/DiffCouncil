# Sentinel

<!-- test sentinel trigger -->

Sentinel is an open-source GitHub Action that reviews pull requests using Claude.

**Status:** Phase 2 complete - see [ROADMAP.md](./ROADMAP.md).

## Architecture

Sentinel began, in Phase 1, as a single prompt pipeline: one LLM call per pull request (build a prompt from the diff, send it to Claude, post the response), with no tool use, no multi-step reasoning, and no cross-file awareness beyond the diff.

Phase 2 introduces a structured parallel pipeline: three specialist reviewers run concurrently with tool-forced structured outputs, then a synthesizer merges and filters findings.
This is not yet agentic - no LLM makes control-flow decisions.
Phase 3 introduces the first routing decision.

The fuller agentic loop - decision-making about what to investigate, tool use, cross-file retrieval - arrives across Phases 3-5.
See [ROADMAP.md](./ROADMAP.md) for the phased plan and [docs/DECISIONS.md](./docs/DECISIONS.md) for why this shape was chosen.

### Honest limitations

- **Diff-only review.** Sentinel still sees only the unified diff, with no cross-file awareness yet.
- **Heuristic noise filters.** Significance filters and confidence floors are hand-set, not calibrated against measured precision and recall; calibration comes in Phase 4.

## How it works right now

A workflow run triggers Sentinel on pull request open or update events.
Sentinel fetches the PR's unified diff via the GitHub API.
Lockfiles, generated files, and Sentinel's own `traces/` output are skipped, and if the remaining diff exceeds the 50k token budget it is truncated with a notice appended so reviewers know the review is partial.
The diff is then reviewed by three specialists - security, correctness, and maintainability - running concurrently, each forced to return schema-validated findings through a `submit_review` tool call.
A synthesizer pass merges near-duplicate findings, ranks them, and drops low-confidence ones into a single unified review.
Sentinel posts that review as a comment on the PR, or updates its existing comment in place on subsequent runs so reruns don't produce duplicates.
Each run also writes an observability trace to `traces/{runId}.json`, which the dashboard renders.

## How it looks

![Example Sentinel review](./assets/sentinel-review-example.png)

*Sentinel reviewing one of its own PRs - findings with clickable line links, severity badges, and token/cost footer.*

See `CLAUDE.md` for project conventions and current phase scope.
See `docs/DECISIONS.md` for the architecture decision log.

## Repository layout

- `CLAUDE.md` - project overview, conventions, and current phase scope for AI agents (and humans) working on this repo.
- `docs/DECISIONS.md` - architecture decision log (ADRs).
- `docs/SETUP.md` - how to add the `ANTHROPIC_API_KEY` repository secret so the dogfooding workflow can run.
- `action.yml` - GitHub Action metadata: declares the `anthropic-api-key`, `github-token`, and `model` inputs and points to the built entry point.
- `.github/workflows/sentinel-self.yml` - dogfooding workflow that builds Sentinel from source and runs it on pull requests against this repo itself.
- `evals/planted-bugs/` - eval log: one entry per dogfood PR recording planted bugs, what Sentinel caught/missed, and false positives. This is the seed dataset for the Phase 3 eval harness.
- `package.json` - dependencies (`@anthropic-ai/sdk`, `@octokit/rest`, `zod`) and dev tooling (`typescript`, `vitest`, `tsup`).
- `tsconfig.json` - strict TypeScript compiler configuration.
- `prompts/` - the specialist prompts (`security.md`, `correctness.md`, `maintainability.md`) and `synthesizer.md`, loaded at runtime. Written by hand, not generated.
- `src/index.ts` - Action entry point. Wires the pipeline together and writes the run's observability trace.
- `src/github.ts` - fetches a PR's diff and posts/updates the review comment. Comment updates must be idempotent: reruns on the same PR update the existing bot comment rather than creating duplicates.
- `src/context.ts` - token estimation, file classification (lockfiles, generated files, and `traces/` output are skipped), and diff truncation (50k token limit, with a truncation notice when truncation occurs).
- `src/orchestrator.ts` - runs the three specialists concurrently and collects their results.
- `src/synthesizer.ts` - merges, ranks, and filters the specialists' findings into one review.
- `src/trace.ts` - the v2 observability trace format the dashboard consumes.
- `dashboard/` - the static GitHub Pages dashboard that renders the traces (see `dashboard/README.md`).

## Dashboard

Sentinel has an observability dashboard deployed via GitHub Pages.

**URL:** https://javi23ruiz.github.io/sentinel/ *(GitHub project Pages for this repo; the build uses a relative asset base and hash routing so it serves correctly from that sub-path).*

See [dashboard/README.md](./dashboard/README.md) for local development instructions.

## Status

Phase 2 is complete: three specialist reviewers run in parallel with structured, schema-validated outputs, and a synthesizer merges and filters their findings into a single review comment.
See [ROADMAP.md](./ROADMAP.md) for what was built, known limitations, and what Phase 3 adds.


