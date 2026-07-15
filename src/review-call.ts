import Anthropic from "@anthropic-ai/sdk";
import type { ZodError } from "zod";

import { ReviewResponseSchema, type ReviewResponse } from "./schema.js";

const MAX_TOKENS = 4096;

export interface ReviewUsage {
  inputTokens: number;
  outputTokens: number;
}

/**
 * Thrown when a forced `submit_review` tool call returns input that fails schema
 * validation. Carries the structured Zod error and the raw model output so
 * callers can wrap it (e.g. tagging it with a specialist id) or log a compact,
 * debuggable summary rather than the full unreadable issues dump.
 */
export class SubmitReviewValidationError extends Error {
  constructor(
    readonly zodError: ZodError,
    readonly rawOutput: unknown
  ) {
    super("submit_review input failed validation");
    this.name = "SubmitReviewValidationError";
  }
}

export interface SubmitReviewRequest {
  apiKey: string;
  model: string;
  systemPrompt: string;
  userMessage: string;
  /** The forced tool, built via review-tool.ts. */
  tool: Anthropic.Tool;
}

export interface SubmitReviewResult {
  response: ReviewResponse;
  usage: ReviewUsage;
  latencyMs: number;
}

/**
 * Runs one tool-forced `submit_review` Messages API call and validates the
 * result against `ReviewResponseSchema`. Shared by the specialists and the
 * synthesizer so tool-call extraction, validation, and error handling live in
 * exactly one place.
 *
 * @throws Error if the model returns no matching tool call.
 * @throws SubmitReviewValidationError if the tool input fails schema validation.
 */
export async function callSubmitReview(
  req: SubmitReviewRequest
): Promise<SubmitReviewResult> {
  const client = new Anthropic({ apiKey: req.apiKey });

  const start = Date.now();
  // No `temperature` is set: it is rejected with a 400 on newer Claude models
  // (Sonnet 5, Opus 4.7/4.8, Fable 5), and the model id is a user-supplied
  // action input we do not pin, so any of those may be passed. It never
  // guaranteed determinism anyway, so there is nothing to preserve.
  const response = await client.messages.create({
    model: req.model,
    max_tokens: MAX_TOKENS,
    system: req.systemPrompt,
    tools: [req.tool],
    tool_choice: { type: "tool", name: req.tool.name },
    messages: [{ role: "user", content: req.userMessage }],
  });
  const latencyMs = Date.now() - start;

  // A forced tool call that hits the output cap is returned with a truncated,
  // usually invalid, tool input. Detect it here and fail with an actionable
  // message rather than letting it surface downstream as an opaque Zod error.
  if (response.stop_reason === "max_tokens") {
    throw new Error(
      `The model hit the ${MAX_TOKENS}-token output cap (stop_reason: max_tokens) ` +
        `before completing the ${req.tool.name} tool call; the review output was ` +
        `too long. Raise MAX_TOKENS in review-call.ts or reduce the diff size.`
    );
  }

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock =>
      block.type === "tool_use" && block.name === req.tool.name
  );
  if (!toolUse) {
    throw new Error(
      `The model did not return a ${req.tool.name} tool call. Response contained: ` +
        response.content.map((block) => block.type).join(", ")
    );
  }

  const parsed = ReviewResponseSchema.safeParse(toolUse.input);
  if (!parsed.success) {
    throw new SubmitReviewValidationError(parsed.error, toolUse.input);
  }

  return {
    response: parsed.data,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
    latencyMs,
  };
}
