import { readFile } from "node:fs/promises";

import Anthropic from "@anthropic-ai/sdk";
import type { ZodError } from "zod";

import { renderUntrusted } from "../prompt-safety.js";
import { buildSubmitReviewTool } from "../review-tool.js";
import { ReviewResponseSchema, type ReviewResponse } from "../schema.js";

const MAX_TOKENS = 4096;
const TEMPERATURE = 0;

/** The three specialist reviewers. Each id doubles as its finding category. */
export type SpecialistId = "security" | "correctness" | "maintainability";

/**
 * Thrown when a specialist's tool output fails schema validation. Carries the
 * structured Zod error and the raw model output so callers can log a compact,
 * debuggable summary rather than the full unreadable issues dump.
 */
export class SpecialistValidationError extends Error {
  constructor(
    readonly specialistId: SpecialistId,
    readonly zodError: ZodError,
    readonly rawOutput: unknown
  ) {
    super(`Specialist ${specialistId} submit_review input failed validation`);
    this.name = "SpecialistValidationError";
  }
}

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
 * The `submit_review` tool the specialist is forced to call. Its input schema is
 * generated from `ReviewResponseSchema` (see review-tool.ts) so it cannot drift
 * from what we validate against, or from the synthesizer's copy.
 */
const SUBMIT_REVIEW_TOOL = buildSubmitReviewTool(
  "Submit the structured result of your code review. Call this exactly once."
);

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
 * Builds the user message sent to Claude. The PR metadata and diff are all
 * attacker-controlled, so they are wrapped as untrusted input (see
 * prompt-safety.ts) to blunt prompt-injection attempts hidden in a PR title,
 * body, or diff. A missing PR body is rendered as "(no description)".
 */
function buildUserMessage(input: SpecialistInput): string {
  const body = input.prBody.trim() === "" ? "(no description)" : input.prBody;
  return renderUntrusted([
    { label: "repository", content: input.repo },
    { label: "pr_title", content: input.prTitle },
    { label: "pr_description", content: body },
    { label: "diff", content: input.diff },
  ]);
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
    throw new SpecialistValidationError(
      input.specialistId,
      parsed.error,
      toolUse.input
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
