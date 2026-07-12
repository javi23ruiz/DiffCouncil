import type { Verdict } from "../data/types";

const STYLES: Record<Verdict, { bg: string; text: string; label: string }> = {
  looks_good: {
    bg: "bg-emerald-500/10 border-emerald-500/30",
    text: "text-emerald-400",
    label: "Looks good",
  },
  comments_to_address: {
    bg: "bg-amber-400/10 border-amber-400/30",
    text: "text-amber-400",
    label: "Comments",
  },
  blocking_issues: {
    bg: "bg-red-500/10 border-red-500/30",
    text: "text-red-400",
    label: "Blocking",
  },
};

interface VerdictBadgeProps {
  verdict: Verdict;
}

export function VerdictBadge({ verdict }: VerdictBadgeProps) {
  const s = STYLES[verdict];
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${s.bg} ${s.text}`}
    >
      {s.label}
    </span>
  );
}
