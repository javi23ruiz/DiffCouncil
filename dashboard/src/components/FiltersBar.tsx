import type { Verdict, SpecialistId } from "../data/types";

const VERDICT_OPTIONS: Verdict[] = [
  "looks_good",
  "comments_to_address",
  "blocking_issues",
];
const SPECIALIST_OPTIONS: SpecialistId[] = [
  "security",
  "correctness",
  "maintainability",
];

interface FiltersBarProps {
  verdicts: Set<Verdict>;
  setVerdicts: (s: Set<Verdict>) => void;
  specialists: Set<SpecialistId>;
  setSpecialists: (s: Set<SpecialistId>) => void;
  dateFrom: string;
  setDateFrom: (d: string) => void;
  dateTo: string;
  setDateTo: (d: string) => void;
  promptShas: string[];
  selectedSha: string;
  setSelectedSha: (s: string) => void;
}

export function FiltersBar({
  verdicts,
  setVerdicts,
  specialists,
  setSpecialists,
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
  promptShas,
  selectedSha,
  setSelectedSha,
}: FiltersBarProps) {
  function toggleVerdict(v: Verdict) {
    const next = new Set(verdicts);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    setVerdicts(next);
  }

  function toggleSpecialist(s: SpecialistId) {
    const next = new Set(specialists);
    if (next.has(s)) next.delete(s);
    else next.add(s);
    setSpecialists(next);
  }

  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      {/* Date range */}
      <div className="flex items-center gap-1">
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200"
        />
        <span className="text-zinc-500">-</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200"
        />
      </div>

      {/* Verdict multi-select */}
      <div className="flex items-center gap-1">
        <span className="text-zinc-500 text-xs mr-1">Verdict:</span>
        {VERDICT_OPTIONS.map((v) => (
          <button
            key={v}
            onClick={() => toggleVerdict(v)}
            className={`px-2 py-0.5 rounded text-xs border transition-colors ${
              verdicts.has(v)
                ? "bg-zinc-700 border-zinc-600 text-zinc-200"
                : "bg-transparent border-zinc-800 text-zinc-500 hover:border-zinc-700"
            }`}
          >
            {v.replace(/_/g, " ")}
          </button>
        ))}
      </div>

      {/* Specialist multi-select */}
      <div className="flex items-center gap-1">
        <span className="text-zinc-500 text-xs mr-1">Specialists:</span>
        {SPECIALIST_OPTIONS.map((s) => (
          <button
            key={s}
            onClick={() => toggleSpecialist(s)}
            className={`px-2 py-0.5 rounded text-xs border transition-colors ${
              specialists.has(s)
                ? "bg-zinc-700 border-zinc-600 text-zinc-200"
                : "bg-transparent border-zinc-800 text-zinc-500 hover:border-zinc-700"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Prompt SHA dropdown */}
      {promptShas.length > 1 && (
        <select
          value={selectedSha}
          onChange={(e) => setSelectedSha(e.target.value)}
          className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200"
        >
          <option value="">All prompt versions</option>
          {promptShas.map((sha) => (
            <option key={sha} value={sha}>
              {sha.slice(0, 7)}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
