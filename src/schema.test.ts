import { describe, expect, it } from "vitest";

import { FindingSchema } from "./schema.js";

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
});
