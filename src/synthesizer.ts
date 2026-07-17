import { join } from "node:path";

import type { DiffSummary } from "./context.js";
import { loadPrompt, PROMPTS_DIR } from "./prompt-loader.js";
import { renderUntrusted } from "./prompt-safety.js";
import { callSubmitReview } from "./review-call.js";
import { buildSubmitReviewTool } from "./review-tool.js";
import type { SpecialistResult } from "./reviewers/base.js";
import type { Finding, ReviewResponse } from "./schema.js";
import type { DroppedFinding, DuplicateGroup } from "./trace.js";

// Confidence thresholds below which a raw finding is considered dropped.
// Security gets a lower bar because a missed vulnerability is costlier than a
// false positive. These MUST stay in sync with the numbers stated in
// prompts/synthesizer.md, which instruct the model to apply the same cut;
// synthesizer.threshold.test.ts guards against drift between the two.
export const DROP_THRESHOLD = 0.5;
export const SECURITY_DROP_THRESHOLD = 0.4;

// Line distance within which the model is told to merge duplicate findings.
// MUST stay in sync with the "within N lines" rule in prompts/synthesizer.md;
// synthesizer.threshold.test.ts guards against drift between the two.
export const MERGE_LINE_DISTANCE = 3;

// Line tolerance used when attributing kept findings back to raw ones for the
// deterministic merge/drop bookkeeping. Deliberately wider than
// MERGE_LINE_DISTANCE: a merged finding may carry the line range of either
// member (the prompt says to keep the higher-severity one), so attribution
// needs slack beyond the merge distance or real merges would be miscounted as
// drops. The invariant MATCH_LINE_TOLERANCE >= MERGE_LINE_DISTANCE is what
// makes that sound, and is asserted in synthesizer.threshold.test.ts.
export const MATCH_LINE_TOLERANCE = 10;

const SYSTEM_PROMPT_PATH = join(PROMPTS_DIR, "synthesizer.md");

/**
 * The `submit_review` tool the synthesizer is forced to call. Its input schema
 * is generated from `ReviewResponseSchema` (see review-tool.ts), the same source
 * of truth the specialists use, so the two can never drift apart.
 */
const SUBMIT_REVIEW_TOOL = buildSubmitReviewTool(
  "Submit the synthesized code review. Call this exactly once."
);

export interface SynthesizeInput {
  specialistResults: SpecialistResult[];
  diffSummary: DiffSummary;
  model: string;
  apiKey: string;
}

export interface SynthesizeResult {
  response: ReviewResponse;
  usage: { inputTokens: number; outputTokens: number };
  latencyMs: number;
  /** How many raw findings were merged into fewer. */
  mergedCount: number;
  /** How many raw findings were dropped for low confidence. */
  droppedCount: number;
  /**
   * How many findings the synthesizer emitted beyond what survived the
   * confidence filter - i.e. findings it appears to have invented, which its
   * prompt forbids. Normally 0; a positive value is an anomaly callers should
   * surface rather than hide.
   */
  addedCount: number;
  /** Groups of raw findings that correspond to a single kept finding. */
  duplicateGroups: DuplicateGroup[];
  /** Raw findings that did not survive (below threshold or unrepresented). */
  droppedFindings: DroppedFinding[];
}

/** True when a raw finding falls below its category's confidence threshold. */
function isBelowThreshold(finding: Finding): boolean {
  const threshold =
    finding.category === "security" ? SECURITY_DROP_THRESHOLD : DROP_THRESHOLD;
  return finding.confidence < threshold;
}

/**
 * Determines whether a raw finding and a kept finding overlap enough to be
 * considered the same issue. Matches when: same file AND within
 * MATCH_LINE_TOLERANCE lines (see the constant for why this is wider than the
 * merge distance the model is given).
 */
function findingsOverlap(raw: Finding, kept: Finding): boolean {
  if (raw.file !== kept.file) return false;
  const dist = Math.abs(raw.lineStart - kept.lineStart);
  return dist <= MATCH_LINE_TOLERANCE;
}

/**
 * Derives merge/drop/add counts AND the structured grouping data from the raw
 * input findings and the synthesized output.
 *
 * Strategy:
 * 1. Separate raw findings into dropped (below threshold) and surviving.
 * 2. Match surviving findings to kept findings by file + line proximity.
 *    The first surviving finding matching a kept finding claims it; subsequent
 *    matches form a duplicate group.
 * 3. Surviving findings that match no kept finding are dropped as "duplicate".
 * 4. Dropped findings are tagged: "low_evidence" for below-threshold (general)
 *    or "confidence_floor" for below-security-threshold security findings.
 */
export function matchFindings(
  rawFindings: readonly Finding[],
  keptFindings: readonly Finding[]
): {
  mergedCount: number;
  droppedCount: number;
  addedCount: number;
  duplicateGroups: DuplicateGroup[];
  droppedFindings: DroppedFinding[];
} {
  // Partition raw findings.
  const dropped: { finding: Finding; reason: DroppedFinding["reason"] }[] = [];
  const surviving: Finding[] = [];

  for (const raw of rawFindings) {
    if (isBelowThreshold(raw)) {
      const reason =
        raw.category === "security" && raw.confidence >= DROP_THRESHOLD
          ? ("confidence_floor" as const)
          : ("low_evidence" as const);
      dropped.push({ finding: raw, reason });
    } else {
      surviving.push(raw);
    }
  }

  // Match surviving to kept. Greedy first-match, one kept finding per result.
  const keptMatched = new Set<number>(); // indices into keptFindings
  const groupMap = new Map<number, string[]>(); // keptIdx -> [rawIds]
  const unmatchedSurvivors: Finding[] = [];

  for (const raw of surviving) {
    let matched = false;
    for (let i = 0; i < keptFindings.length; i++) {
      const kept = keptFindings[i]!;
      if (findingsOverlap(raw, kept)) {
        if (!keptMatched.has(i)) {
          // First raw matched to this kept finding — representative.
          keptMatched.add(i);
          groupMap.set(i, [raw.id ?? "unknown"]);
          matched = true;
          break;
        } else {
          // Another raw already claimed this kept — merge.
          groupMap.get(i)?.push(raw.id ?? "unknown");
          matched = true;
          break;
        }
      }
    }
    if (!matched) {
      unmatchedSurvivors.push(raw);
    }
  }

  // Build duplicate groups: only groups with >1 member are real duplicates.
  const duplicateGroups: DuplicateGroup[] = [];
  for (const [i, merged] of groupMap) {
    if (merged.length > 1) {
      const rep = merged[0]!;
      duplicateGroups.push({
        representative: rep,
        merged: merged.slice(1),
      });
    }
  }

  // Unmatched survivors are effectively dropped (absorbed into another finding).
  for (const raw of unmatchedSurvivors) {
    dropped.push({ finding: raw, reason: "duplicate" });
  }

  const droppedCount = dropped.length;
  const survivingCount = surviving.length;
  const mergedCount = Math.max(0, survivingCount - keptFindings.length);
  const addedCount = Math.max(0, keptFindings.length - survivingCount);

  return {
    mergedCount,
    droppedCount,
    addedCount,
    duplicateGroups,
    droppedFindings: dropped.map((d) => ({
      finding: d.finding,
      reason: d.reason,
    })),
  };
}

/**
 * Builds the synthesizer user message: the specialists' findings and the diff
 * summary as JSON. The raw diff is deliberately excluded — the synthesizer
 * reasons over structured claims, not code.
 *
 * These findings are model output derived from an attacker-controlled diff, so
 * a compromised or manipulated specialist response could carry injected text.
 * The payload is therefore wrapped as untrusted input (see prompt-safety.ts) so
 * the injection defense holds across pipeline stages, not just at the first hop.
 */
function buildUserMessage(
  rawFindings: readonly Finding[],
  diffSummary: DiffSummary
): string {
  const payload = JSON.stringify(
    { diffSummary, findings: rawFindings },
    null,
    2
  );
  return renderUntrusted([
    { label: "specialist_findings_json", content: payload },
  ]);
}

/**
 * A canned synthesized review used when SENTINEL_MOCK is set, so the full
 * pipeline can run end-to-end without an API call. Keeps the first raw finding
 * (if any) so counts are non-trivial.
 */
function mockResult(input: SynthesizeInput): SynthesizeResult {
  const rawFindings = input.specialistResults.flatMap(
    (r) => r.response.findings
  );
  const kept = rawFindings.slice(0, 1);
  const match = matchFindings(rawFindings, kept);
  return {
    response: {
      summary: "Mock synthesized review across specialists.",
      findings: kept,
      verdict: kept.length > 0 ? "comments_to_address" : "looks_good",
    },
    usage: { inputTokens: 0, outputTokens: 0 },
    latencyMs: 0,
    mergedCount: match.mergedCount,
    droppedCount: match.droppedCount,
    addedCount: match.addedCount,
    duplicateGroups: match.duplicateGroups,
    droppedFindings: match.droppedFindings,
  };
}

/**
 * Synthesizes the specialists' findings into a single unified review via a
 * tool-forced Claude call, then derives merge/drop stats deterministically.
 *
 * @throws If the model does not return a tool call, or its input fails schema
 * validation.
 */
export async function synthesize(
  input: SynthesizeInput
): Promise<SynthesizeResult> {
  if (process.env["SENTINEL_MOCK"]) {
    return mockResult(input);
  }

  const rawFindings = input.specialistResults.flatMap(
    (r) => r.response.findings
  );

  const systemPrompt = await loadPrompt(SYSTEM_PROMPT_PATH);
  const userMessage = buildUserMessage(rawFindings, input.diffSummary);

  const outcome = await callSubmitReview({
    apiKey: input.apiKey,
    model: input.model,
    systemPrompt,
    userMessage,
    tool: SUBMIT_REVIEW_TOOL,
  });

  const match = matchFindings(rawFindings, outcome.response.findings);

  return {
    ...outcome,
    mergedCount: match.mergedCount,
    droppedCount: match.droppedCount,
    addedCount: match.addedCount,
    duplicateGroups: match.duplicateGroups,
    droppedFindings: match.droppedFindings,
  };
}
