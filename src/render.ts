import type { Finding, ReviewResponse } from "./schema.js";

export interface RenderContext {
  owner: string;
  repo: string;
  headSha: string;
}

export interface RenderStats {
  /** Number of specialists whose findings fed the synthesizer. */
  specialistCount: number;
  /** Total raw findings across all specialists, before synthesis. */
  rawFindingCount: number;
  /** Findings remaining after the synthesizer merged and dropped. */
  synthesizedCount: number;
}

type Severity = Finding["severity"];

/** Severity ordering for both the count line and finding sort (most severe first). */
const SEVERITY_ORDER: readonly Severity[] = [
  "critical",
  "high",
  "medium",
  "low",
];

/** Emoji shown next to each severity in the count line. */
const SEVERITY_EMOJI: Record<Severity, string> = {
  critical: "🔴",
  high: "🟠",
  medium: "🟡",
  low: "🔵",
};

/** shields.io badge colour per severity. */
const SEVERITY_BADGE_COLOR: Record<Severity, string> = {
  critical: "red",
  high: "orange",
  medium: "yellow",
  low: "blue",
};

/** Human-readable verdict labels with their emoji. */
const VERDICT_LABEL: Record<ReviewResponse["verdict"], string> = {
  looks_good: "✅ Looks good",
  comments_to_address: "💬 Comments to address",
  blocking_issues: "⚠️ Blocking issues",
};

const FOOTER =
  "*Reviewed diff only — no cross-file context yet (see [ROADMAP](./ROADMAP.md)).*";

/**
 * Sorts findings by severity (critical first), then by confidence (highest
 * first) within each severity. Returns a new array; the input is not mutated.
 */
function sortFindings(findings: readonly Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    const severityDelta =
      SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity);
    if (severityDelta !== 0) {
      return severityDelta;
    }
    return b.confidence - a.confidence;
  });
}

/** Builds the "🔴 1 critical · 🟠 0 high · …" line, always showing all severities. */
function renderCountLine(findings: readonly Finding[]): string {
  return SEVERITY_ORDER.map((severity) => {
    const count = findings.filter((f) => f.severity === severity).length;
    return `${SEVERITY_EMOJI[severity]} ${count} ${severity}`;
  }).join(" · ");
}

/** Renders the displayed line reference, collapsing single-line ranges. */
function lineLabel(finding: Finding): string {
  return finding.lineStart === finding.lineEnd
    ? `${finding.lineStart}`
    : `${finding.lineStart}-${finding.lineEnd}`;
}

/**
 * Percent-encodes each path segment of a model-controlled file path so it
 * cannot break out of the Markdown link's `(url)` or inject characters like
 * `#` or whitespace. Slashes are preserved as path separators. Parentheses are
 * encoded explicitly because `encodeURIComponent` leaves them intact, yet an
 * unbalanced `)` would close the Markdown link early. The scheme and host are
 * fixed literals, so no `javascript:`-style scheme override is possible - the
 * path is only ever appended after `https://github.com/...`.
 */
function encodePathSegments(path: string): string {
  return path
    .split("/")
    .map(encodeURIComponent)
    .join("/")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29");
}

/**
 * Makes a model-controlled string safe as the text of a Markdown inline code
 * span. A backtick would close the span early (exposing the rest to link/HTML
 * parsing) and a newline would break the bullet, so both are stripped; a file
 * path never legitimately contains either.
 */
function sanitizeCodeSpan(text: string): string {
  return text.replace(/`/g, "").replace(/[\r\n]+/g, " ");
}

/**
 * Makes a model-controlled prose string safe to inline into the Markdown
 * comment. The summary and finding descriptions are model output derived from
 * an attacker's diff, so we:
 *  - HTML-escape `&`, `<`, `>`, which neutralizes any raw HTML - most importantly
 *    a `</details>` that would break out of our collapsible block, and `<img>`
 *    tags. GitHub's own pipeline also strips scripts and `javascript:` schemes
 *    and proxies images through Camo, but we do not rely on that alone.
 *  - Collapse line breaks to spaces so the text stays within its bullet and
 *    cannot inject new block-level Markdown (headings, list items, tables).
 * Inline emphasis and code in descriptions are intentionally preserved so real
 * findings stay readable.
 */
function sanitizeProse(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/[\r\n]+/g, " ");
}

/** Renders one finding as a Markdown bullet with a badge and clickable line link. */
function renderFinding(finding: Finding, ctx: RenderContext): string {
  const badge = `![${finding.severity}](https://img.shields.io/badge/${finding.severity}-${SEVERITY_BADGE_COLOR[finding.severity]})`;
  const label = sanitizeCodeSpan(`${finding.file}:${lineLabel(finding)}`);
  const link = `https://github.com/${ctx.owner}/${ctx.repo}/blob/${ctx.headSha}/${encodePathSegments(finding.file)}#L${finding.lineStart}`;
  const location = `[\`${label}\`](${link})`;
  return `- ${badge} ${location} — ${sanitizeProse(finding.description)}`;
}

/** Renders the synthesis stats footer line. */
function renderStatsFooter(stats: RenderStats): string {
  return `*Reviewed by ${stats.specialistCount} specialists · ${stats.rawFindingCount} raw findings synthesized to ${stats.synthesizedCount}.*`;
}

/**
 * Renders a synthesized review into the final GitHub-flavored Markdown comment:
 * header, severity count line, summary, verdict, a single expandable findings
 * block (omitted when there are no findings), a synthesis stats footer, and the
 * fixed roadmap footer.
 */
export function renderReview(
  review: ReviewResponse,
  ctx: RenderContext,
  stats: RenderStats
): string {
  const sorted = sortFindings(review.findings);

  const parts: string[] = [
    "**Sentinel review**",
    "",
    renderCountLine(sorted),
    "",
    "### Summary",
    sanitizeProse(review.summary),
    "",
    `**Verdict:** ${VERDICT_LABEL[review.verdict]}`,
  ];

  if (sorted.length > 0) {
    parts.push(
      "",
      "<details>",
      `<summary><b>${sorted.length} finding(s)</b> — click to expand</summary>`,
      ""
    );
    for (const finding of sorted) {
      parts.push(renderFinding(finding, ctx));
    }
    parts.push("", "</details>");
  }

  parts.push("", renderStatsFooter(stats), "", FOOTER);

  return parts.join("\n");
}
