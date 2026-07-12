import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { SpecialistStat } from "../../data/derive";

interface SpecialistLatencyProps {
  data: SpecialistStat[];
}

export function SpecialistLatency({ data }: SpecialistLatencyProps) {
  if (data.length === 0) {
    return (
      <div className="text-center py-8 text-zinc-500 text-sm">
        No data yet.
      </div>
    );
  }

  const chartData = data.map((d) => ({
    name: d.specialistId,
    "Median latency (s)": +(d.medianLatencyMs / 1000).toFixed(1),
    "Avg findings emitted": d.avgFindingsEmitted,
    "Avg findings kept": d.avgFindingsKept,
  }));

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Latency chart */}
      <div>
        <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-2">
          Median Latency
        </h4>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 10, fill: "#71717a" }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "#71717a" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => `${v}s`}
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
            <Bar
              dataKey="Median latency (s)"
              fill="#a855f7"
              radius={[3, 3, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Findings emitted vs kept */}
      <div>
        <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-2">
          Findings: Emitted vs Kept
        </h4>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 10, fill: "#71717a" }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
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
              wrapperStyle={{ fontSize: 10, color: "#a1a1aa" }}
              iconType="circle"
            />
            <Bar
              dataKey="Avg findings emitted"
              fill="#3b82f6"
              radius={[3, 3, 0, 0]}
              name="Emitted"
            />
            <Bar
              dataKey="Avg findings kept"
              fill="#22c55e"
              radius={[3, 3, 0, 0]}
              name="Kept"
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
