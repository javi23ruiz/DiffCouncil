import { describe, expect, it } from "vitest";

import { FindingSchema, ReviewResponseSchema } from "./schema.js";

const validFinding = {
  file: "src/index.ts",
  lineStart: 10,
  lineEnd: 12,
  severity: "high",
  category: "correctness",
  confidence: 0.8,
  description: "Possible null dereference.",
};

describe("FindingSchema", () => {
  it("accepts a valid finding", () => {
    const result = FindingSchema.safeParse(validFinding);
    expect(result.success).toBe(true);
  });

  it("rejects a finding missing a required field", () => {
    const { file: _file, ...missingFile } = validFinding;
    const result = FindingSchema.safeParse(missingFile);
    expect(result.success).toBe(false);
  });

  it("rejects confidence outside the 0-1 range", () => {
    const result = FindingSchema.safeParse({ ...validFinding, confidence: 1.5 });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid severity enum value", () => {
    const result = FindingSchema.safeParse({
      ...validFinding,
      severity: "urgent",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-positive lineStart", () => {
    expect(
      FindingSchema.safeParse({ ...validFinding, lineStart: 0 }).success
    ).toBe(false);
    expect(
      FindingSchema.safeParse({ ...validFinding, lineStart: -5 }).success
    ).toBe(false);
  });

  it("rejects a non-positive lineEnd", () => {
    expect(
      FindingSchema.safeParse({ ...validFinding, lineEnd: 0 }).success
    ).toBe(false);
  });

  it("accepts a 600-char description but rejects 601", () => {
    expect(
      FindingSchema.safeParse({ ...validFinding, description: "x".repeat(600) })
        .success
    ).toBe(true);
    expect(
      FindingSchema.safeParse({ ...validFinding, description: "x".repeat(601) })
        .success
    ).toBe(false);
  });
});

describe("ReviewResponseSchema", () => {
  const validReview = {
    summary: "A concise overall review summary.",
    findings: [validFinding],
    verdict: "comments_to_address",
  };

  it("accepts a 500-char summary but rejects 501", () => {
    expect(
      ReviewResponseSchema.safeParse({
        ...validReview,
        summary: "x".repeat(500),
      }).success
    ).toBe(true);
    expect(
      ReviewResponseSchema.safeParse({
        ...validReview,
        summary: "x".repeat(501),
      }).success
    ).toBe(false);
  });
});
