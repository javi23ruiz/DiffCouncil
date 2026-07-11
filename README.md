# Sentinel

Sentinel is an open-source GitHub Action that reviews pull requests using Claude.

**Status:** Phase 1 complete - see [ROADMAP.md](./ROADMAP.md) for what's next.

## Architecture

Sentinel Phase 1 is a prompt pipeline, not yet an agentic system.
It runs one LLM call per pull request: build a prompt from the diff, send it to Claude, post the response.
There is no tool use, no multi-step reasoning, and no cross-file awareness beyond what appears in the diff itself.
The agentic loop - specialist agents reviewing in parallel, tool use, decision-making about what to investigate further - arrives in Phases 3-5.
See [ROADMAP.md](./ROADMAP.md) for the phased plan and [docs/DECISIONS.md](./docs/DECISIONS.md) for why this shape was chosen for Phase 1.

## How it works right now

A workflow run triggers Sentinel on pull request open or update events.
Sentinel fetches the PR's unified diff via the GitHub API.
If the diff exceeds the 50k token budget, it is truncated and a truncation notice is appended so reviewers know the review is partial.
The (possibly truncated) diff is sent to Claude in a single call using the prompt in `prompts/reviewer.md`, and the response is parsed into a review comment.
Sentinel then posts that comment on the PR, or updates its existing comment in place on subsequent runs so reruns don't produce duplicates.

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
- `evals/planted-bugs/` - informal Phase 1 eval log: one entry per dogfood PR recording planted bugs, what Sentinel caught/missed, and false positives.
- `package.json` - dependencies (`@anthropic-ai/sdk`, `@octokit/rest`, `zod`) and dev tooling (`typescript`, `vitest`, `tsup`).
- `tsconfig.json` - strict TypeScript compiler configuration.
- `prompts/reviewer.md` - the review prompt sent to Claude. Currently a stub; the real prompt is written by hand, not generated.
- `src/index.ts` - Action entry point. Reads inputs and (once implemented) wires together `github.ts` and `reviewer.ts`.
- `src/github.ts` - fetches a PR's diff and posts/updates the review comment. Comment updates must be idempotent: reruns on the same PR update the existing bot comment rather than creating duplicates.
- `src/reviewer.ts` - calls Claude with the prompt loaded from `prompts/reviewer.md` and the PR diff.
- `src/context.ts` - token estimation and diff truncation (50k token limit, with a truncation notice appended when truncation occurs).

## Status

Phase 1 is complete: the end-to-end path from "PR opened" to "comment posted" works, including idempotent comment updates and token/cost telemetry.
See [ROADMAP.md](./ROADMAP.md) for what was built, known limitations, and what Phase 2 adds.


