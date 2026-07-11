import { readFile } from "node:fs/promises";

import Anthropic from "@anthropic-ai/sdk";

import { ReviewResponseSchema, type ReviewResponse } from "../schema.js";

const MAX_TOKENS = 4096;
const TEMPERATURE = 0;

/** The three specialist reviewers. Each id doubles as its finding category. */
export type SpecialistId = "security" | "correctness" | "maintainability";

export interface ReviewUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface SpecialistInput {
  specialistId: SpecialistId;
  systemPromptPath: string;
  diff: string;
  prTitle: string;
  prBody: string;
  repo: string;
  model: string;
  apiKey: string;
}

export interface SpecialistResult {
  specialistId: SpecialistId;
  response: ReviewResponse;
  usage: ReviewUsage;
  latencyMs: number;
}

/**
 * JSON schema for the `submit_review` tool input. Written out explicitly to
 * mirror `ReviewResponseSchema` in schema.ts — kept in sync by hand rather than
 * auto-generated so the shape the model sees stays readable and reviewable.
 */
const SUBMIT_REVIEW_TOOL: Anthropic.Tool = {
  name: "submit_review",
  description:
    "Submit the structured result of your code review. Call this exactly once.",
  input_schema: {
    type: "object",
    properties: {
      summary: {
        type: "string",
        maxLength: 200,
        description: "One sentence: what this PR does and your overall take.",
      },
      findings: {
        type: "array",
        items: {
          type: "object",
          properties: {
            file: {
              type: "string",
              description: "File path exactly as it appears in the diff.",
            },
            lineStart: {
              type: "integer",
              description:
                "First line of the finding, from the diff's new-file line numbers.",
            },
            lineEnd: {
              type: "integer",
              description: "Last line of the finding, same numbering.",
            },
            severity: {
              type: "string",
              enum: ["critical", "high", "medium", "low"],
            },
            category: {
              type: "string",
              enum: ["security", "correctness", "maintainability"],
            },
            confidence: {
              type: "number",
              minimum: 0,
              maximum: 1,
              description:
                "Your genuine certainty this is a real issue, 0 to 1.",
            },
            description: { type: "string", maxLength: 300 },
            suggestedFix: { type: "string", maxLength: 300 },
          },
          required: [
            "file",
            "lineStart",
            "lineEnd",
            "severity",
            "category",
            "confidence",
            "description",
          ],
        },
      },
      verdict: {
        type: "string",
        enum: ["looks_good", "comments_to_address", "blocking_issues"],
      },
    },
    required: ["summary", "findings", "verdict"],
  },
};

/**
 * Loads a specialist's system prompt from disk.
 *
 * @throws If the prompt file does not exist, with a message pointing at the
 * expected path.
 */
async function loadSystemPrompt(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      throw new Error(
        `Specialist system prompt not found at ${path}. ` +
          `Expected a prompt file under the prompts/ directory.`
      );
    }
    throw error;
  }
}

/**
 * Builds the user message sent to Claude: PR metadata (repo, title, body)
 * followed by the diff under a "## Diff" heading. A missing PR body is rendered
 * as "(no description)".
 */
function buildUserMessage(input: SpecialistInput): string {
  const body = input.prBody.trim() === "" ? "(no description)" : input.prBody;
  return [
    `Repository: ${input.repo}`,
    `PR title: ${input.prTitle}`,
    `PR description:`,
    body,
    ``,
    `## Diff`,
    ``,
    input.diff,
  ].join("\n");
}

/**
 * A canned structured response used when SENTINEL_MOCK is set, so the action
 * can be exercised end-to-end without spending an API call. Tagged with the
 * specialist's id so concatenated output is distinguishable.
 */
function mockResult(specialistId: SpecialistId): SpecialistResult {
  return {
    specialistId,
    response: {
      summary: `Mock ${specialistId} review: one minor observation.`,
      findings: [
        {
          file: "src/example.ts",
          lineStart: 12,
          lineEnd: 12,
          severity: "low",
          category: specialistId,
          confidence: 0.5,
          description: `Mock ${specialistId} finding for local testing.`,
        },
      ],
      verdict: "comments_to_address",
    },
    usage: { inputTokens: 0, outputTokens: 0 },
    latencyMs: 0,
  };
}

/**
 * Runs a single specialist reviewer: loads its system prompt, calls the
 * Anthropic Messages API forcing the `submit_review` tool, and validates the
 * tool input against ReviewResponseSchema.
 *
 * @returns The parsed structured response tagged with the specialist's id,
 * along with token usage and wall-clock latency.
 * @throws If the model does not return a tool call, or its input fails schema
 * validation.
 */
export async function runSpecialist(
  input: SpecialistInput
): Promise<SpecialistResult> {
  if (process.env["SENTINEL_MOCK"]) {
    return mockResult(input.specialistId);
  }

  const systemPrompt = await loadSystemPrompt(input.systemPromptPath);
  const userMessage = buildUserMessage(input);

  const client = new Anthropic({ apiKey: input.apiKey });

  const start = Date.now();
  const response = await client.messages.create({
    model: input.model,
    max_tokens: MAX_TOKENS,
    temperature: TEMPERATURE,
    system: systemPrompt,
    tools: [SUBMIT_REVIEW_TOOL],
    tool_choice: { type: "tool", name: "submit_review" },
    messages: [{ role: "user", content: userMessage }],
  });
  const latencyMs = Date.now() - start;

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock =>
      block.type === "tool_use" && block.name === "submit_review"
  );
  if (!toolUse) {
    throw new Error(
      `Specialist ${input.specialistId} did not return a submit_review tool call. ` +
        `Response contained: ${response.content.map((block) => block.type).join(", ")}`
    );
  }

  const parsed = ReviewResponseSchema.safeParse(toolUse.input);
  if (!parsed.success) {
    throw new Error(
      `Specialist ${input.specialistId} submit_review input failed validation: ${parsed.error.message}`
    );
  }

  return {
    specialistId: input.specialistId,
    response: parsed.data,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
    latencyMs,
  };
}
