import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { RunSummary, Verdict, SpecialistId } from "../data/types";
import { SeverityDots } from "./SeverityDots";
import { VerdictBadge } from "./VerdictBadge";
import { PromptShaLink } from "./PromptShaLink";

const SPECIALIST_COLORS: Record<SpecialistId, string> = {
  security: "bg-red-500/60",
  correctness: "bg-blue-400/60",
  maintainability: "bg-amber-400/60",
};

interface RunTableProps {
  runs: RunSummary[];
}

type SortKey = "timestamp" | "totalCostUsd" | "totalMs" | "findingCount";
type SortDir = "asc" | "desc";

export function RunTable({ runs }: RunTableProps) {
  const navigate = useNavigate();
  const [sortKey, setSortKey] = useState<SortKey>("timestamp");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(0);
  const perPage = 20;

  const sorted = useMemo(() => {
    const copy = [...runs];
    copy.sort((a, b) => {
      const mul = sortDir === "desc" ? -1 : 1;
      if (sortKey === "timestamp") {
        return (
          mul *
          (new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
        );
      }
      return mul * (a[sortKey] - b[sortKey]);
    });
    return copy;
  }, [runs, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / perPage));
  const slice = sorted.slice(page * perPage, (page + 1) * perPage);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
    setPage(0);
  }

  const sortArrow = (key: SortKey) =>
    sortKey === key ? (sortDir === "desc" ? " ↓" : " ↑") : "";

  if (runs.length === 0) {
    return (
      <div className="text-center py-12 text-zinc-500">
        No runs yet — open a PR to trigger Sentinel.
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-left text-zinc-400">
              <th
                className="py-2 px-3 cursor-pointer hover:text-zinc-200 select-none"
                onClick={() => toggleSort("timestamp")}
              >
                Timestamp{sortArrow("timestamp")}
              </th>
              <th className="py-2 px-3">PR</th>
              <th className="py-2 px-3">Verdict</th>
              <th
                className="py-2 px-3 cursor-pointer hover:text-zinc-200 select-none"
                onClick={() => toggleSort("findingCount")}
              >
                Findings{sortArrow("findingCount")}
              </th>
              <th
                className="py-2 px-3 cursor-pointer hover:text-zinc-200 select-none"
                onClick={() => toggleSort("totalCostUsd")}
              >
                Cost{sortArrow("totalCostUsd")}
              </th>
              <th
                className="py-2 px-3 cursor-pointer hover:text-zinc-200 select-none"
                onClick={() => toggleSort("totalMs")}
              >
                Duration{sortArrow("totalMs")}
              </th>
              <th className="py-2 px-3">Specialists</th>
              <th className="py-2 px-3">Prompt SHA</th>
            </tr>
          </thead>
          <tbody>
            {slice.map((r) => (
              <tr
                key={r.runId}
                className="border-b border-zinc-800/50 hover:bg-zinc-900 cursor-pointer transition-colors"
                onClick={() => navigate(`/run/${r.runId}`)}
              >
                <td className="py-2 px-3 text-zinc-400 font-mono text-xs whitespace-nowrap">
                  {new Date(r.timestamp).toLocaleString()}
                </td>
                <td className="py-2 px-3">
                  <a
                    href={`https://github.com/${r.repo}/pull/${r.prNumber}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300"
                    onClick={(e) => e.stopPropagation()}
                  >
                    #{r.prNumber}
                  </a>
                </td>
                <td className="py-2 px-3">
                  <VerdictBadge verdict={r.verdict} />
                </td>
                <td className="py-2 px-3">
                  <SeverityDots findings={r.keptFindings} />
                </td>
                <td className="py-2 px-3 font-mono text-xs text-zinc-300">
                  ${r.totalCostUsd.toFixed(2)}
                </td>
                <td className="py-2 px-3 font-mono text-xs text-zinc-400">
                  {(r.totalMs / 1000).toFixed(1)}s
                </td>
                <td className="py-2 px-3">
                  <span className="inline-flex items-center gap-1">
                    {r.specialists.map((s) => (
                      <span
                        key={s.id}
                        className={`w-2.5 h-2.5 rounded-full ${
                          s.succeeded
                            ? (SPECIALIST_COLORS[s.id] ?? "bg-zinc-600")
                            : "bg-zinc-700 border border-red-500/50"
                        }`}
                        title={`${s.id}: ${s.succeeded ? "ok" : "failed"}`}
                      />
                    ))}
                  </span>
                </td>
                <td className="py-2 px-3">
                  <PromptShaLink sha={r.promptSha} repo={r.repo} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 px-3 text-sm text-zinc-400">
          <span>
            {(page * perPage + 1).toLocaleString()}-
            {Math.min((page + 1) * perPage, sorted.length).toLocaleString()} of{" "}
            {sorted.length.toLocaleString()}
          </span>
          <div className="flex gap-1">
            <button
              className="px-3 py-1 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 transition-colors"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              Prev
            </button>
            <button
              className="px-3 py-1 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 transition-colors"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
