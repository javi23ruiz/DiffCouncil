import type { RunSummary, Severity } from "./types";
import { getAllRuns } from "./loader";

// ---------------------------------------------------------------------------
// Per-day cost aggregation for line charts
// ---------------------------------------------------------------------------

export interface DailyCost {
  date: string; // ISO date (YYYY-MM-DD)
  cost: number;
  runs: number;
}

export function perDayCosts(runs: RunSummary[]): DailyCost[] {
  const map = new Map<string, { cost: number; runs: number }>();
  for (const r of runs) {
    const date = r.timestamp.slice(0, 10);
    const acc = map.get(date) ?? { cost: 0, runs: 0 };
    acc.cost += r.totalCostUsd;
    acc.runs += 1;
    map.set(date, acc);
  }
  return Array.from(map.entries())
    .map(([date, { cost, runs }]) => ({ date, cost, runs }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ---------------------------------------------------------------------------
// Findings per run stacked by severity (for bar chart)
// ---------------------------------------------------------------------------

export interface RunFindings {
  runId: string;
  timestamp: string;
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export function findingsByRun(runs: RunSummary[]): RunFindings[] {
  return runs.map((r) => {
    const counts: Record<Severity, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };
    for (const f of r.keptFindings) {
      counts[f.severity] = (counts[f.severity] ?? 0) + 1;
    }
    return {
      runId: r.runId,
      timestamp: r.timestamp,
      ...counts,
    };
  });
}

// ---------------------------------------------------------------------------
// Prompt SHA change detection — returns where the SHA changed between runs
// ---------------------------------------------------------------------------

export interface PromptShaChange {
  fromRunId: string;
  toRunId: string;
  fromSha: string;
  toSha: string;
  timestamp: string; // midpoint between the two runs
}

export function promptShaChanges(runs: RunSummary[]): PromptShaChange[] {
  // runs are sorted newest-first; reverse for chronological
  const chronological = [...runs].reverse();
  const changes: PromptShaChange[] = [];
  for (let i = 1; i < chronological.length; i++) {
    const prev = chronological[i - 1]!;
    const curr = chronological[i]!;
    if (prev.promptSha !== curr.promptSha) {
      changes.push({
        fromRunId: prev.runId,
        toRunId: curr.runId,
        fromSha: prev.promptSha,
        toSha: curr.promptSha,
        timestamp: curr.timestamp,
      });
    }
  }
  return changes;
}

// ---------------------------------------------------------------------------
// Specialist performance: median latency & findings per specialist
// ---------------------------------------------------------------------------

export interface SpecialistStat {
  specialistId: string;
  medianLatencyMs: number;
  avgFindingsEmitted: number;
  avgFindingsKept: number;
}

export function specialistStats(
  runs: RunSummary[],
  window: number = 20
): SpecialistStat[] {
  const recent = runs.slice(-window);

  const bySpecialist = new Map<
    string,
    {
      latencies: number[];
      emitted: number[];
      kept: number[];
    }
  >();

  for (const run of recent) {
    const specialistEnds = run.events.filter(
      (e) => e.type === "specialist_end" && e.validationResult === "ok"
    );
    for (const e of specialistEnds) {
      if (
        e.type !== "specialist_end" ||
        e.validationResult !== "ok"
      )
        continue;
      const acc = bySpecialist.get(e.specialistId) ?? {
        latencies: [],
        emitted: [],
        kept: [],
      };
      acc.latencies.push(e.latencyMs);
      acc.emitted.push(e.rawFindings.length);
      // How many of this specialist's raw findings survived synthesis?
      // We approximate: findings kept that share the same category.
      const synthEvent = run.events.find(
        (se) => se.type === "synthesizer_reasoning"
      );
      const kept =
        synthEvent?.type === "synthesizer_reasoning"
          ? synthEvent.keptFindings.filter(
              (f) => f.category === e.specialistId
            ).length
          : 0;
      acc.kept.push(kept);
      bySpecialist.set(e.specialistId, acc);
    }
  }

  return Array.from(bySpecialist.entries()).map(([id, data]) => ({
    specialistId: id,
    medianLatencyMs: median(data.latencies),
    avgFindingsEmitted: avg(data.emitted),
    avgFindingsKept: avg(data.kept),
  }));
}

// ---------------------------------------------------------------------------
// Synthesizer effectiveness over time
// ---------------------------------------------------------------------------

export interface SynthEffectiveness {
  runId: string;
  timestamp: string;
  dedupRate: number; // mergedCount / rawInputCount
  dropRate: number; // droppedCount / rawInputCount
}

export function synthEffectiveness(runs: RunSummary[]): SynthEffectiveness[] {
  return runs.map((r) => {
    const synth = r.events.find(
      (e) => e.type === "synthesizer_reasoning"
    );
    if (synth?.type !== "synthesizer_reasoning" || synth.rawInputFindingCount === 0) {
      return {
        runId: r.runId,
        timestamp: r.timestamp,
        dedupRate: 0,
        dropRate: 0,
      };
    }
    const mergedCount = synth.duplicateGroups.reduce(
      (sum, g) => sum + g.merged.length,
      0
    );
    return {
      runId: r.runId,
      timestamp: r.timestamp,
      dedupRate: mergedCount / synth.rawInputFindingCount,
      dropRate: synth.droppedFindings.length / synth.rawInputFindingCount,
    };
  });
}

// ---------------------------------------------------------------------------
// Tiny helpers
// ---------------------------------------------------------------------------

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
    : (sorted[mid] ?? 0);
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}
