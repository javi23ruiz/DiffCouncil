import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Stub runSpecialist so we can drive failures; keep the rest of the module
// (SpecialistValidationError, SPECIALIST_IDS) real. vi.hoisted initializes the
// stub before the hoisted vi.mock factory runs.
const { runSpecialist } = vi.hoisted(() => ({ runSpecialist: vi.fn() }));
vi.mock("./reviewers/base.js", async (importActual) => {
  const actual = await importActual<typeof import("./reviewers/base.js")>();
  return { ...actual, runSpecialist };
});

import { runAllSpecialists, type OrchestratorInput } from "./orchestrator.js";
import { SpecialistValidationError } from "./reviewers/base.js";
import { ReviewResponseSchema } from "./schema.js";

function orchestratorInput(): OrchestratorInput {
  return {
    diff: "diff",
    prTitle: "t",
    prBody: "b",
    repo: "owner/repo",
    model: "claude-sonnet-4-6",
    apiKey: "k",
  };
}

/** Runs `fn`, returning every parsed `sentinel: {...}` log entry it emitted. */
async function captureLogs(
  fn: () => Promise<unknown>
): Promise<Record<string, unknown>[]> {
  const entries: Record<string, unknown>[] = [];
  const spy = vi.spyOn(console, "log").mockImplementation((msg?: unknown) => {
    const line = String(msg);
    const json = line.startsWith("sentinel: ") ? line.slice("sentinel: ".length) : line;
    entries.push(JSON.parse(json) as Record<string, unknown>);
  });
  try {
    await fn();
  } finally {
    spy.mockRestore();
  }
  return entries;
}

function findStage(
  entries: Record<string, unknown>[],
  stage: string
): Record<string, unknown> | undefined {
  return entries.find((e) => e["stage"] === stage);
}

beforeEach(() => {
  runSpecialist.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runAllSpecialists", () => {
  it("logs a completion summary flagging total failure when every specialist throws", async () => {
    runSpecialist.mockRejectedValue(new Error("boom"));

    let results: unknown[] = [];
    const entries = await captureLogs(async () => {
      results = await runAllSpecialists(orchestratorInput());
    });

    expect(results).toEqual([]);
    const complete = findStage(entries, "specialists_complete");
    expect(complete).toBeDefined();
    expect(complete?.["succeeded"]).toBe(0);
    expect(complete?.["failed"]).toBe(3);
    expect(complete?.["allSpecialistsFailed"]).toBe(true);
  });

  it("strips control characters from the logged raw-output sample", async () => {
    const parsed = ReviewResponseSchema.safeParse({});
    if (parsed.success) throw new Error("expected schema failure");
    const rawOutput = { note: "a\u0000b\u2028c\u007Fd\ne" };
    runSpecialist.mockRejectedValue(
      new SpecialistValidationError("security", parsed.error, rawOutput)
    );

    const entries = await captureLogs(() => runAllSpecialists(orchestratorInput()));

    const errorEntry = findStage(entries, "specialist_error");
    expect(errorEntry?.["errorType"]).toBe("validation");
    const sample = String(errorEntry?.["rawOutputSample"]);
    // The raw output had control chars; none survive into the sample.
    expect(/[\u0000-\u001F\u007F-\u009F\u2028\u2029]/.test(sample)).toBe(false);
    // The surrounding printable content is still there for debugging.
    expect(sample).toContain("note");
  });
});
