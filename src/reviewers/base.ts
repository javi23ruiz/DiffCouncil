import type { ZodError } from "zod";

import { computePromptSha } from "../prompt-loader.js";
import { renderUntrusted } from "../prompt-safety.js";
import {
  callSubmitReview,
  SubmitReviewValidationError,
  type ReviewUsage,
} from "../review-call.js";
import { buildSubmitReviewTool } from "../review-tool.js";
import type { ReviewResponse } from "../schema.js";

export type { ReviewUsage };

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

export interface SpecialistInput {
  specialistId: SpecialistId;
  /**
   * The specialist's system prompt content, already loaded from disk by the
   * orchestrator. It is passed in (rather than a path re-read here) so the
   * prompt is read and SHA-hashed exactly once per run: the orchestrator needs
   * the SHA for the `specialist_start` trace event, and reusing the same bytes
   * for the API call guarantees the traced SHA matches what was actually sent.
   */
  systemPrompt: string;
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
  /** SHA-256 of the specialist's system prompt content, first 12 hex chars. */
  promptSha: string;
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
    promptSha: "mock",
  };
}

/**
 * Runs a single specialist reviewer: makes the forced `submit_review` call via
 * the shared review-call helper, using the system prompt the orchestrator
 * already loaded (see {@link SpecialistInput.systemPrompt}).
 *
 * @returns The parsed structured response tagged with the specialist's id,
 * along with token usage and wall-clock latency.
 * @throws SpecialistValidationError if the tool input fails schema validation.
 * @throws Error if the model does not return a tool call.
 */
export async function runSpecialist(
  input: SpecialistInput
): Promise<SpecialistResult> {
  if (process.env["SENTINEL_MOCK"]) {
    return mockResult(input.specialistId);
  }

  const promptSha = computePromptSha(input.systemPrompt);
  const userMessage = buildUserMessage(input);

  try {
    const outcome = await callSubmitReview({
      apiKey: input.apiKey,
      model: input.model,
      systemPrompt: input.systemPrompt,
      userMessage,
      tool: SUBMIT_REVIEW_TOOL,
    });
    return { specialistId: input.specialistId, promptSha, ...outcome };
  } catch (error: unknown) {
    // Re-tag a validation failure with the specialist's id so the orchestrator
    // can attribute and summarize it; other errors propagate unchanged.
    if (error instanceof SubmitReviewValidationError) {
      throw new SpecialistValidationError(
        input.specialistId,
        error.zodError,
        error.rawOutput
      );
    }
    throw error;
  }
}
