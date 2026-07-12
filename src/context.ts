import type { SkippedFile, SkippedReason } from "./trace.js";

export const MAX_DIFF_TOKENS = 50_000;

/** File paths that match any of these patterns are treated as lockfiles. */
const LOCKFILE_PATTERNS = [
  /(^|\/)package-lock\.json$/,
  /(^|\/)yarn\.lock$/,
  /(^|\/)pnpm-lock\.yaml$/,
  /(^|\/)Gemfile\.lock$/,
  /(^|\/)Cargo\.lock$/,
  /(^|\/)poetry\.lock$/,
  /(^|\/)composer\.lock$/,
  /(^|\/)mix\.lock$/,
  /(^|\/)Pipfile\.lock$/,
  /(^|\/)gradle\.lockfile$/,
];

/** File extensions or path patterns considered generated. */
const GENERATED_PATTERNS: RegExp[] = [
  /\.min\.(js|css)$/,
  /\.generated\./,
  /(^|\/)generated\//,
  /\.pb\.(go|ts)$/,
  /\.g\.ts$/,
  /\.graphql-gen\.ts$/,
];

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
  /** Files intentionally omitted (lockfiles, generated, binary) before truncation. */
  skippedFiles: SkippedFile[];
  /** Files kept through classification but later omitted by the token budget. */
  truncatedFiles: string[];
  /** Total line count of the diff (before any filtering). */
  diffLineCount: number;
}

/**
 * Classifies a single file path from a diff and returns a reason to skip it,
 * or `null` when the file is safe to review.
 */
export function classifyFile(
  path: string,
  chunkContent?: string
): SkippedReason | null {
  if (LOCKFILE_PATTERNS.some((pat) => pat.test(path))) {
    return "lockfile";
  }
  if (GENERATED_PATTERNS.some((pat) => pat.test(path))) {
    return "generated";
  }
  // Binary diffs in unified format start with a "Binary files … differ" line
  // and have no hunks to review.
  if (chunkContent && /^Binary files .+ differ\s*$/m.test(chunkContent)) {
    return "binary";
  }
  return null;
}

/**
 * Rough token estimate for a piece of text: one token per ~4 characters,
 * rounded up. This is deliberately cheap and provider-agnostic; it is meant
 * for budgeting, not exact accounting.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Extracts the file path from a `diff --git a/X b/Y` header line. */
function extractFilePath(diffChunk: string): string | null {
  const firstLine = diffChunk.split("\n")[0] ?? "";
  const match = /^diff --git a\/.+ b\/(.+)$/.exec(firstLine);
  return match?.[1] ?? null;
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

function truncationFooter(omittedCount: number): string {
  return `\n\n[sentinel: truncated - ${omittedCount} additional file(s) omitted to fit token budget]`;
}

/**
 * Truncates a unified diff to fit within a token budget without ever cutting
 * a file in half.
 *
 * Before truncation, lockfiles, generated files, and binary files are
 * filtered out and tracked in `skippedFiles`. The remaining reviewable files
 * are then kept greedily until the next would exceed the budget.
 *
 * Files dropped by the budget are tracked in `truncatedFiles`.
 *
 * A half-diff confuses the model, so files are never partially included: the
 * first reviewable file is always kept whole even if it alone exceeds the
 * budget (better to send something than nothing). When one or more files are
 * dropped by truncation, a footer noting how many were omitted is appended.
 */
export function truncateDiff(
  diff: string,
  maxTokens: number = MAX_DIFF_TOKENS
): TruncateResult {
  const diffLineCount = diff.split("\n").length;
  const originalTokens = estimateTokens(diff);

  // If the whole diff fits the budget without classification, return as-is.
  if (originalTokens <= maxTokens) {
    // Still classify for trace fidelity.
    const chunks = splitByFile(diff);
    const skippedFiles: SkippedFile[] = [];
    const diffFiles: string[] = [];
    for (const chunk of chunks) {
      const path = extractFilePath(chunk);
      if (path) {
        diffFiles.push(path);
        const reason = classifyFile(path, chunk);
        if (reason) {
          skippedFiles.push({ path, reason });
        }
      }
    }
    return {
      diff,
      truncated: false,
      originalTokens,
      keptTokens: originalTokens,
      skippedFiles,
      truncatedFiles: [],
      diffLineCount,
    };
  }

  const chunks = splitByFile(diff);
  const skippedFiles: SkippedFile[] = [];
  const truncatedFiles: string[] = [];
  const reviewableChunks: { chunk: string; path: string | null }[] = [];

  // First pass: classify every file.
  for (const chunk of chunks) {
    const path = extractFilePath(chunk);
    if (path) {
      const reason = classifyFile(path, chunk);
      if (reason) {
        skippedFiles.push({ path, reason });
      } else {
        reviewableChunks.push({ chunk, path });
      }
    } else {
      // Pre-diff preamble: keep unconditionally.
      reviewableChunks.push({ chunk, path: null });
    }
  }

  // Second pass: greedy truncation on reviewable chunks.
  const kept: string[] = [];
  let runningTokens = 0;
  let isFirst = true;

  for (const { chunk, path } of reviewableChunks) {
    const chunkTokens = estimateTokens(chunk);

    if (isFirst) {
      // Always keep the first reviewable chunk whole.
      kept.push(chunk);
      runningTokens += chunkTokens;
      isFirst = false;
      continue;
    }

    if (runningTokens + chunkTokens > maxTokens) {
      if (path) truncatedFiles.push(path);
      continue;
    }

    kept.push(chunk);
    runningTokens += chunkTokens;
  }

  const keptContent = kept.join("\n");

  // Omitted count = truncated files (not skipped, those were intentional).
  const omittedCount = truncatedFiles.length;
  const diffOut =
    omittedCount > 0
      ? keptContent + truncationFooter(omittedCount)
      : keptContent;

  return {
    diff: diffOut,
    truncated: true,
    originalTokens,
    keptTokens: estimateTokens(keptContent),
    skippedFiles,
    truncatedFiles,
    diffLineCount,
  };
}
