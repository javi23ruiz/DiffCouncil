import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { DROP_THRESHOLD, SECURITY_DROP_THRESHOLD } from "./synthesizer.js";

// The synthesizer applies these thresholds twice: the model is told to drop
// low-confidence findings in prompts/synthesizer.md, and deriveStats re-derives
// the same cut in code. If one side changes without the other they silently
// disagree, so this guard fails until the prompt is updated to match the code.
const prompt = readFileSync(
  join(process.cwd(), "prompts", "synthesizer.md"),
  "utf8"
);

describe("synthesizer thresholds stay in sync with the prompt", () => {
  it("states the general drop threshold from code", () => {
    expect(prompt).toContain(`below ${DROP_THRESHOLD} confidence`);
  });

  it("states the security drop threshold from code", () => {
    expect(prompt).toContain(`below ${SECURITY_DROP_THRESHOLD}`);
  });
});
