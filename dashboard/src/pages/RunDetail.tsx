import { useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { getRun } from "../data/loader";
import { Timeline } from "../components/Timeline";
import { SpecialistCard } from "../components/SpecialistCard";
import { SynthesizerPanel } from "../components/SynthesizerPanel";
import { VerdictBadge } from "../components/VerdictBadge";
import { PromptShaLink } from "../components/PromptShaLink";
import type { SpecialistId } from "../data/types";

export function RunDetail() {
  const { runId } = useParams<{ runId: string }>();
  const run = useMemo(() => (runId ? getRun(runId) : undefined), [runId]);
  const [showJson, setShowJson] = useState(false);

  if (!run) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center">
        <h2 className="text-xl font-semibold mb-2">Run not found</h2>
        <p className="text-zinc-500">
          Run <code className="text-zinc-400">{runId}</code> was not found in
          the build-time trace index.
        </p>
        <Link
          to="/"
          className="inline-block mt-4 text-sm text-blue-400 hover:text-blue-300"
        >
          ← Back to overview
        </Link>
      </div>
    );
  }

  const specialistEnds = run.events.filter(
    (e) => e.type === "specialist_end"
  );
  const specialistStarts = run.events.filter(
    (e) => e.type === "specialist_start"
  );
  const synthEvent = run.events.find(
    (e) => e.type === "synthesizer_reasoning"
  );

  // Build cost by model from breakdown
  const costByModel =
    run.modelBreakdown && run.modelBreakdown.length > 0
      ? run.modelBreakdown
      : [];

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Back link */}
      <Link
        to="/"
        className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        ← Overview
      </Link>

      {/* Header card */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">
              <a
                href={`https://github.com/${run.repo}/pull/${run.prNumber}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300"
              >
                {run.repo}#{run.prNumber}
              </a>
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-zinc-400">
              <span>
                {new Date(run.timestamp).toLocaleString()}
              </span>
              <VerdictBadge verdict={run.verdict} />
              <span className="tabular-nums">
                ${run.totalCostUsd.toFixed(2)}
              </span>
              <span className="tabular-nums">
                {(run.totalMs / 1000).toFixed(1)}s
              </span>
              <span className="inline-flex items-center gap-1">
                Prompt: <PromptShaLink sha={run.promptSha} repo={run.repo} />
              </span>
            </div>
          </div>

          {/* Model breakdown pills */}
          {costByModel.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {costByModel.map((m) => (
                <span
                  key={m.model}
                  className="inline-flex items-center gap-1.5 px-2 py-1 bg-zinc-800 rounded text-xs"
                >
                  <span className="text-zinc-300 font-mono text-[11px]">
                    {m.model}
                  </span>
                  <span className="text-zinc-500 tabular-nums">
                    ${m.costUsd.toFixed(4)}
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Timeline waterfall */}
      <div>
        <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-3">
          Timeline
        </h3>
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <Timeline events={run.events} />
        </div>
      </div>

      {/* Specialist cards */}
      <div>
        <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-3">
          Specialists
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {(["security", "correctness", "maintainability"] as SpecialistId[]).map(
            (specId) => {
              const end = specialistEnds.find(
                (e) => e.type === "specialist_end" && e.specialistId === specId
              );
              const start = specialistStarts.find(
                (e) => e.type === "specialist_start" && e.specialistId === specId
              );

              if (!end) {
                return (
                  <div
                    key={specId}
                    className="bg-zinc-900 border border-zinc-800 rounded-lg p-4"
                  >
                    <h4 className="font-medium text-sm capitalize mb-2 text-zinc-500">
                      {specId}
                    </h4>
                    <p className="text-xs text-zinc-600">
                      Did not run.
                    </p>
                  </div>
                );
              }

              // Calculate cost for this specialist
              let specCost = 0;
              const breakdown = costByModel.find((b) => b.model === run.model);
              if (breakdown && breakdown.inputTokens > 0) {
                // Approximate proportion based on token share
                const pct =
                  end.inputTokens > 0
                    ? end.inputTokens / breakdown.inputTokens
                    : 0;
                specCost = Math.min(breakdown.costUsd * pct, breakdown.costUsd);
              }

              return (
                <SpecialistCard
                  key={specId}
                  specialistId={specId}
                  model={run.model}
                  promptSha={
                    start?.type === "specialist_start"
                      ? start.promptSha
                      : "unknown"
                  }
                  inputTokens={end.inputTokens}
                  outputTokens={end.outputTokens}
                  latencyMs={end.latencyMs}
                  costUsd={specCost}
                  rawFindings={end.rawFindings ?? []}
                  validationResult={end.validationResult}
                  validationErrors={end.validationErrors}
                  repo={run.repo}
                />
              );
            }
          )}
        </div>
      </div>

      {/* Synthesizer decision panel */}
      {synthEvent?.type === "synthesizer_reasoning" && (
        <div>
          <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-3">
            Synthesizer Decision
          </h3>
          <SynthesizerPanel
            rawInputFindingCount={synthEvent.rawInputFindingCount}
            specialistCount={
              specialistEnds.filter(
                (e) =>
                  e.type === "specialist_end" &&
                  e.validationResult === "ok"
              ).length
            }
            duplicateGroups={synthEvent.duplicateGroups}
            droppedFindings={synthEvent.droppedFindings}
            keptFindings={synthEvent.keptFindings}
            verdictRationale={synthEvent.verdictRationale}
          />
        </div>
      )}

      {/* Cost breakdown pie — simplified to textual breakdown since PieChart needs Recharts */}
      {costByModel.length > 0 && (
        <div>
          <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-3">
            Cost Breakdown
          </h3>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
            <div className="space-y-2">
              {costByModel.map((m) => (
                <div
                  key={m.model}
                  className="flex items-center justify-between text-sm"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-300 font-mono text-xs">
                      {m.model}
                    </span>
                    <span className="text-zinc-500 text-xs tabular-nums">
                      {m.inputTokens.toLocaleString()} in / {m.outputTokens.toLocaleString()} out
                    </span>
                  </div>
                  <span className="text-zinc-300 text-xs tabular-nums">
                    ${m.costUsd.toFixed(4)}
                  </span>
                </div>
              ))}
              <div className="border-t border-zinc-800 pt-2 flex justify-between text-sm">
                <span className="text-zinc-400">Total</span>
                <span className="text-zinc-200 tabular-nums">
                  ${run.totalCostUsd.toFixed(4)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Full JSON viewer */}
      <div>
        <button
          onClick={() => setShowJson(!showJson)}
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          {showJson ? "Hide" : "Show"} full trace JSON
        </button>
        {showJson && (
          <pre className="mt-2 p-4 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-400 overflow-x-auto max-h-96 overflow-y-auto">
            {JSON.stringify(run.events, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}
