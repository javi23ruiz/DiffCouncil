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
import type { RunFindings } from "../../data/derive";

interface FindingsStackedProps {
  data: RunFindings[];
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#f59e0b",
  low: "#3b82f6",
};

export function FindingsStacked({ data }: FindingsStackedProps) {
  if (data.length === 0) {
    return (
      <div className="text-center py-8 text-zinc-500 text-sm">
        No data yet.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
        <XAxis
          dataKey="timestamp"
          tick={{ fontSize: 10, fill: "#71717a" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: string) =>
            new Date(v).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })
          }
          interval="preserveStartEnd"
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
          wrapperStyle={{ fontSize: 11, color: "#a1a1aa" }}
          iconType="circle"
        />
        <Bar
          dataKey="critical"
          stackId="a"
          fill={SEVERITY_COLORS["critical"]}
          name="Critical"
        />
        <Bar
          dataKey="high"
          stackId="a"
          fill={SEVERITY_COLORS["high"]}
          name="High"
        />
        <Bar
          dataKey="medium"
          stackId="a"
          fill={SEVERITY_COLORS["medium"]}
          name="Medium"
        />
        <Bar
          dataKey="low"
          stackId="a"
          fill={SEVERITY_COLORS["low"]}
          name="Low"
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
