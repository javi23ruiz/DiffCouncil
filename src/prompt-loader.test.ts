import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { loadPrompt } from "./prompt-loader.js";

describe("loadPrompt", () => {
  it("loads an existing prompt file", async () => {
    const path = join(process.cwd(), "prompts", "security.md");
    const contents = await loadPrompt(path);
    expect(contents).toContain("Sentinel Security Reviewer");
  });

  it("turns a missing file into an actionable error naming the path", async () => {
    const path = join(process.cwd(), "prompts", "does-not-exist.md");
    await expect(loadPrompt(path)).rejects.toThrow(
      /Prompt file not found at .*does-not-exist\.md/
    );
  });
});
