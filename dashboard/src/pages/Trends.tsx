import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from "recharts";
import { getAllRuns } from "../data/loader";
import {
  perDayCosts,
  findingsByRun,
  promptShaChanges,
  specialistStats,
  synthEffectiveness,
} from "../data/derive";
import { CostOverTime } from "../components/charts/CostOverTime";
import { FindingsStacked } from "../components/charts/FindingsStacked";
import { SpecialistLatency } from "../components/charts/SpecialistLatency";

export function Trends() {
  const runs = useMemo(() => getAllRuns(), []);

  const dailyCosts = useMemo(() => perDayCosts(runs), [runs]);
  const findingsData = useMemo(() => findingsByRun(runs), [runs]);
  const shaChanges = useMemo(() => promptShaChanges(runs), [runs]);
  const specStats = useMemo(() => specialistStats(runs), [runs]);
  const effectiveness = useMemo(() => synthEffectiveness(runs), [runs]);

  if (runs.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center">
        <h2 className="text-xl font-semibold mb-2">No data yet</h2>
        <p className="text-zinc-500">
          Run Sentinel on a few PRs to populate the trends.
        </p>
      </div>
    );
  }

  // Build a combined chart for findings vs cost on synced x-axis
  const combinedData = runs.map((r) => ({
    runId: r.runId,
    label: new Date(r.timestamp).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    }),
    cost: r.totalCostUsd,
    findings: r.findingCount,
    timestamp: r.timestamp,
  })).reverse();

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-8">
      {/* Cost per run over time */}
      <div>
        <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-3">
          Cost Over Time
        </h3>
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <CostOverTime data={dailyCosts} />
        </div>
      </div>

      {/* Findings per run stacked by severity */}
      <div>
        <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-3">
          Findings Per Run
        </h3>
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <FindingsStacked data={findingsData} />
        </div>
      </div>

      {/* Prompt version overlay — shown on the combined chart */}
      {shaChanges.length > 0 && (
        <div>
          <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-3">
            Prompt Version Changes
          </h3>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={combinedData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "#71717a" }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 10, fill: "#71717a" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => `$${v.toFixed(2)}`}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 10, fill: "#71717a" }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "#18181b",
                    border: "1px solid #3f3f46",
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: "#a1a1aa" }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11, color: "#a1a1aa" }}
                  iconType="circle"
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="cost"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ r: 2, fill: "#3b82f6" }}
                  name="Cost"
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="findings"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={{ r: 2, fill: "#f59e0b" }}
                  name="Findings"
                />
                {/* Vertical reference lines for SHA changes */}
                {shaChanges.map((change, i) => (
                  <ReferenceLine
                    key={i}
                    x={new Date(change.timestamp).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                    stroke="#a855f7"
                    strokeDasharray="4 4"
                    strokeWidth={1}
                    label={{
                      value: `${change.fromSha.slice(0, 7)}→${change.toSha.slice(0, 7)}`,
                      position: "top",
                      fontSize: 9,
                      fill: "#a855f7",
                    }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
            <div className="mt-3 space-y-1">
              {shaChanges.map((change, i) => (
                <div key={i} className="text-xs text-zinc-500">
                  <a
                    href={`https://github.com/search?q=${change.fromSha}&type=commits`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 font-mono"
                  >
                    {change.fromSha.slice(0, 7)}
                  </a>
                  {" → "}
                  <a
                    href={`https://github.com/search?q=${change.toSha}&type=commits`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 font-mono"
                  >
                    {change.toSha.slice(0, 7)}
                  </a>
                  {" at "}
                  {new Date(change.timestamp).toLocaleDateString()}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Specialist performance */}
      <div>
        <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-3">
          Specialist Performance
        </h3>
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <SpecialistLatency data={specStats} />
        </div>
      </div>

      {/* Synthesizer effectiveness */}
      <div>
        <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-3">
          Synthesizer Effectiveness
        </h3>
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          {effectiveness.length === 0 ? (
            <p className="text-sm text-zinc-500 py-4 text-center">No data yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart
                data={effectiveness.map((e) => ({
                  ...e,
                  label: new Date(e.timestamp).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  }),
                }))}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "#71717a" }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "#71717a" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
                />
                <Tooltip
                  contentStyle={{
                    background: "#18181b",
                    border: "1px solid #3f3f46",
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: "#a1a1aa" }}
                  formatter={(value: number) => `${(value * 100).toFixed(1)}%`}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11, color: "#a1a1aa" }}
                  iconType="circle"
                />
                <Line
                  type="monotone"
                  dataKey="dedupRate"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ r: 2, fill: "#3b82f6" }}
                  name="Dedup rate"
                />
                <Line
                  type="monotone"
                  dataKey="dropRate"
                  stroke="#ef4444"
                  strokeWidth={2}
                  dot={{ r: 2, fill: "#ef4444" }}
                  name="Drop rate"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
