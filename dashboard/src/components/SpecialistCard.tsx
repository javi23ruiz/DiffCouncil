import { useState } from "react";
import type { Finding, SpecialistId } from "../data/types";
import { SeverityDots } from "./SeverityDots";
import { PromptShaLink } from "./PromptShaLink";

interface SpecialistCardProps {
  specialistId: SpecialistId;
  model: string;
  promptSha: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  costUsd: number;
  rawFindings: Finding[];
  validationResult: "ok" | "failed";
  validationErrors?: string[];
  repo?: string;
}

const SPECIALIST_LABELS: Record<SpecialistId, string> = {
  security: "Security",
  correctness: "Correctness",
  maintainability: "Maintainability",
};

export function SpecialistCard({
  specialistId,
  model,
  promptSha,
  inputTokens,
  outputTokens,
  latencyMs,
  costUsd,
  rawFindings,
  validationResult,
  validationErrors,
  repo,
}: SpecialistCardProps) {
  const [showRaw, setShowRaw] = useState(false);
  const failed = validationResult === "failed";

  return (
    <div
      className={`bg-zinc-900 border rounded-lg p-4 ${
        failed ? "border-red-500/30" : "border-zinc-800"
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium text-sm capitalize">
          {SPECIALIST_LABELS[specialistId]}
        </h3>
        {failed ? (
          <span className="text-xs text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/30">
            Failed
          </span>
        ) : (
          <span className="text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/30">
            OK
          </span>
        )}
      </div>

      <div className="space-y-1.5 text-xs text-zinc-400">
        <div className="flex justify-between">
          <span>Model</span>
          <code className="text-zinc-300">{model}</code>
        </div>
        <div className="flex justify-between">
          <span>Prompt SHA</span>
          <PromptShaLink sha={promptSha} repo={repo} />
        </div>
        <div className="flex justify-between">
          <span>Tokens</span>
          <span className="text-zinc-300 tabular-nums">
            {inputTokens.toLocaleString()} in / {outputTokens.toLocaleString()} out
          </span>
        </div>
        <div className="flex justify-between">
          <span>Latency</span>
          <span className="text-zinc-300 tabular-nums">
            {(latencyMs / 1000).toFixed(1)}s
          </span>
        </div>
        <div className="flex justify-between">
          <span>Cost</span>
          <span className="text-zinc-300 tabular-nums">
            ${costUsd.toFixed(4)}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span>Findings</span>
          <SeverityDots findings={rawFindings} />
        </div>
      </div>

      {failed && validationErrors && validationErrors.length > 0 && (
        <div className="mt-3 bg-red-500/5 border border-red-500/20 rounded p-2 text-xs text-red-400">
          {validationErrors.map((err, i) => (
            <div key={i} className="font-mono">{err}</div>
          ))}
        </div>
      )}

      {rawFindings.length > 0 && (
        <div className="mt-3">
          <button
            onClick={() => setShowRaw(!showRaw)}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            {showRaw ? "Hide" : "Show"} raw findings JSON ({rawFindings.length})
          </button>
          {showRaw && (
            <pre className="mt-2 p-2 bg-zinc-950 rounded text-xs text-zinc-400 overflow-x-auto max-h-48 overflow-y-auto">
              {JSON.stringify(rawFindings, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
