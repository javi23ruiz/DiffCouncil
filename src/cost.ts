import type { ReviewUsage } from "./reviewers/base.js";

interface ModelPricing {
  /** USD per 1,000,000 input tokens. */
  input: number;
  /** USD per 1,000,000 output tokens. */
  output: number;
}

// List prices in USD per 1,000,000 tokens. Used only to render an estimated
// cost in the review comment footer - this is not authoritative billing data
// and does not account for intro pricing, discounts, or prompt caching.
const PRICING_PER_MILLION: Record<string, ModelPricing> = {
  "claude-fable-5": { input: 10, output: 50 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-opus-4-7": { input: 5, output: 25 },
  "claude-opus-4-6": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

/**
 * Estimates the USD cost of a review from its token usage and the model's list
 * price.
 *
 * @returns The estimated cost in USD, or `null` when the model has no known
 * pricing entry.
 */
export function estimateCostUsd(
  model: string,
  usage: ReviewUsage
): number | null {
  const pricing = PRICING_PER_MILLION[model];
  if (!pricing) {
    return null;
  }
  return (
    (usage.inputTokens / 1_000_000) * pricing.input +
    (usage.outputTokens / 1_000_000) * pricing.output
  );
}

/**
 * Renders a Markdown footer summarizing token usage and estimated cost, to be
 * appended to the review comment.
 *
 * When the model has no known pricing, the cost is reported as "unavailable"
 * and only the token counts are shown.
 */
export function formatUsageFooter(model: string, usage: ReviewUsage): string {
  const inTokens = usage.inputTokens.toLocaleString("en-US");
  const outTokens = usage.outputTokens.toLocaleString("en-US");
  const cost = estimateCostUsd(model, usage);
  const costText = cost === null ? "unavailable" : `~$${cost.toFixed(4)}`;

  return [
    "---",
    "",
    `<sub>🪙 ${inTokens} input + ${outTokens} output tokens · Estimated cost: ${costText} · \`${model}\`</sub>`,
  ].join("\n");
}
