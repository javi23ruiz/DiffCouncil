# Sentinel

Sentinel is an open-source GitHub Action that reviews pull requests using Claude.
It is currently in Phase 1: a walking skeleton with the project structure in place but no review logic implemented yet.

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

Phase 1 scaffolding is in place. `src/*.ts` files currently contain typed function signatures with `TODO`/`not implemented` bodies; internals are implemented in later phases starting with `github.ts`.

< sentinel plumbing test more test and more test -->
