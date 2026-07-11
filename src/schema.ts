import { z } from "zod";

/** A single code review finding, as produced by the model. */
export const FindingSchema = z.object({
  file: z.string().describe("file path exactly as it appears in the diff"),
  lineStart: z
    .number()
    .int()
    .describe("first line of the finding, from the diff's new-file line numbers"),
  lineEnd: z
    .number()
    .int()
    .describe("last line of the finding, same numbering"),
  severity: z.enum(["critical", "high", "medium", "low"]),
  category: z.enum(["security", "correctness", "maintainability"]),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("model's confidence this is a real issue, 0 to 1"),
  description: z.string().max(300),
  suggestedFix: z.string().max(300).optional(),
});

/** The full structured review returned by the model in one tool call. */
export const ReviewResponseSchema = z.object({
  summary: z.string().max(200),
  findings: z.array(FindingSchema),
  verdict: z.enum(["looks_good", "comments_to_address", "blocking_issues"]),
});

export type Finding = z.infer<typeof FindingSchema>;
export type ReviewResponse = z.infer<typeof ReviewResponseSchema>;
