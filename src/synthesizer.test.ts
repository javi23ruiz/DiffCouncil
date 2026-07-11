import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Inject a fake Anthropic SDK so we can drive `messages.create` responses.
const create = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create };
  },
}));

import { synthesize, type SynthesizeInput } from "./synthesizer.js";
import type { SpecialistId, SpecialistResult } from "./reviewers/base.js";
import type { Finding } from "./schema.js";

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    file: "src/a.ts",
    lineStart: 10,
    lineEnd: 10,
    severity: "high",
    category: "correctness",
    confidence: 0.8,
    description: "Issue.",
    ...overrides,
  };
}

function specialist(
  specialistId: SpecialistId,
  findings: Finding[]
): SpecialistResult {
  return {
    specialistId,
    response: {
      summary: `${specialistId} summary.`,
      findings,
      verdict: findings.length > 0 ? "comments_to_address" : "looks_good",
    },
    usage: { inputTokens: 0, outputTokens: 0 },
    latencyMs: 0,
  };
}

function input(specialistResults: SpecialistResult[]): SynthesizeInput {
  return {
    specialistResults,
    diffSummary: { fileCount: 1, filesTouched: ["src/a.ts"] },
    model: "claude-sonnet-4-6",
    apiKey: "test-key",
  };
}

/** Builds a submit_review tool response carrying the given output findings. */
function apiResponse(outputFindings: Finding[]) {
  return {
    content: [
      {
        type: "tool_use",
        name: "submit_review",
        input: {
          summary: "Synthesized summary.",
          findings: outputFindings,
          verdict: outputFindings.length > 0 ? "comments_to_address" : "looks_good",
        },
      },
    ],
    usage: { input_tokens: 200, output_tokens: 80 },
  };
}

beforeEach(() => {
  delete process.env["SENTINEL_MOCK"];
  create.mockReset();
});

afterEach(() => {
  delete process.env["SENTINEL_MOCK"];
});

describe("synthesize", () => {
  it("reports two duplicate findings merged into one", async () => {
    const dupeA = finding({ file: "src/a.ts", lineStart: 10, description: "A" });
    const dupeB = finding({ file: "src/a.ts", lineStart: 11, description: "B" });
    const merged = finding({ file: "src/a.ts", lineStart: 10, description: "A/B" });
    create.mockResolvedValue(apiResponse([merged]));

    const result = await synthesize(
      input([specialist("correctness", [dupeA]), specialist("security", [dupeB])])
    );

    expect(result.response.findings).toHaveLength(1);
    expect(result.mergedCount).toBe(1);
    expect(result.droppedCount).toBe(0);
  });

  it("counts findings below the confidence threshold as dropped", async () => {
    const kept = finding({ confidence: 0.8 });
    const lowConf = finding({ confidence: 0.3, category: "correctness" });
    create.mockResolvedValue(apiResponse([kept]));

    const result = await synthesize(
      input([specialist("correctness", [kept, lowConf])])
    );

    expect(result.droppedCount).toBe(1);
  });

  it("preserves security findings at the 0.4 threshold while dropping others at 0.5", async () => {
    const securityKept = finding({
      category: "security",
      severity: "critical",
      confidence: 0.45,
    });
    const correctnessDropped = finding({
      category: "correctness",
      confidence: 0.45,
    });
    create.mockResolvedValue(apiResponse([securityKept]));

    const result = await synthesize(
      input([
        specialist("security", [securityKept]),
        specialist("correctness", [correctnessDropped]),
      ])
    );

    // 0.45 security is above its 0.4 bar; 0.45 correctness is below its 0.5 bar.
    expect(result.droppedCount).toBe(1);
  });

  it("surfaces invented findings as addedCount instead of clamping mergedCount", async () => {
    // One raw finding survives, but the model emits two: it invented one.
    const survivor = finding({ confidence: 0.9 });
    const invented = finding({ file: "src/b.ts", description: "invented" });
    create.mockResolvedValue(apiResponse([survivor, invented]));

    const result = await synthesize(input([specialist("correctness", [survivor])]));

    expect(result.mergedCount).toBe(0);
    expect(result.addedCount).toBe(1);
  });

  it("reports addedCount 0 on a normal merge", async () => {
    const a = finding({ lineStart: 10, description: "A" });
    const b = finding({ lineStart: 11, description: "B" });
    create.mockResolvedValue(apiResponse([finding({ description: "A/B" })]));

    const result = await synthesize(input([specialist("correctness", [a, b])]));

    expect(result.mergedCount).toBe(1);
    expect(result.addedCount).toBe(0);
  });

  it("produces a valid ReviewResponse from the tool call", async () => {
    const out = finding();
    create.mockResolvedValue(apiResponse([out]));

    const result = await synthesize(input([specialist("correctness", [out])]));

    expect(result.response.verdict).toBe("comments_to_address");
    expect(result.response.summary).toBe("Synthesized summary.");
    expect(result.usage).toEqual({ inputTokens: 200, outputTokens: 80 });
  });

  it("throws when the tool input fails schema validation", async () => {
    create.mockResolvedValue(
      apiResponse([finding({ confidence: 2 as unknown as number })])
    );

    await expect(
      synthesize(input([specialist("correctness", [finding()])]))
    ).rejects.toThrow(/failed validation/);
  });
});
