import { useMemo, useState } from "react";
import { getAllRuns } from "../data/loader";
import type { Verdict, SpecialistId } from "../data/types";
import { KpiTile } from "../components/KpiTile";
import { RunTable } from "../components/RunTable";
import { FiltersBar } from "../components/FiltersBar";

export function Overview() {
  const allRuns = useMemo(() => getAllRuns(), []);

  const [verdicts, setVerdicts] = useState<Set<Verdict>>(
    new Set(["looks_good", "comments_to_address", "blocking_issues"])
  );
  const [specialists, setSpecialists] = useState<Set<SpecialistId>>(
    new Set(["security", "correctness", "maintainability"])
  );
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedSha, setSelectedSha] = useState("");

  const promptShas = useMemo(() => {
    const set = new Set<string>();
    for (const r of allRuns) {
      if (r.promptSha && r.promptSha !== "mock" && r.promptSha !== "unknown") {
        set.add(r.promptSha);
      }
    }
    return Array.from(set).sort();
  }, [allRuns]);

  const filtered = useMemo(() => {
    return allRuns.filter((r) => {
      if (!verdicts.has(r.verdict)) return false;
      if (selectedSha && r.promptSha !== selectedSha) return false;
      if (dateFrom && r.timestamp < dateFrom) return false;
      if (dateTo && r.timestamp > dateTo + "T23:59:59") return false;
      const hasSpecialist = r.specialists.some(
        (s) => s.succeeded && specialists.has(s.id)
      );
      if (!hasSpecialist) return false;
      return true;
    });
  }, [allRuns, verdicts, specialists, dateFrom, dateTo, selectedSha]);

  // KPIs
  const totalCost = filtered.reduce((s, r) => s + r.totalCostUsd, 0);
  const medianFindings = median(
    filtered.map((r) => r.findingCount).filter((n) => n > 0)
  );
  const medianDuration = median(
    filtered.map((r) => r.totalMs).filter((n) => n > 0)
  );

  if (allRuns.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center">
        <div className="text-6xl mb-4">🔍</div>
        <h2 className="text-xl font-semibold mb-2">No runs yet</h2>
        <p className="text-zinc-500 max-w-md mx-auto">
          Open a PR to trigger Sentinel.
          Once a review completes, a trace file will appear here at build time.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile
          label="Total Runs"
          value={filtered.length.toLocaleString()}
          sub={`${allRuns.length.toLocaleString()} total`}
        />
        <KpiTile
          label="Total Cost"
          value={`$${totalCost.toFixed(2)}`}
        />
        <KpiTile
          label="Median Findings"
          value={medianFindings.toFixed(0)}
          sub="per run"
        />
        <KpiTile
          label="Median Duration"
          value={`${(medianDuration / 1000).toFixed(1)}s`}
          sub="per run"
        />
      </div>

      {/* Filters */}
      <FiltersBar
        verdicts={verdicts}
        setVerdicts={setVerdicts}
        specialists={specialists}
        setSpecialists={setSpecialists}
        dateFrom={dateFrom}
        setDateFrom={setDateFrom}
        dateTo={dateTo}
        setDateTo={setDateTo}
        promptShas={promptShas}
        selectedSha={selectedSha}
        setSelectedSha={setSelectedSha}
      />

      {/* Runs table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
        <RunTable runs={filtered} />
      </div>
    </div>
  );
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
    : (sorted[mid] ?? 0);
}
