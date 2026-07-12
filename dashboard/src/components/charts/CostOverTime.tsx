import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { DailyCost } from "../../data/derive";

interface CostOverTimeProps {
  data: DailyCost[];
}

export function CostOverTime({ data }: CostOverTimeProps) {
  if (data.length === 0) {
    return (
      <div className="text-center py-8 text-zinc-500 text-sm">
        No data yet.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10, fill: "#71717a" }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 10, fill: "#71717a" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => `$${v.toFixed(2)}`}
        />
        <Tooltip
          contentStyle={{
            background: "#18181b",
            border: "1px solid #3f3f46",
            borderRadius: 6,
            fontSize: 12,
          }}
          labelStyle={{ color: "#a1a1aa" }}
          formatter={(value: number) => [`$${value.toFixed(4)}`, "Cost"]}
        />
        <Line
          type="monotone"
          dataKey="cost"
          stroke="#3b82f6"
          strokeWidth={2}
          dot={{ r: 3, fill: "#3b82f6" }}
          activeDot={{ r: 5, fill: "#3b82f6" }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
