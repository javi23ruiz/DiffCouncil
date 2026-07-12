import { describe, expect, it } from "vitest";
import { z } from "zod";

import { buildSubmitReviewTool } from "./review-tool.js";

/**
 * Narrow view of the parts of the generated JSON schema this test asserts on.
 * Parsing with Zod keeps us honest without reaching for `any`.
 */
const GeneratedSchema = z.object({
  type: z.literal("object"),
  required: z.array(z.string()),
  properties: z.object({
    summary: z.object({ type: z.literal("string"), maxLength: z.number() }),
    verdict: z.object({ enum: z.array(z.string()) }),
    findings: z.object({
      type: z.literal("array"),
      items: z.object({
        required: z.array(z.string()),
        properties: z.object({
          confidence: z.object({ minimum: z.number(), maximum: z.number() }),
          description: z.object({ maxLength: z.number() }),
          suggestedFix: z.object({ maxLength: z.number() }),
        }),
      }),
    }),
  }),
});

describe("buildSubmitReviewTool", () => {
  it("passes its description through and names the tool submit_review", () => {
    const tool = buildSubmitReviewTool("Do the thing.");
    expect(tool.name).toBe("submit_review");
    expect(tool.description).toBe("Do the thing.");
  });

  it("generates length bounds that match ReviewResponseSchema, not the old hand-written caps", () => {
    const tool = buildSubmitReviewTool("desc");
    const schema = GeneratedSchema.parse(tool.input_schema);

    // These are the current Zod bounds. The previous hand-written tool schema
    // capped summary at 200 and description/suggestedFix at 300, which silently
    // rejected valid model output. Deriving from Zod keeps them aligned.
    expect(schema.properties.summary.maxLength).toBe(500);
    expect(schema.properties.findings.items.properties.description.maxLength).toBe(600);
    expect(schema.properties.findings.items.properties.suggestedFix.maxLength).toBe(600);
  });

  it("carries the confidence 0..1 bound and marks suggestedFix optional", () => {
    const tool = buildSubmitReviewTool("desc");
    const schema = GeneratedSchema.parse(tool.input_schema);

    expect(schema.properties.findings.items.properties.confidence.minimum).toBe(0);
    expect(schema.properties.findings.items.properties.confidence.maximum).toBe(1);
    expect(schema.required).toEqual(["summary", "findings", "verdict"]);
    expect(schema.properties.findings.items.required).not.toContain("suggestedFix");
  });
});
