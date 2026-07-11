import { readFile } from "node:fs/promises";
import { join } from "node:path";

import Anthropic from "@anthropic-ai/sdk";

const MAX_TOKENS = 4096;
const TEMPERATURE = 0;

// The prompt lives in prompts/reviewer.md at the repo root. The bundled action
// (dist/index.js) sits one level under the repo root, so "../prompts/reviewer.md"
// relative to the bundle's directory resolves to the repo-root prompts/ folder.
// `__dirname` is provided natively in the CJS bundle esbuild produces.
const SYSTEM_PROMPT_PATH = join(__dirname, "..", "prompts", "reviewer.md");

export interface ReviewInput {
  diff: string;
  prTitle: string;
  prBody: string;
  repo: string;
  model: string;
  apiKey: string;
}

export interface ReviewUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface ReviewResult {
  review: string;
  usage: ReviewUsage;
  latencyMs: number;
}

/**
 * Loads the reviewer system prompt from prompts/reviewer.md at runtime.
 *
 * @throws If the prompt file does not exist, with a message pointing at the
 * expected path.
 */
async function loadSystemPrompt(): Promise<string> {
  try {
    return await readFile(SYSTEM_PROMPT_PATH, "utf8");
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      throw new Error(
        `Reviewer system prompt not found at ${SYSTEM_PROMPT_PATH}. ` +
          `Expected a prompts/reviewer.md file at the repository root.`
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
function buildUserMessage(input: ReviewInput): string {
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
 * Runs a code review by loading the system prompt from prompts/reviewer.md and
 * calling the Anthropic Messages API with the PR diff.
 *
 * @returns The assistant's review text, token usage (input/output), and the
 * wall-clock latency of the API call in milliseconds.
 */
export async function runReview(input: ReviewInput): Promise<ReviewResult> {
  const systemPrompt = await loadSystemPrompt();
  const userMessage = buildUserMessage(input);

  const client = new Anthropic({ apiKey: input.apiKey });

  const start = Date.now();
  const response = await client.messages.create({
    model: input.model,
    max_tokens: MAX_TOKENS,
    temperature: TEMPERATURE,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });
  const latencyMs = Date.now() - start;

  const review = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  return {
    review,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
    latencyMs,
  };
}
