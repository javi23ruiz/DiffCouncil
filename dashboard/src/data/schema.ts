import { z } from "zod";

export const FindingSchema = z.object({
  id: z.string().optional(),
  file: z.string(),
  lineStart: z.number().int().positive(),
  lineEnd: z.number().int().positive(),
  severity: z.enum(["critical", "high", "medium", "low"]),
  category: z.enum(["security", "correctness", "maintainability"]),
  confidence: z.number().min(0).max(1),
  description: z.string(),
  suggestedFix: z.string().optional(),
});

export const SkippedFileSchema = z.object({
  path: z.string(),
  reason: z.enum(["lockfile", "generated", "binary", "size"]),
});

export const DuplicateGroupSchema = z.object({
  representative: z.string(),
  merged: z.array(z.string()),
});

export const DroppedFindingSchema = z.object({
  finding: FindingSchema,
  reason: z.enum(["low_evidence", "duplicate", "confidence_floor", "budget"]),
});

export const ModelBreakdownSchema = z.object({
  model: z.string(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  costUsd: z.number(),
});

// ---------------------------------------------------------------------------
// TraceEvent union — mirrors src/trace.ts exactly
// ---------------------------------------------------------------------------

export const TraceEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("run_start"),
    runId: z.string(),
    timestamp: z.string(),
    prNumber: z.number(),
    repo: z.string(),
    headSha: z.string(),
    model: z.string(),
    synthModel: z.string(),
  }),
  z.object({
    type: z.literal("context_construction"),
    diffFiles: z.array(z.string()),
    diffLineCount: z.number(),
    truncatedFiles: z.array(z.string()),
    skippedFiles: z.array(SkippedFileSchema),
    finalDiffTokens: z.number(),
  }),
  z.object({
    type: z.literal("specialist_start"),
    specialistId: z.enum(["security", "correctness", "maintainability"]),
    model: z.string(),
    promptSha: z.string(),
    inputTokens: z.number(),
    startedAt: z.string(),
  }),
  z.object({
    type: z.literal("specialist_end"),
    specialistId: z.enum(["security", "correctness", "maintainability"]),
    model: z.string(),
    inputTokens: z.number(),
    outputTokens: z.number(),
    latencyMs: z.number(),
    rawFindings: z.array(FindingSchema),
    validationResult: z.enum(["ok", "failed"]),
    validationErrors: z.array(z.string()).optional(),
    endedAt: z.string(),
  }),
  z.object({
    type: z.literal("synthesizer_reasoning"),
    model: z.string(),
    inputTokens: z.number(),
    outputTokens: z.number(),
    latencyMs: z.number(),
    rawInputFindingCount: z.number(),
    duplicateGroups: z.array(DuplicateGroupSchema),
    droppedFindings: z.array(DroppedFindingSchema),
    keptFindings: z.array(FindingSchema),
    verdict: z.enum(["looks_good", "comments_to_address", "blocking_issues"]),
    verdictRationale: z.string(),
  }),
  z.object({
    type: z.literal("comment"),
    action: z.enum(["created", "updated"]),
    commentId: z.number(),
  }),
  z.object({
    type: z.literal("run_end"),
    ms: z.number(),
    totalCostUsd: z.number(),
    modelBreakdown: z.array(ModelBreakdownSchema),
  }),
]);

export const TraceFileSummarySchema = z.object({
  verdict: z.enum(["looks_good", "comments_to_address", "blocking_issues"]),
  findingCount: z.number(),
  totalCostUsd: z.number(),
  totalMs: z.number(),
  specialistsRan: z.number(),
  specialistsSucceeded: z.number(),
  rawFindings: z.number(),
  mergedFindings: z.number(),
  droppedFindings: z.number(),
});

export const TraceFileSchema = z.object({
  runId: z.string(),
  version: z.literal("2"),
  schemaChecksum: z.string(),
  events: z.array(TraceEventSchema),
  summary: TraceFileSummarySchema,
});
