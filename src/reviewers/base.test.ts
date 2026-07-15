import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Inject a fake Anthropic SDK so we can drive `messages.create` responses.
const create = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create };
  },
}));

import { runSpecialist, type SpecialistInput } from "./base.js";

function input(overrides: Partial<SpecialistInput> = {}): SpecialistInput {
  return {
    specialistId: "correctness",
    systemPrompt: "You are a test reviewer.",
    diff: "diff --git a/a.ts b/a.ts",
    prTitle: "Title",
    prBody: "Body",
    repo: "owner/repo",
    model: "claude-sonnet-4-6",
    apiKey: "test-key",
    ...overrides,
  };
}

const validToolInput = {
  summary: "A summary.",
  findings: [
    {
      file: "src/a.ts",
      lineStart: 1,
      lineEnd: 1,
      severity: "high",
      category: "correctness",
      confidence: 0.8,
      description: "Possible null dereference.",
    },
  ],
  verdict: "comments_to_address",
};

function apiResponse(toolInput: unknown) {
  return {
    content: [{ type: "tool_use", name: "submit_review", input: toolInput }],
    usage: { input_tokens: 100, output_tokens: 50 },
  };
}

beforeEach(() => {
  delete process.env["SENTINEL_MOCK"];
  create.mockReset();
});

afterEach(() => {
  delete process.env["SENTINEL_MOCK"];
});

describe("runSpecialist", () => {
  it("validates the tool input and tags the result with the specialistId", async () => {
    create.mockResolvedValue(apiResponse(validToolInput));

    const result = await runSpecialist(input({ specialistId: "correctness" }));

    expect(result.specialistId).toBe("correctness");
    expect(result.response.verdict).toBe("comments_to_address");
    expect(result.response.findings).toHaveLength(1);
    expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 50 });
  });

  it("throws when the tool input fails schema validation", async () => {
    create.mockResolvedValue(
      apiResponse({ ...validToolInput, findings: [{ ...validToolInput.findings[0], confidence: 2 }] })
    );

    await expect(runSpecialist(input())).rejects.toThrow(/failed validation/);
  });

  it("throws when the model returns no submit_review tool call", async () => {
    create.mockResolvedValue({
      content: [{ type: "text", text: "no tool here" }],
      usage: { input_tokens: 10, output_tokens: 5 },
    });

    await expect(runSpecialist(input())).rejects.toThrow(/did not return a submit_review/);
  });

  it("throws an actionable error when the output is truncated at the token cap", async () => {
    create.mockResolvedValue({
      ...apiResponse(validToolInput),
      stop_reason: "max_tokens",
    });

    await expect(runSpecialist(input())).rejects.toThrow(/stop_reason: max_tokens/);
  });

  it("short-circuits to a tagged mock when SENTINEL_MOCK is set", async () => {
    process.env["SENTINEL_MOCK"] = "1";

    const result = await runSpecialist(input({ specialistId: "security" }));

    expect(result.specialistId).toBe("security");
    expect(result.response.findings[0]?.category).toBe("security");
    expect(create).not.toHaveBeenCalled();
  });
});
