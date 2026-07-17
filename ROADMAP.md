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

## Phase 2: Structured output and specialist reviewers - ✅ Complete (2026-07-12)

Phase 2 replaced the single free-form reviewer with a structured, parallel pipeline: several specialists review the same diff independently, and a synthesizer merges their findings into one comment.

### What was built

- **Structured, tool-forced outputs.** Every reviewer returns findings through a forced `submit_review` tool call, validated against a shared Zod schema, so findings are machine-readable rather than free-form markdown.
- **Zod schemas at the boundaries.** The finding and review shapes are defined once in `src/schema.ts`, and the tool's JSON schema is generated from them, so the contract the model must satisfy cannot drift from what is validated.
- **Three parallel specialists.** Security, correctness, and maintainability reviewers run concurrently over the same diff, each with its own focused prompt.
- **Synthesizer agent.** A dedicated pass that deduplicates, ranks, and filters the specialists' findings into a single unified review.
- **Noise countermeasures.** Significance filters and per-category confidence floors in the specialist prompts, plus the synthesizer's drop and merge rules, keep low-value findings out of the comment.
- **Per-specialist structured logging.** Each specialist, the synthesizer, and the run as a whole emit structured JSON telemetry (tokens, latency, merge/drop/added counts, and failures).

### Known limitations of Phase 2

These are not apologies. They are the motivations for the phases that follow.

- **Still diff-only.** The specialists and synthesizer see the unified diff and nothing else; there is still no cross-file context or awareness of call sites outside the diff.
- **Not truly agentic.** The pipeline is fixed: every specialist always runs and the synthesizer always follows. No LLM makes a control-flow decision yet - that arrives in Phase 3.
- **Heuristic filtering, not calibration.** The synthesizer applies hand-set confidence thresholds and merge rules rather than thresholds derived from measured precision and recall. Measured calibration is Phase 4.
- **No verifier agents.** Nothing independently checks a finding before it is posted, so a plausible-but-wrong finding can still reach the comment. Verifier agents are Phase 5.

## Phase 3: Evaluation harness, then routing and lightweight context - 🚧 Next

Sequencing note: the eval harness was originally Phase 4 (calibration).
It is pulled forward to lead Phase 3 because the router's entire job is deciding which specialists to run, and that decision - like the three-specialist set itself (see ADR-006) - cannot be validated without measured precision and recall.
Measurement comes before the architecture it is meant to justify.

- **Eval harness (pulled forward from Phase 4).** Turn `evals/planted-bugs/` from a manual log into an automated suite: run Sentinel over the recorded planted-bug PRs and score catch rate, false positives, and per-category precision and recall. This is the baseline every later change is measured against.
- **Router.** A fast Haiku classification step decides which specialists run for a given diff, instead of always running all three - evaluated against the harness so the routing decision is judged on data, not intuition.
- **One-hop import context.** A deterministic AST walk pulls in the directly imported symbols a changed file depends on, giving reviewers limited cross-file context without full retrieval.
- **Diff-unchanged short-circuit.** Skip re-review when a PR update does not change the reviewed diff, avoiding redundant runs and duplicate work.

The committed run traces (see ADR-009) are the raw material for the harness: each is a labeled record of what a run did, so scoring becomes a matter of comparing traces against the planted-bug ground truth.

## Candidate directions beyond Phase 3 (recorded 2026-07-16, not yet scoped)

These are ideas under consideration for how Sentinel gets real cross-file understanding, recorded here so they are not lost.
None of them is committed scope: each must be judged against the eval harness once it exists, not adopted on intuition (the same rule ADR-006 applies to the specialist set).

- **Repo indexing into a code graph.** Index the repository into a graph of symbols, imports, and call sites ahead of review, and let the pipeline query it for the context a finding needs. Strong retrieval, but it adds an indexing step with caching and staleness concerns inside a stateless Action run.
- **Agentic context retrieval via tools.** Instead of a pre-built index, give the reviewer model tools (resolve an import, read a file region, find call sites of a symbol) and let it pull context on demand from the checkout already present on the runner. This subsumes the planned deterministic one-hop import walk and fits ADR-002's raw-SDK, tool-use-as-primitive approach, at the cost of a multi-turn agent loop with less predictable latency and spend.
- **Rethinking the fixed specialist set.** The three-parallel-specialists design may not survive contact with eval data; a single stronger agentic reviewer with tools, or a router picking from a wider specialist pool, are both on the table once catch rate and precision can be measured per configuration.
