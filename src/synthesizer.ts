import { readFile } from "node:fs/promises";
import { join } from "node:path";

import Anthropic from "@anthropic-ai/sdk";

import type { DiffSummary } from "./context.js";
import { renderUntrusted } from "./prompt-safety.js";
import { buildSubmitReviewTool } from "./review-tool.js";
import type { SpecialistResult } from "./reviewers/base.js";
import {
  ReviewResponseSchema,
  type Finding,
  type ReviewResponse,
} from "./schema.js";

const MAX_TOKENS = 4096;
const TEMPERATURE = 0;

// Confidence thresholds below which a raw finding is considered dropped.
// Security gets a lower bar because a missed vulnerability is costlier than a
// false positive.
const DROP_THRESHOLD = 0.5;
const SECURITY_DROP_THRESHOLD = 0.4;

// The prompt lives in prompts/synthesizer.md at the repo root. The bundled
// action (dist/index.js) sits one level under the repo root, so
// "../prompts/synthesizer.md" relative to the bundle directory resolves to the
// repo-root prompts/ folder. `__dirname` is native in the CJS bundle esbuild
// produces.
const SYSTEM_PROMPT_PATH = join(__dirname, "..", "prompts", "synthesizer.md");

/**
 * The `submit_review` tool the synthesizer is forced to call. Its input schema
 * is generated from `ReviewResponseSchema` (see review-tool.ts), the same source
 * of truth the specialists use, so the two can never drift apart.
 */
const SUBMIT_REVIEW_TOOL = buildSubmitReviewTool(
  "Submit the synthesized code review. Call this exactly once."
);

export interface SynthesizeInput {
  specialistResults: SpecialistResult[];
  diffSummary: DiffSummary;
  model: string;
  apiKey: string;
}

export interface SynthesizeResult {
  response: ReviewResponse;
  usage: { inputTokens: number; outputTokens: number };
  latencyMs: number;
  /** How many raw findings were merged into fewer. */
  mergedCount: number;
  /** How many raw findings were dropped for low confidence. */
  droppedCount: number;
}

/** True when a raw finding falls below its category's confidence threshold. */
function isDropped(finding: Finding): boolean {
  const threshold =
    finding.category === "security" ? SECURITY_DROP_THRESHOLD : DROP_THRESHOLD;
  return finding.confidence < threshold;
}

/**
 * Derives merged/dropped counts deterministically from the raw inputs and the
 * synthesized output, rather than trusting the model to self-report them.
 * `droppedCount` is how many raw findings fell below their threshold;
 * `mergedCount` is the remaining reduction (surviving raw findings collapsed
 * into fewer output findings).
 */
function deriveStats(
  rawFindings: readonly Finding[],
  outputCount: number
): { mergedCount: number; droppedCount: number } {
  const droppedCount = rawFindings.filter(isDropped).length;
  const survivingCount = rawFindings.length - droppedCount;
  const mergedCount = Math.max(0, survivingCount - outputCount);
  return { mergedCount, droppedCount };
}

async function loadSystemPrompt(): Promise<string> {
  try {
    return await readFile(SYSTEM_PROMPT_PATH, "utf8");
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      throw new Error(
        `Synthesizer system prompt not found at ${SYSTEM_PROMPT_PATH}. ` +
          `Expected a prompts/synthesizer.md file at the repository root.`
      );
    }
    throw error;
  }
}

/**
 * Builds the synthesizer user message: the specialists' findings and the diff
 * summary as JSON. The raw diff is deliberately excluded — the synthesizer
 * reasons over structured claims, not code.
 *
 * These findings are model output derived from an attacker-controlled diff, so
 * a compromised or manipulated specialist response could carry injected text.
 * The payload is therefore wrapped as untrusted input (see prompt-safety.ts) so
 * the injection defense holds across pipeline stages, not just at the first hop.
 */
function buildUserMessage(
  rawFindings: readonly Finding[],
  diffSummary: DiffSummary
): string {
  const payload = JSON.stringify(
    { diffSummary, findings: rawFindings },
    null,
    2
  );
  return renderUntrusted([
    { label: "specialist_findings_json", content: payload },
  ]);
}

/**
 * A canned synthesized review used when SENTINEL_MOCK is set, so the full
 * pipeline can run end-to-end without an API call. Keeps the first raw finding
 * (if any) so counts are non-trivial.
 */
function mockResult(input: SynthesizeInput): SynthesizeResult {
  const rawFindings = input.specialistResults.flatMap(
    (r) => r.response.findings
  );
  const kept = rawFindings.slice(0, 1);
  return {
    response: {
      summary: "Mock synthesized review across specialists.",
      findings: kept,
      verdict: kept.length > 0 ? "comments_to_address" : "looks_good",
    },
    usage: { inputTokens: 0, outputTokens: 0 },
    latencyMs: 0,
    ...deriveStats(rawFindings, kept.length),
  };
}

/**
 * Synthesizes the specialists' findings into a single unified review via a
 * tool-forced Claude call, then derives merge/drop stats deterministically.
 *
 * @throws If the model does not return a tool call, or its input fails schema
 * validation.
 */
export async function synthesize(
  input: SynthesizeInput
): Promise<SynthesizeResult> {
  if (process.env["SENTINEL_MOCK"]) {
    return mockResult(input);
  }

  const rawFindings = input.specialistResults.flatMap(
    (r) => r.response.findings
  );

  const systemPrompt = await loadSystemPrompt();
  const userMessage = buildUserMessage(rawFindings, input.diffSummary);

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
      "Synthesizer did not return a submit_review tool call. Response contained: " +
        response.content.map((block) => block.type).join(", ")
    );
  }

  const parsed = ReviewResponseSchema.safeParse(toolUse.input);
  if (!parsed.success) {
    throw new Error(
      `Synthesizer submit_review input failed validation: ${parsed.error.message}`
    );
  }

  return {
    response: parsed.data,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
    latencyMs,
    ...deriveStats(rawFindings, parsed.data.findings.length),
  };
}
