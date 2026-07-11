import { describe, expect, it } from "vitest";

import { estimateCostUsd, formatUsageFooter } from "./cost.js";

describe("estimateCostUsd", () => {
  it("prices input and output tokens at the model's per-million rate", () => {
    // sonnet-4-6: $3/1M input, $15/1M output.
    // 1,000,000 in => $3.00; 200,000 out => $3.00; total $6.00.
    const cost = estimateCostUsd("claude-sonnet-4-6", {
      inputTokens: 1_000_000,
      outputTokens: 200_000,
    });
    expect(cost).toBeCloseTo(6, 10);
  });

  it("returns null for an unknown model", () => {
    expect(
      estimateCostUsd("some-future-model", {
        inputTokens: 100,
        outputTokens: 100,
      })
    ).toBeNull();
  });
});

describe("formatUsageFooter", () => {
  it("renders token counts and an estimated cost", () => {
    const footer = formatUsageFooter("claude-sonnet-4-6", {
      inputTokens: 12_345,
      outputTokens: 678,
    });
    expect(footer).toContain("12,345 input");
    expect(footer).toContain("678 output");
    expect(footer).toContain("~$");
    expect(footer).toContain("`claude-sonnet-4-6`");
  });

  it("reports cost as unavailable for an unknown model", () => {
    const footer = formatUsageFooter("some-future-model", {
      inputTokens: 100,
      outputTokens: 100,
    });
    expect(footer).toContain("Estimated cost: unavailable");
  });
});
