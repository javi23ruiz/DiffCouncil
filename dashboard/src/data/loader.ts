import type { RunSummary, TraceEvent, TraceFile } from "./types";
import { TraceFileSchema } from "./schema";

// ---------------------------------------------------------------------------
// Build-time glob: import all trace JSON files from ../traces/
// ---------------------------------------------------------------------------

const traceModules = import.meta.glob(
  "../../traces/*.json",
  { eager: true }
) as Record<string, { default: unknown }>;

function loadTraceFiles(): TraceFile[] {
  const valid: TraceFile[] = [];
  for (const [path, mod] of Object.entries(traceModules)) {
    const parsed = TraceFileSchema.safeParse(mod.default);
    if (parsed.success) {
      valid.push(parsed.data);
    } else {
      // Extract runId from filename if possible for the warning.
      const match = /\/([^/]+)\.json$/.exec(path);
      const runId = match?.[1] ?? path;
      console.warn(
        `Skipping trace ${runId}: schema validation failed`,
        parsed.error.issues
      );
    }
  }
  return valid;
}

// ---------------------------------------------------------------------------
// Extract a RunSummary from a TraceFile — flattens events into a single
// convenient shape for rendering.
// ---------------------------------------------------------------------------

function extractRunSummary(tf: TraceFile): RunSummary {
  const runStart = tf.events.find(
    (e): e is Extract<TraceEvent, { type: "run_start" }> =>
      e.type === "run_start"
  );
  const synth = tf.events.find(
    (e): e is Extract<TraceEvent, { type: "synthesizer_reasoning" }> =>
      e.type === "synthesizer_reasoning"
  );

  const specialistEnds = tf.events.filter(
    (e): e is Extract<TraceEvent, { type: "specialist_end" }> =>
      e.type === "specialist_end"
  );
  const specialistStarts = tf.events.filter(
    (e): e is Extract<TraceEvent, { type: "specialist_start" }> =>
      e.type === "specialist_start"
  );

  const specialists = specialistEnds.map((e) => ({
    id: e.specialistId,
    succeeded: e.validationResult === "ok",
    promptSha:
      specialistStarts.find((s) => s.specialistId === e.specialistId)
        ?.promptSha ?? "unknown",
  }));

  return {
    runId: tf.runId,
    prNumber: runStart?.prNumber ?? 0,
    repo: runStart?.repo ?? "",
    headSha: runStart?.headSha ?? "",
    timestamp: runStart?.timestamp ?? "",
    verdict: tf.summary.verdict,
    findingCount: tf.summary.findingCount,
    totalCostUsd: tf.summary.totalCostUsd,
    totalMs: tf.summary.totalMs,
    specialists,
    promptSha: specialists[0]?.promptSha ?? "unknown",
    model: runStart?.model ?? "",
    synthModel: runStart?.synthModel ?? "",
    rawFindings: synth?.keptFindings
      ? [
          ...synth.keptFindings,
          ...synth.droppedFindings.map((d) => d.finding),
        ]
      : [],
    keptFindings: synth?.keptFindings ?? [],
    droppedFindings: synth?.droppedFindings ?? [],
    duplicateGroups: synth?.duplicateGroups ?? [],
    modelBreakdown: [], // populated by getAllRuns via extractBreakdown()
    events: tf.events,
  };
}

function extractBreakdown(tf: TraceFile) {
  const runEnd = tf.events.find(
    (e): e is Extract<TraceEvent, { type: "run_end" }> =>
      e.type === "run_end"
  );
  return runEnd?.modelBreakdown ?? [];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

let _runs: RunSummary[] | null = null;

/** Returns all trace runs, sorted newest-first. Built once, cached forever. */
export function getAllRuns(): RunSummary[] {
  if (_runs) return _runs;

  const traceFiles = loadTraceFiles();
  _runs = traceFiles
    .map((tf) => {
      const summary = extractRunSummary(tf);
      summary.modelBreakdown = extractBreakdown(tf);
      return summary;
    })
    .sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

  return _runs;
}

/** Returns one run by id, or undefined. */
export function getRun(runId: string): RunSummary | undefined {
  return getAllRuns().find((r) => r.runId === runId);
}
