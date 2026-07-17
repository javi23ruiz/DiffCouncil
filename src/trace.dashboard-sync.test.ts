import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

// The dashboard keeps a hand-written Zod mirror of the producer types in
// src/trace.ts (see ADR-009). Nothing structural prevents the two from
// drifting apart, and a drifted trace is silently skipped by the dashboard
// loader at runtime, so drift ships an empty dashboard with no signal. This
// test is the fail-loudly guard ADR-009 asked for: a trace built from the
// producer types, plus every committed trace on disk, must validate against
// the dashboard's schema.
import { TraceFileSchema } from "../dashboard/src/data/schema.js";
import type { Finding } from "./schema.js";
import {
  deriveSummary,
  getTraceEvents,
  pushTraceEvent,
  resetTrace,
  SCHEMA_CHECKSUM,
  type TraceEvent,
  type TraceFile,
} from "./trace.js";

/**
 * Every member of the TraceEvent union. Typed as a Record so adding a new
 * event type without covering it here is a compile error, which forces the
 * synthetic trace below (and therefore the dashboard schema) to keep up.
 */
const ALL_EVENT_TYPES: Record<TraceEvent["type"], true> = {
  run_start: true,
  context_construction: true,
  specialist_start: true,
  specialist_end: true,
  synthesizer_reasoning: true,
  comment: true,
  run_end: true,
};

const findingWithOptionals: Finding = {
  id: "abc123def456",
  file: "src/example.ts",
  lineStart: 10,
  lineEnd: 14,
  severity: "high",
  category: "security",
  confidence: 0.9,
  description: "Example finding with every optional field populated.",
  suggestedFix: "Do the safe thing instead.",
};

const findingWithoutOptionals: Finding = {
  file: "src/other.ts",
  lineStart: 3,
  lineEnd: 3,
  severity: "low",
  category: "maintainability",
  confidence: 0.55,
  description: "Example finding with optional fields omitted.",
};

/**
 * Pushes one of every event type, exercising optional fields both present
 * (validationErrors, finding id/suggestedFix) and absent, and every enum
 * branch that has its own meaning (all four dropped-finding reasons).
 */
function pushOneOfEveryEvent(): void {
  pushTraceEvent({
    type: "run_start",
    runId: "drift-check",
    timestamp: new Date().toISOString(),
    prNumber: 42,
    repo: "example/repo",
    headSha: "0123456789abcdef",
    model: "claude-sonnet-4-6",
    synthModel: "claude-sonnet-4-6",
  });
  pushTraceEvent({
    type: "context_construction",
    diffFiles: ["src/example.ts", "src/other.ts"],
    diffLineCount: 120,
    truncatedFiles: ["src/truncated.ts"],
    skippedFiles: [
      { path: "package-lock.json", reason: "lockfile" },
      { path: "gen/api.g.ts", reason: "generated" },
      { path: "logo.png", reason: "binary" },
      { path: "big-file.ts", reason: "size" },
    ],
    finalDiffTokens: 1234,
  });
  pushTraceEvent({
    type: "specialist_start",
    specialistId: "security",
    model: "claude-sonnet-4-6",
    promptSha: "aaaaaaaaaaaa",
    inputTokens: 0,
    startedAt: new Date().toISOString(),
  });
  pushTraceEvent({
    type: "specialist_end",
    specialistId: "security",
    model: "claude-sonnet-4-6",
    inputTokens: 1000,
    outputTokens: 200,
    latencyMs: 1500,
    rawFindings: [findingWithOptionals, findingWithoutOptionals],
    validationResult: "ok",
    endedAt: new Date().toISOString(),
  });
  pushTraceEvent({
    type: "specialist_end",
    specialistId: "correctness",
    model: "claude-sonnet-4-6",
    inputTokens: 0,
    outputTokens: 0,
    latencyMs: 0,
    rawFindings: [],
    validationResult: "failed",
    validationErrors: ["findings.0.description: too long"],
    endedAt: new Date().toISOString(),
  });
  pushTraceEvent({
    type: "synthesizer_reasoning",
    model: "claude-sonnet-4-6",
    inputTokens: 800,
    outputTokens: 150,
    latencyMs: 900,
    rawInputFindingCount: 2,
    duplicateGroups: [{ representative: "abc123def456", merged: ["fedcba654321"] }],
    droppedFindings: [
      { finding: findingWithoutOptionals, reason: "low_evidence" },
      { finding: findingWithoutOptionals, reason: "duplicate" },
      { finding: findingWithOptionals, reason: "confidence_floor" },
      { finding: findingWithoutOptionals, reason: "budget" },
    ],
    keptFindings: [findingWithOptionals],
    verdict: "comments_to_address",
    verdictRationale: "One real issue worth addressing.",
  });
  pushTraceEvent({
    type: "comment",
    action: "created",
    commentId: 987654,
  });
  pushTraceEvent({
    type: "run_end",
    ms: 21000,
    totalCostUsd: 0.15,
    modelBreakdown: [
      {
        model: "claude-sonnet-4-6",
        inputTokens: 1800,
        outputTokens: 350,
        costUsd: 0.15,
      },
    ],
  });
}

describe("producer trace validates against the dashboard schema", () => {
  beforeEach(() => {
    resetTrace();
  });

  it("covers every TraceEvent type in the synthetic trace", () => {
    pushOneOfEveryEvent();
    const seen = new Set(getTraceEvents().map((e) => e.type));
    for (const type of Object.keys(ALL_EVENT_TYPES)) {
      expect(seen, `synthetic trace is missing event type ${type}`).toContain(
        type
      );
    }
  });

  it("accepts a full synthetic trace built from the producer types", () => {
    pushOneOfEveryEvent();
    const events = [...getTraceEvents()];
    const file: TraceFile = {
      runId: "drift-check",
      version: "2",
      schemaChecksum: SCHEMA_CHECKSUM,
      events,
      summary: deriveSummary(events, "comments_to_address", 1),
    };

    const parsed = TraceFileSchema.safeParse(file);
    expect(
      parsed.success,
      `dashboard schema rejected a producer-built trace: ${JSON.stringify(
        parsed.success ? [] : parsed.error.issues,
        null,
        2
      )}`
    ).toBe(true);
  });
});

describe("committed traces validate against the dashboard schema", () => {
  const tracesDir = join(process.cwd(), "traces");
  const traceFiles = readdirSync(tracesDir).filter((f) => f.endsWith(".json"));

  it("finds at least one committed trace to validate", () => {
    expect(traceFiles.length).toBeGreaterThan(0);
  });

  it.each(traceFiles)("%s parses under the dashboard schema", (name) => {
    const raw: unknown = JSON.parse(
      readFileSync(join(tracesDir, name), "utf8")
    );
    const parsed = TraceFileSchema.safeParse(raw);
    expect(
      parsed.success,
      `dashboard schema rejected ${name}: ${JSON.stringify(
        parsed.success ? [] : parsed.error.issues,
        null,
        2
      )}`
    ).toBe(true);
  });
});
