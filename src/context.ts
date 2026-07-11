export const MAX_DIFF_TOKENS = 50_000;

export interface DiffSummary {
  fileCount: number;
  filesTouched: string[];
}

/**
 * Extracts the set of files touched by a unified diff from its `diff --git`
 * headers, using the post-image (`b/`) path. This is the lightweight structural
 * summary the synthesizer sees in place of the full diff.
 */
export function summarizeDiff(diff: string): DiffSummary {
  const filesTouched: string[] = [];
  for (const line of diff.split("\n")) {
    const match = /^diff --git a\/.+ b\/(.+)$/.exec(line);
    if (match?.[1]) {
      filesTouched.push(match[1]);
    }
  }
  return { fileCount: filesTouched.length, filesTouched };
}

export interface TruncateResult {
  /** The (possibly truncated) diff, including a footer notice when files were omitted. */
  diff: string;
  /** True when the original diff exceeded the token budget, whether or not any file was actually dropped. */
  truncated: boolean;
  /** Estimated token count of the original, untruncated diff. */
  originalTokens: number;
  /** Estimated token count of the kept diff content, excluding the truncation footer. */
  keptTokens: number;
}

/**
 * Rough token estimate for a piece of text: one token per ~4 characters,
 * rounded up. This is deliberately cheap and provider-agnostic; it is meant
 * for budgeting, not exact accounting.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Splits a unified diff into per-file chunks at `diff --git` boundaries.
 *
 * Each returned chunk starts at a `diff --git` line and runs up to (but not
 * including) the next one. Any content before the first `diff --git` line is
 * returned as a leading chunk of its own.
 */
function splitByFile(diff: string): string[] {
  const lines = diff.split("\n");
  const chunks: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (line.startsWith("diff --git") && current.length > 0) {
      chunks.push(current.join("\n"));
      current = [];
    }
    current.push(line);
  }

  if (current.length > 0) {
    chunks.push(current.join("\n"));
  }

  return chunks;
}

function truncationFooter(omittedFiles: number): string {
  return `\n\n[sentinel: truncated - ${omittedFiles} additional file(s) omitted to fit token budget]`;
}

/**
 * Truncates a unified diff to fit within a token budget without ever cutting
 * a file in half.
 *
 * If the whole diff is within `maxTokens`, it is returned unchanged with
 * `truncated: false`. Otherwise the diff is split at `diff --git` boundaries
 * and whole files are kept greedily until the next file would exceed the
 * budget. A half-diff confuses the model, so files are never partially
 * included: the first file is always kept whole even if it alone exceeds the
 * budget (better to send something than nothing). When one or more files are
 * dropped, a footer noting how many were omitted is appended.
 */
export function truncateDiff(
  diff: string,
  maxTokens: number = MAX_DIFF_TOKENS
): TruncateResult {
  const originalTokens = estimateTokens(diff);

  if (originalTokens <= maxTokens) {
    return { diff, truncated: false, originalTokens, keptTokens: originalTokens };
  }

  const chunks = splitByFile(diff);
  const kept: string[] = [];
  let runningTokens = 0;

  for (const chunk of chunks) {
    const chunkTokens = estimateTokens(chunk);

    // Always keep the first chunk whole, even if it alone blows the budget.
    if (kept.length === 0) {
      kept.push(chunk);
      runningTokens += chunkTokens;
      continue;
    }

    if (runningTokens + chunkTokens > maxTokens) {
      break;
    }

    kept.push(chunk);
    runningTokens += chunkTokens;
  }

  const omittedFiles = chunks.length - kept.length;
  const keptContent = kept.join("\n");
  const diffOut =
    omittedFiles > 0 ? keptContent + truncationFooter(omittedFiles) : keptContent;

  return {
    diff: diffOut,
    truncated: true,
    originalTokens,
    keptTokens: estimateTokens(keptContent),
  };
}
