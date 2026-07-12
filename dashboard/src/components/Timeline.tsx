import { useMemo } from "react";
import type { TraceEvent, SpecialistId } from "../data/types";

const STAGE_COLORS: Record<string, string> = {
  fetch: "#52525b",
  context: "#71717a",
  security: "#ef4444",
  correctness: "#3b82f6",
  maintainability: "#f59e0b",
  synthesizer: "#a855f7",
  comment: "#22c55e",
};

interface Stage {
  type: string;
  label: string;
  lane: number;
  startMs: number;
  endMs: number;
  color: string;
  tooltip: string;
  specialistId?: SpecialistId;
  failed?: boolean;
}

interface TimelineProps {
  events: TraceEvent[];
}

export function Timeline({ events }: TimelineProps) {
  const { stages, totalMs, lanes } = useMemo(() => {
    const runStart = events.find((e) => e.type === "run_start");
    const runEnd = events.find((e) => e.type === "run_end");
    if (!runStart || runStart.type !== "run_start") {
      return { stages: [], totalMs: 1, lanes: [] };
    }

    const startTs = new Date(runStart.timestamp).getTime();
    const totalMs =
      runEnd?.type === "run_end"
        ? runEnd.ms
        : 1000;

    const stages: Stage[] = [];

    // Fetch + context lane (lane 0)
    const contextEvent = events.find(
      (e) => e.type === "context_construction"
    );
    if (contextEvent && contextEvent.type === "context_construction") {
      // Estimate: from 0ms to some early point
      stages.push({
        type: "context",
        label: "Context",
        lane: 0,
        startMs: 0,
        endMs: Math.min(totalMs * 0.05, 500),
        color: STAGE_COLORS["context"]!,
        tooltip: `${contextEvent.diffFiles.length} files · ${contextEvent.finalDiffTokens} tokens · ${contextEvent.diffLineCount} lines`,
      });
    }

    // Specialists (lanes 1..3)
    const specStarts = events.filter(
      (e): e is Extract<TraceEvent, { type: "specialist_start" }> =>
        e.type === "specialist_start"
    );
    const specEnds = events.filter(
      (e): e is Extract<TraceEvent, { type: "specialist_end" }> =>
        e.type === "specialist_end"
    );

    const laneMap: Record<SpecialistId, number> = {
      security: 1,
      correctness: 2,
      maintainability: 3,
    };

    for (const start of specStarts) {
      const end = specEnds.find(
        (e) => e.specialistId === start.specialistId
      );
      const startMs = new Date(start.startedAt).getTime() - startTs;
      const endMs = end
        ? new Date(end.endedAt).getTime() - startTs
        : startMs + 100;
      const failed = end?.validationResult === "failed";

      stages.push({
        type: start.specialistId,
        label: start.specialistId,
        lane: laneMap[start.specialistId] ?? 1,
        startMs: Math.max(0, startMs),
        endMs: Math.max(startMs + 1, endMs),
        color: failed ? "#71717a" : (STAGE_COLORS[start.specialistId] ?? "#52525b"),
        tooltip: end
          ? `${start.specialistId}: ${(endMs - startMs).toFixed(0)}ms · ${end.inputTokens}+${end.outputTokens} tokens · ${end.rawFindings.length} findings${failed ? " · FAILED" : ""}`
          : `${start.specialistId}: timed out`,
        specialistId: start.specialistId,
        failed,
      });
    }

    // Synthesizer (lane 4)
    const synth = events.find(
      (e) => e.type === "synthesizer_reasoning"
    );
    if (synth?.type === "synthesizer_reasoning") {
      // Estimate start: after the latest specialist end
      const latestSpecEnd = Math.max(
        ...specEnds.map(
          (e) => new Date(e.endedAt).getTime() - startTs
        ),
        0
      );
      const startMs = Math.max(latestSpecEnd, 0);
      stages.push({
        type: "synthesizer",
        label: "Synthesizer",
        lane: 4,
        startMs,
        endMs: startMs + synth.latencyMs,
        color: STAGE_COLORS["synthesizer"]!,
        tooltip: `Synthesizer: ${synth.latencyMs}ms · ${synth.inputTokens}+${synth.outputTokens} tokens`,
      });
    }

    // Comment (lane 4, after synthesizer)
    const comment = events.find((e) => e.type === "comment");
    if (comment?.type === "comment") {
      const synthStage = stages.find((s) => s.type === "synthesizer");
      const startMs = synthStage ? synthStage.endMs + 50 : totalMs * 0.9;
      stages.push({
        type: "comment",
        label: "Comment",
        lane: 4,
        startMs,
        endMs: startMs + 200,
        color: STAGE_COLORS["comment"]!,
        tooltip: `Comment ${comment.action} #${comment.commentId}`,
      });
    }

    const lanes = [
      { id: "context", label: "Context" },
      { id: "security", label: "Security" },
      { id: "correctness", label: "Correctness" },
      { id: "maintainability", label: "Maintainability" },
      { id: "synth", label: "Synthesis" },
    ];

    return { stages, totalMs, lanes };
  }, [events]);

  const W = 900;
  const H = 240;
  const MARGIN = { left: 100, right: 30, top: 10, bottom: 30 };
  const chartW = W - MARGIN.left - MARGIN.right;
  const laneH = 36;
  const radius = 4;

  const tickCount = 6;
  const ticks = Array.from({ length: tickCount }, (_, i) => {
    const ms = (totalMs / (tickCount - 1)) * i;
    const x = MARGIN.left + (ms / totalMs) * chartW;
    return { ms, x };
  });

  if (stages.length === 0) {
    return (
      <div className="text-center py-8 text-zinc-500 text-sm">
        No timeline data available for this run.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ minWidth: 600 }}
      >
        {/* Lane labels and backgrounds */}
        {lanes.map((lane, i) => {
          const y = MARGIN.top + i * laneH;
          return (
            <g key={lane.id}>
              <rect
                x={MARGIN.left}
                y={y}
                width={chartW}
                height={laneH - 2}
                fill={i % 2 === 0 ? "transparent" : "#18181b22"}
                rx={2}
              />
              <text
                x={MARGIN.left - 8}
                y={y + laneH / 2 + 1}
                textAnchor="end"
                className="fill-zinc-500 text-[10px]"
              >
                {lane.label}
              </text>
            </g>
          );
        })}

        {/* Grid lines at tick positions */}
        {ticks.map((t) => (
          <line
            key={t.ms}
            x1={t.x}
            y1={MARGIN.top}
            x2={t.x}
            y2={H - MARGIN.bottom}
            stroke="#27272a"
            strokeWidth={0.5}
          />
        ))}

        {/* X-axis ticks */}
        {ticks.map((t) => (
          <text
            key={`tick-${t.ms}`}
            x={t.x}
            y={H - 6}
            textAnchor="middle"
            className="fill-zinc-500 text-[9px]"
          >
            {t.ms >= 1000 ? `${(t.ms / 1000).toFixed(1)}s` : `${t.ms.toFixed(0)}ms`}
          </text>
        ))}

        {/* Stage bars */}
        {stages.map((stage, i) => {
          const x = MARGIN.left + (stage.startMs / totalMs) * chartW;
          const w = Math.max(
            radius * 2 + 2,
            ((stage.endMs - stage.startMs) / totalMs) * chartW
          );
          const laneIdx = lanes.findIndex(
            (l) =>
              l.id === stage.type ||
              (stage.type === "comment" && l.id === "synth") ||
              (stage.type === "synthesizer" && l.id === "synth")
          );
          const y = MARGIN.top + (laneIdx >= 0 ? laneIdx : 0) * laneH + laneH / 2;
          const barH = 14;

          return (
            <g key={`${stage.type}-${i}`}>
              {/* Bar */}
              <rect
                x={x}
                y={y - barH / 2}
                width={w}
                height={barH}
                rx={radius}
                fill={stage.color}
                opacity={stage.failed ? 0.3 : 0.85}
                stroke={stage.failed ? "#ef4444" : "none"}
                strokeWidth={stage.failed ? 1.5 : 0}
              >
                <title>{stage.tooltip}</title>
              </rect>
              {/* Label */}
              {w > 40 && (
                <text
                  x={x + 6}
                  y={y + 1}
                  className="fill-white text-[9px] font-medium"
                >
                  {stage.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
