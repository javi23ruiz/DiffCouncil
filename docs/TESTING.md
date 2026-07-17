# Testing strategy

Sentinel's tests are layered by the kind of failure each layer is built to catch.
This file explains the layers, with extra depth on smoke tests, and says exactly where each layer runs in CI.

## What a smoke test is

A smoke test is a cheap, shallow, end-to-end check that a system's most basic function works at all.
The name comes from hardware engineering: plug the board in, and if smoke comes out, stop - no point running the detailed test plan.
A smoke test does not ask "is the output correct in every detail"; it asks "is there meaningful output at all".

Smoke tests earn their place where the failure mode is *structural emptiness*: the pipeline reports success at every step, yet the end product is hollow.
Unit tests cannot catch this class of failure, because each unit genuinely works; the defect lives in the seams between them (a path that resolves to the wrong directory, a glob that matches nothing, an artifact uploaded from an empty folder).
The engineering rule that follows: verify at the artifact the user actually consumes, not at the step before it.

Properties a good smoke test should have:

- **End to end.** It exercises the real pipeline output (the built bundle, the deployed page, the posted comment), not an internal intermediate.
- **Cheap.** Seconds, not minutes, so it can run on every PR and before every deploy without anyone being tempted to skip it.
- **Binary and loud.** It either passes or fails the build; it never degrades to a warning nobody reads.

## Why Sentinel has one

The trace-to-dashboard pipeline failed silently three separate times before this guard existed:

1. Traces were written during the Action run but never committed, so they never reached main.
2. The trace-commit push was rejected (detached PR merge ref), and the failure was swallowed.
3. The dashboard loader globbed a directory that does not exist (`dashboard/traces/` instead of the repo root `traces/`), so the build succeeded while embedding zero runs, and the site deployed structurally empty.

Every one of these produced green checkmarks.
The lesson each time was the same: between "a run happened" and "a human sees the data" there are several hops, and each hop's failure mode defaults to silence unless loudness is engineered in.

## The layers

### Unit and behavior tests (`src/*.test.ts`, vitest)

Verify one module's logic in isolation: diff truncation, finding-id assignment, rendering and sanitization, merge/drop bookkeeping.
Run locally with `npm test`, and on every PR and push to main by `.github/workflows/ci.yml`.

### Drift tests (also vitest, but a distinct intent)

Guard two places that must agree but have no structural link forcing them to:

- `src/synthesizer.threshold.test.ts`: the confidence thresholds and merge line distance stated in `prompts/synthesizer.md` versus the constants in `src/synthesizer.ts`, plus the invariant that the deterministic matcher's tolerance is at least as wide as the model's merge distance.
- `src/trace.dashboard-sync.test.ts`: the producer trace types in `src/trace.ts` versus the dashboard's hand-written Zod mirror in `dashboard/src/data/schema.ts` (the guard ADR-009 called for), validated with a synthetic trace covering every event type and with every committed trace in `traces/`.

A drift test exists because a prose comment saying "keep these in sync" rots quietly; a failing test does not.

### Build smoke check (`scripts/check-dashboard-bundle.sh`)

After the dashboard builds, the script greps the built JS bundle for the runId of every committed trace in `traces/`.
The dashboard inlines traces at build time via a Vite glob, so a committed trace missing from the bundle means the glob is broken again and the site would deploy empty.
It runs in `.github/workflows/dashboard.yml` on PRs that touch the dashboard or traces (build-check job) and before every Pages deploy (deploy job), and fails the workflow rather than warning.
Run it locally from the repo root after `cd dashboard && npm run build`.

## Where each layer runs

| Layer | Workflow | Trigger |
| --- | --- | --- |
| Typecheck + unit + drift tests | `.github/workflows/ci.yml` | every PR, push to main |
| Dashboard build + smoke check | `.github/workflows/dashboard.yml` (build-check) | PRs touching `dashboard/`, `traces/`, the script, or the workflow |
| Dashboard build + smoke check + deploy | `.github/workflows/dashboard.yml` (deploy) | push to main touching the same paths |
| Dogfood review run | `.github/workflows/sentinel-self.yml` | every PR |

## Known gaps

- The smoke check proves a trace is *embedded*, and the drift test proves committed traces *validate*, but nothing yet exercises the deployed page in a browser (a Playwright check that the run table renders rows would close that).
- The planted-bug eval log (`evals/planted-bugs/`) is the correctness layer for review *quality*; it is manual today and becomes the automated harness in Phase 3.
