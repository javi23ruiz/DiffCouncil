import { createHash } from "node:crypto";
import { z } from "zod";

/** A single code review finding, as produced by the model. */
export const FindingSchema = z.object({
  /**
   * Stable identifier computed as SHA-256 of specialistId + file + lineStart
   * + first 100 chars of description. Set by {@link assignFindingId} after
   * validation; the model never produces this field.
   */
  id: z.string().optional().describe("stable finding id, assigned post-parse"),
  file: z.string().describe("file path exactly as it appears in the diff"),
  lineStart: z
    .number()
    .int()
    .positive()
    .describe("first line of the finding, from the diff's new-file line numbers"),
  lineEnd: z
    .number()
    .int()
    .positive()
    .describe("last line of the finding, same numbering"),
  severity: z.enum(["critical", "high", "medium", "low"]),
  category: z.enum(["security", "correctness", "maintainability"]),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("model's confidence this is a real issue, 0 to 1"),
  /**
   * Length capped to keep GitHub comments scannable; empirically 600 chars
   * fits a typical multi-sentence finding.
   */
  description: z.string().max(600).describe("what is wrong and why it matters"),
  /**
   * Length capped to keep GitHub comments scannable; empirically 600 chars
   * fits a typical multi-sentence finding.
   */
  suggestedFix: z
    .string()
    .max(600)
    .optional()
    .describe("optional concrete suggestion for how to fix the finding"),
});

/** The full structured review returned by the model in one tool call. */
export const ReviewResponseSchema = z.object({
  /**
   * Length capped to keep GitHub comments scannable; empirically 500 chars
   * fits a typical multi-sentence review overview.
   */
  summary: z
    .string()
    .max(500)
    .describe("one-sentence overview of the change and your overall take"),
  findings: z.array(FindingSchema),
  verdict: z.enum(["looks_good", "comments_to_address", "blocking_issues"]),
});

export type Finding = z.infer<typeof FindingSchema>;
export type ReviewResponse = z.infer<typeof ReviewResponseSchema>;

/**
 * The description prefix length used when computing a stable finding id.
 * The id encodes the first N characters so two similar-but-not-identical
 * descriptions still produce distinct ids.
 */
const ID_DESC_PREFIX_LEN = 100;

/**
 * Assigns a stable, deterministic id to a Finding.
 * The id is SHA-256 of `${specialistId}|${file}|${lineStart}|${descPrefix}`,
 * truncated to the first 12 hex characters. This is compact enough to be
 * human-readable in traces while still collision-resistant across a single
 * run's ~dozen findings.
 */
export function assignFindingId(
  specialistId: string,
  finding: Finding
): Finding {
  const descPrefix = finding.description.slice(0, ID_DESC_PREFIX_LEN);
  const raw = `${specialistId}|${finding.file}|${finding.lineStart}|${descPrefix}`;
  const id = createHash("sha256").update(raw).digest("hex").slice(0, 12);
  return { ...finding, id };
}
