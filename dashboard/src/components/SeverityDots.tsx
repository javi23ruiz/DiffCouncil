import type { Severity } from "../data/types";

const COLORS: Record<Severity, string> = {
  critical: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-amber-400",
  low: "bg-blue-400",
};

interface SeverityDotsProps {
  findings: { severity: Severity }[];
}

export function SeverityDots({ findings }: SeverityDotsProps) {
  const counts: Record<Severity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };
  for (const f of findings) {
    counts[f.severity] = (counts[f.severity] ?? 0) + 1;
  }
  if (findings.length === 0) {
    return <span className="text-zinc-600 text-xs">none</span>;
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      {(["critical", "high", "medium", "low"] as Severity[]).map((sev) => {
        const c = counts[sev] ?? 0;
        if (c === 0) return null;
        return (
          <span key={sev} className="inline-flex items-center gap-1 text-xs">
            <span className={`w-2.5 h-2.5 rounded-full ${COLORS[sev]}`} />
            {c}
          </span>
        );
      })}
    </span>
  );
}
