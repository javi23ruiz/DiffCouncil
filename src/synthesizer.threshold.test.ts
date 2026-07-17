import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  DROP_THRESHOLD,
  MATCH_LINE_TOLERANCE,
  MERGE_LINE_DISTANCE,
  SECURITY_DROP_THRESHOLD,
} from "./synthesizer.js";

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

  it("states the merge line distance from code", () => {
    expect(prompt).toContain(`within ${MERGE_LINE_DISTANCE} lines`);
  });

  // The deterministic matcher must tolerate at least the distance the model is
  // allowed to merge across, or a legitimate merge would be miscounted as a
  // drop. See the constants' comments in synthesizer.ts for the full argument.
  it("keeps the match tolerance at least as wide as the merge distance", () => {
    expect(MATCH_LINE_TOLERANCE).toBeGreaterThanOrEqual(MERGE_LINE_DISTANCE);
  });
});
