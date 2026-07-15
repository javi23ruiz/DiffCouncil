import { describe, expect, it } from "vitest";
import { classifyFile, estimateTokens, truncateDiff } from "./context.js";

/** Builds a realistic-looking single-file diff chunk of a given line count. */
function makeFile(name: string, bodyLines: number): string {
  const header = [
    `diff --git a/${name} b/${name}`,
    `index 1111111..2222222 100644`,
    `--- a/${name}`,
    `+++ b/${name}`,
    `@@ -1,${bodyLines} +1,${bodyLines} @@`,
  ].join("\n");
  const body = Array.from(
    { length: bodyLines },
    (_, i) => `+line ${i} of ${name} with some padding padding padding`
  ).join("\n");
  return `${header}\n${body}`;
}

describe("classifyFile", () => {
  it("skips Sentinel's own trace JSON so it is never reviewed", () => {
    expect(classifyFile("traces/abc-123.json")).toBe("generated");
    expect(classifyFile("some/nested/traces/run.json")).toBe("generated");
  });

  it("does not skip ordinary source or a file merely named trace", () => {
    expect(classifyFile("src/trace.ts")).toBeNull();
    expect(classifyFile("src/traces.ts")).toBeNull();
  });

  it("still flags lockfiles", () => {
    expect(classifyFile("package-lock.json")).toBe("lockfile");
  });
});

describe("estimateTokens", () => {
  it("rounds up at ~4 characters per token", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
  });
});

describe("truncateDiff", () => {
  it("passes a small diff through untouched", () => {
    const diff = makeFile("small.ts", 3);
    const result = truncateDiff(diff);

    expect(result.truncated).toBe(false);
    expect(result.diff).toBe(diff);
    expect(result.originalTokens).toBe(estimateTokens(diff));
    expect(result.keptTokens).toBe(result.originalTokens);
  });

  it("truncates an oversized diff at a file boundary, never mid-file", () => {
    const files = [
      makeFile("a.ts", 4),
      makeFile("b.ts", 4),
      makeFile("c.ts", 4),
      makeFile("d.ts", 4),
    ];
    const diff = files.join("\n");
    const [t0, t1] = files.map((f) => estimateTokens(f));
    // Budget fits the first two files but not the third.
    const maxTokens = (t0 ?? 0) + (t1 ?? 0) + 1;

    const result = truncateDiff(diff, maxTokens);

    expect(result.truncated).toBe(true);

    // Kept content (before the footer) is exactly the first two whole files.
    const footerIndex = result.diff.indexOf("\n\n[sentinel:");
    const keptOnly = result.diff.slice(0, footerIndex);
    expect(keptOnly).toBe([files[0], files[1]].join("\n"));

    // The dropped files do not appear at all, not even partially.
    expect(result.diff).not.toContain("diff --git a/c.ts");
    expect(result.diff).not.toContain("diff --git a/d.ts");
    expect(result.keptTokens).toBe(estimateTokens(keptOnly));
  });

  it("appends a footer reporting the correct number of omitted files", () => {
    const files = [
      makeFile("a.ts", 4),
      makeFile("b.ts", 4),
      makeFile("c.ts", 4),
      makeFile("d.ts", 4),
    ];
    const diff = files.join("\n");
    const [t0, t1] = files.map((f) => estimateTokens(f));
    const maxTokens = (t0 ?? 0) + (t1 ?? 0) + 1;

    const result = truncateDiff(diff, maxTokens);

    // Two of four files were kept, so two were omitted.
    expect(result.diff).toMatch(
      /\n\n\[sentinel: truncated - 2 additional file\(s\) omitted to fit token budget\]$/
    );
  });

  it("returns a single over-budget file whole rather than empty", () => {
    const file = makeFile("huge.ts", 40);
    const maxTokens = 10; // far below the file's size

    const result = truncateDiff(file, maxTokens);

    expect(result.truncated).toBe(true);
    // Whole file preserved; nothing omitted means no footer.
    expect(result.diff).toBe(file);
    expect(result.diff).not.toContain("[sentinel: truncated");
    expect(result.originalTokens).toBeGreaterThan(maxTokens);
    expect(result.keptTokens).toBe(estimateTokens(file));
  });
});
