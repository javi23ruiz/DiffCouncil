import type Anthropic from "@anthropic-ai/sdk";
import { zodToJsonSchema } from "zod-to-json-schema";

import { ReviewResponseSchema } from "./schema.js";

/**
 * JSON schema for the `submit_review` tool input, generated from
 * `ReviewResponseSchema` so it can never drift from the Zod schema we actually
 * validate the model's output against. Both the specialists and the synthesizer
 * build their tool from this one definition, so there is no second hand-written
 * copy to fall out of sync.
 *
 * The Anthropic SDK types `input_schema` as an object literal whose `type` must
 * be `"object"`; a `z.object()` always produces exactly that, but
 * zod-to-json-schema returns a broad union that TypeScript cannot narrow, so we
 * bridge it with a single documented cast. Correctness is not on the honour
 * system: the model's response is re-validated against `ReviewResponseSchema` at
 * runtime, so this schema only needs to be a faithful hint.
 */
const SUBMIT_REVIEW_INPUT_SCHEMA = zodToJsonSchema(ReviewResponseSchema, {
  $refStrategy: "none",
}) as unknown as Anthropic.Tool.InputSchema;

/**
 * Builds the `submit_review` tool the model is forced to call. The description
 * differs per caller (a specialist reviewer vs. the synthesizer), but the input
 * schema is shared.
 */
export function buildSubmitReviewTool(description: string): Anthropic.Tool {
  return {
    name: "submit_review",
    description,
    input_schema: SUBMIT_REVIEW_INPUT_SCHEMA,
  };
}
