import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { Finding } from "./schema.js";

// ---------------------------------------------------------------------------
// Shared, small types used across event variants
// ---------------------------------------------------------------------------

export type SkippedReason = "lockfile" | "generated" | "binary" | "size";

export interface SkippedFile {
  path: string;
  reason: SkippedReason;
}

export interface DuplicateGroup {
  /** The finding id of the representative (kept) finding. */
  representative: string;
  /** Raw finding ids that were merged into the representative. */
  merged: string[];
}

export interface DroppedFinding {
  finding: Finding;
  reason: "low_evidence" | "duplicate" | "confidence_floor" | "budget";
}

export interface ModelBreakdown {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

// ---------------------------------------------------------------------------
// TraceEvent — the discriminated union of all events a run can emit
// ---------------------------------------------------------------------------

export type TraceEvent =
  | TraceEventRunStart
  | TraceEventContextConstruction
  | TraceEventSpecialistStart
  | TraceEventSpecialistEnd
  | TraceEventSynthesizerReasoning
  | TraceEventComment
  | TraceEventRunEnd;

export interface TraceEventRunStart {
  type: "run_start";
  runId: string;
  timestamp: string; // ISO-8601
  prNumber: number;
  repo: string;
  headSha: string;
  model: string;
  synthModel: string;
}

export interface TraceEventContextConstruction {
  type: "context_construction";
  diffFiles: string[];
  diffLineCount: number;
  truncatedFiles: string[];
  skippedFiles: SkippedFile[];
  finalDiffTokens: number;
}

export interface TraceEventSpecialistStart {
  type: "specialist_start";
  specialistId: "security" | "correctness" | "maintainability";
  model: string;
  promptSha: string;
  inputTokens: number;
  startedAt: string; // ISO
}

export interface TraceEventSpecialistEnd {
  type: "specialist_end";
  specialistId: "security" | "correctness" | "maintainability";
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  rawFindings: Finding[];
  validationResult: "ok" | "failed";
  validationErrors?: string[];
  endedAt: string; // ISO
}

export interface TraceEventSynthesizerReasoning {
  type: "synthesizer_reasoning";
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  rawInputFindingCount: number;
  duplicateGroups: DuplicateGroup[];
  droppedFindings: DroppedFinding[];
  keptFindings: Finding[];
  verdict: "looks_good" | "comments_to_address" | "blocking_issues";
  verdictRationale: string;
}

export interface TraceEventComment {
  type: "comment";
  action: "created" | "updated";
  commentId: number;
}

export interface TraceEventRunEnd {
  type: "run_end";
  ms: number;
  totalCostUsd: number;
  modelBreakdown: ModelBreakdown[];
}

// ---------------------------------------------------------------------------
// Trace file envelope
// ---------------------------------------------------------------------------

export interface TraceFile {
  runId: string;
  version: "2";
  schemaChecksum: string;
  events: TraceEvent[];
  summary: TraceFileSummary;
}

export interface TraceFileSummary {
  verdict: "looks_good" | "comments_to_address" | "blocking_issues";
  findingCount: number;
  totalCostUsd: number;
  totalMs: number;
  specialistsRan: number;
  specialistsSucceeded: number;
  rawFindings: number;
  mergedFindings: number;
  droppedFindings: number;
}

// ---------------------------------------------------------------------------
// Schema checksum: hash of the shape of TraceEvent so old traces are
// recognisable. We hash a canonical string listing every union member and
// its fields in sorted order. That way a type rename, addition, or removal
// produces a different checksum even if all values happen to serialize the
// same.
// ---------------------------------------------------------------------------

const SCHEMA_FINGERPRINT_SOURCE = [
  "run_start:runId,timestamp,prNumber,repo,headSha,model,synthModel",
  "context_construction:diffFiles,diffLineCount,truncatedFiles,skippedFiles,finalDiffTokens",
  "specialist_start:specialistId,model,promptSha,inputTokens,startedAt",
  "specialist_end:specialistId,model,inputTokens,outputTokens,latencyMs,rawFindings,validationResult,validationErrors,endedAt",
  "synthesizer_reasoning:model,inputTokens,outputTokens,latencyMs,rawInputFindingCount,duplicateGroups,droppedFindings,keptFindings,verdict,verdictRationale",
  "comment:action,commentId",
  "run_end:ms,totalCostUsd,modelBreakdown",
].join("\n");

export const SCHEMA_CHECKSUM = createHash("sha256")
  .update(SCHEMA_FINGERPRINT_SOURCE)
  .digest("hex")
  .slice(0, 12);

// ---------------------------------------------------------------------------
// In-memory event collector
// ---------------------------------------------------------------------------

let events: TraceEvent[] = [];

/** Appends one event. Safe to call from any context (single-threaded). */
export function pushTraceEvent(event: TraceEvent): void {
  events.push(event);
}

/** Returns a snapshot of all collected events so far (for summary derivation). */
export function getTraceEvents(): readonly TraceEvent[] {
  return events;
}

/** Resets the collector. Useful between test runs. */
export function resetTrace(): void {
  events = [];
}

// ---------------------------------------------------------------------------
// Summary derivation
// ---------------------------------------------------------------------------

/**
 * Derives {@link TraceFileSummary} from the collected events.
 * Called after the run so it never depends on intermediate state.
 */
export function deriveSummary(
  events: readonly TraceEvent[],
  verdict: TraceFileSummary["verdict"],
  findingCount: number
): TraceFileSummary {
  let totalCostUsd = 0;
  let totalMs = 0;
  let specialistsRan = 0;
  let specialistsSucceeded = 0;
  let rawFindings = 0;
  let mergedFindings = 0;
  let droppedFindings = 0;

  for (const event of events) {
    switch (event.type) {
      case "run_end":
        totalCostUsd = event.totalCostUsd;
        totalMs = event.ms;
        break;
      case "specialist_end":
        specialistsRan++;
        rawFindings += event.rawFindings.length;
        if (event.validationResult === "ok") {
          specialistsSucceeded++;
        }
        break;
      case "synthesizer_reasoning":
        mergedFindings = event.duplicateGroups.reduce(
          (sum, g) => sum + g.merged.length,
          0
        );
        droppedFindings = event.droppedFindings.length;
        break;
    }
  }

  return {
    verdict,
    findingCount,
    totalCostUsd,
    totalMs,
    specialistsRan,
    specialistsSucceeded,
    rawFindings,
    mergedFindings,
    droppedFindings,
  };
}

// ---------------------------------------------------------------------------
// Trace file writer
// ---------------------------------------------------------------------------

/**
 * Serialises collected events into a trace file at `traces/{runId}.json`,
 * creating the `traces/` directory if it does not exist.
 *
 * @returns The complete {@link TraceFile} object that was written, for tests
 * to inspect without re-reading the file.
 */
export async function writeTraceFile(
  runId: string,
  verdict: TraceFileSummary["verdict"],
  findingCount: number
): Promise<TraceFile> {
  const snap = events;
  const summary = deriveSummary(snap, verdict, findingCount);

  const file: TraceFile = {
    runId,
    version: "2",
    schemaChecksum: SCHEMA_CHECKSUM,
    events: snap,
    summary,
  };

  const tracesDir = join(process.cwd(), "traces");
  await mkdir(tracesDir, { recursive: true });
  await writeFile(join(tracesDir, `${runId}.json`), JSON.stringify(file, null, 2), "utf8");

  return file;
}
