// ---------------------------------------------------------------------------
// Types mirroring src/trace.ts — kept as a separate copy so the dashboard
// never depends on the action source.
// ---------------------------------------------------------------------------

export type SpecialistId = "security" | "correctness" | "maintainability";
export type Severity = "critical" | "high" | "medium" | "low";
export type Verdict = "looks_good" | "comments_to_address" | "blocking_issues";
export type SkippedReason = "lockfile" | "generated" | "binary" | "size";
export type DropReason = "low_evidence" | "duplicate" | "confidence_floor" | "budget";

export interface SkippedFile {
  path: string;
  reason: SkippedReason;
}

export interface Finding {
  id?: string;
  file: string;
  lineStart: number;
  lineEnd: number;
  severity: Severity;
  category: SpecialistId;
  confidence: number;
  description: string;
  suggestedFix?: string;
}

export interface DuplicateGroup {
  representative: string;
  merged: string[];
}

export interface DroppedFinding {
  finding: Finding;
  reason: DropReason;
}

export interface ModelBreakdown {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

// ---------------------------------------------------------------------------
// TraceEvent discriminated union
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
  timestamp: string;
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
  specialistId: SpecialistId;
  model: string;
  promptSha: string;
  inputTokens: number;
  startedAt: string;
}

export interface TraceEventSpecialistEnd {
  type: "specialist_end";
  specialistId: SpecialistId;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  rawFindings: Finding[];
  validationResult: "ok" | "failed";
  validationErrors?: string[];
  endedAt: string;
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
  verdict: Verdict;
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

export interface TraceFileSummary {
  verdict: Verdict;
  findingCount: number;
  totalCostUsd: number;
  totalMs: number;
  specialistsRan: number;
  specialistsSucceeded: number;
  rawFindings: number;
  mergedFindings: number;
  droppedFindings: number;
}

export interface TraceFile {
  runId: string;
  version: "2";
  schemaChecksum: string;
  events: TraceEvent[];
  summary: TraceFileSummary;
}

// ---------------------------------------------------------------------------
// Derived convenience type: everything extracted from a trace for rendering
// ---------------------------------------------------------------------------

export interface RunSummary {
  runId: string;
  prNumber: number;
  repo: string;
  headSha: string;
  timestamp: string;
  verdict: Verdict;
  findingCount: number;
  totalCostUsd: number;
  totalMs: number;
  specialists: { id: SpecialistId; succeeded: boolean; promptSha: string }[];
  promptSha: string; // first specialist's SHA, best-effort
  model: string;
  synthModel: string;
  rawFindings: Finding[];
  keptFindings: Finding[];
  droppedFindings: DroppedFinding[];
  duplicateGroups: DuplicateGroup[];
  modelBreakdown: ModelBreakdown[];
  events: TraceEvent[];
}
