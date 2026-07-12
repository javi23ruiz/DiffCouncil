import type { DroppedFinding, DuplicateGroup, Finding, SpecialistId } from "../data/types";
import { SeverityDots } from "./SeverityDots";
import { VerdictBadge } from "./VerdictBadge";

const DROP_REASON_LABELS: Record<DroppedFinding["reason"], string> = {
  low_evidence: "Low evidence",
  duplicate: "Duplicate",
  confidence_floor: "Confidence floor",
  budget: "Budget",
};

const DROP_REASON_COLORS: Record<DroppedFinding["reason"], string> = {
  low_evidence: "bg-zinc-700 text-zinc-300 border-zinc-600",
  duplicate: "bg-amber-400/10 text-amber-400 border-amber-400/30",
  confidence_floor: "bg-orange-500/10 text-orange-400 border-orange-500/30",
  budget: "bg-blue-400/10 text-blue-400 border-blue-400/30",
};

interface SynthesizerPanelProps {
  rawInputFindingCount: number;
  specialistCount: number;
  duplicateGroups: DuplicateGroup[];
  droppedFindings: DroppedFinding[];
  keptFindings: Finding[];
  verdictRationale: string;
}

function findingLine(f: Finding): string {
  return `${f.file}:${f.lineStart} · ${f.category} · ${(f.confidence * 100).toFixed(0)}% · ${f.description.slice(0, 80)}`;
}

export function SynthesizerPanel({
  rawInputFindingCount,
  specialistCount,
  duplicateGroups,
  droppedFindings,
  keptFindings,
  verdictRationale,
}: SynthesizerPanelProps) {
  return (
    <div className="space-y-6">
      {/* Header summary */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-medium text-sm">Synthesizer Decision</h3>
          {keptFindings.length > 0 ? (
            <VerdictBadge
              verdict={
                keptFindings.some((f) => f.severity === "critical")
                  ? "blocking_issues"
                  : "comments_to_address"
              }
            />
          ) : (
            <VerdictBadge verdict="looks_good" />
          )}
        </div>
        <p className="text-xs text-zinc-400 mb-3">
          Received {rawInputFindingCount} findings from {specialistCount}{" "}
          specialists. Kept {keptFindings.length}, merged{" "}
          {duplicateGroups.reduce((s, g) => s + g.merged.length, 0)}, dropped{" "}
          {droppedFindings.length}.
        </p>
        <p className="text-sm text-zinc-300 leading-relaxed">
          {verdictRationale}
        </p>
      </div>

      {/* Kept findings */}
      <div>
        <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-2">
          Kept Findings ({keptFindings.length})
        </h4>
        {keptFindings.length === 0 ? (
          <p className="text-xs text-zinc-600">No findings to show.</p>
        ) : (
          <div className="space-y-1.5">
            {keptFindings.map((f, i) => (
              <div
                key={f.id ?? i}
                className="bg-zinc-900 border border-zinc-800 rounded p-2.5 flex items-start gap-2"
              >
                <SeverityDots findings={[f]} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-mono text-zinc-500 truncate">
                    {f.file}:{f.lineStart}-{f.lineEnd}
                  </div>
                  <div className="text-xs text-zinc-300 mt-0.5 line-clamp-2">
                    {f.description}
                  </div>
                </div>
                <span className="text-[10px] text-zinc-600 tabular-nums shrink-0">
                  {(f.confidence * 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Duplicate groups */}
      {duplicateGroups.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-2">
            Duplicate Groups ({duplicateGroups.length})
          </h4>
          <div className="space-y-2">
            {duplicateGroups.map((g, i) => (
              <div
                key={i}
                className="bg-zinc-900 border border-zinc-800 rounded p-3"
              >
                <div className="text-[10px] text-zinc-500 mb-1">Representative</div>
                <code className="text-xs text-zinc-300 bg-zinc-800 px-1.5 py-0.5 rounded">
                  {g.representative}
                </code>
                <div className="text-[10px] text-zinc-500 mt-2 mb-1">
                  Merged ({g.merged.length})
                </div>
                <div className="flex flex-wrap gap-1">
                  {g.merged.map((id, j) => (
                    <code
                      key={j}
                      className="text-xs text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded"
                    >
                      {id}
                    </code>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dropped findings */}
      {droppedFindings.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-2">
            Dropped Findings ({droppedFindings.length})
          </h4>
          <div className="space-y-1">
            {droppedFindings.map((d, i) => (
              <div
                key={d.finding.id ?? i}
                className="bg-zinc-900 border border-zinc-800 rounded p-2 flex items-start justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="text-xs font-mono text-zinc-500 truncate">
                    {d.finding.file}:{d.finding.lineStart}
                  </div>
                  <div className="text-xs text-zinc-400 mt-0.5 line-clamp-1">
                    {d.finding.description.slice(0, 60)}
                  </div>
                </div>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full border shrink-0 ${
                    DROP_REASON_COLORS[d.reason] ?? ""
                  }`}
                >
                  {DROP_REASON_LABELS[d.reason]}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
