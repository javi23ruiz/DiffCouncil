import { join } from "node:path";

import type { ZodError } from "zod";

import { log } from "./log.js";
import { computePromptSha, loadPrompt, PROMPTS_DIR } from "./prompt-loader.js";
import {
  runSpecialist,
  SpecialistValidationError,
  type SpecialistId,
  type SpecialistResult,
} from "./reviewers/base.js";
import { pushTraceEvent } from "./trace.js";

export const SPECIALIST_IDS: readonly SpecialistId[] = [
  "security",
  "correctness",
  "maintainability",
];

/** Most issues we expand in a log line before collapsing the rest into a count. */
const MAX_LOGGED_ISSUES = 5;
/** Characters of raw model output we sample into the log for debugging. */
const RAW_OUTPUT_SAMPLE_CHARS = 500;

/**
 * Produces a bounded, single-line, control-character-free sample of raw model
 * output for logging. The output is attacker-influenced (it derives from the PR
 * diff), so beyond bounding its length we strip every control character - not
 * just the line separators log.ts escapes at the transport layer - so the sample
 * cannot smuggle line breaks, terminal escapes, or other control bytes into a
 * downstream log parser or SIEM. Structural JSON characters are left intact
 * (the sample IS serialized JSON) but are inert: the shared logger re-encodes
 * this whole value as one escaped JSON string.
 */
function sampleRawOutput(value: unknown): string {
  return JSON.stringify(value ?? null)
    .replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029]/g, " ")
    .slice(0, RAW_OUTPUT_SAMPLE_CHARS);
}

interface CompactIssue {
  path: string;
  code: string;
  limit?: number;
  actual?: number | string;
}

/** Walks an object graph by a Zod issue path, returning the value there. */
function valueAtPath(root: unknown, path: readonly (string | number)[]): unknown {
  return path.reduce<unknown>((acc, key) => {
    if (acc !== null && typeof acc === "object") {
      return (acc as Record<string | number, unknown>)[key];
    }
    return undefined;
  }, root);
}

/**
 * Reduces a ZodError into compact, log-friendly issue objects. For length
 * violations, `limit` is the schema bound and `actual` is the offending
 * string's length; other codes report the offending value.
 */
function compactIssues(zodError: ZodError, rawOutput: unknown): CompactIssue[] {
  return zodError.issues.map((issue): CompactIssue => {
    const compact: CompactIssue = {
      path: issue.path.join(".") || "(root)",
      code: issue.code,
    };
    if (issue.code === "too_big") {
      compact.limit = Number(issue.maximum);
    } else if (issue.code === "too_small") {
      compact.limit = Number(issue.minimum);
    }
    const value = valueAtPath(rawOutput, issue.path);
    if (typeof value === "string") {
      compact.actual = value.length;
    } else if (typeof value === "number") {
      compact.actual = value;
    }
    return compact;
  });
}

/** Logs a specialist failure: a compact issue summary for validation errors. */
function logSpecialistError(specialistId: SpecialistId, error: unknown): void {
  if (error instanceof SpecialistValidationError) {
    const all = compactIssues(error.zodError, error.rawOutput);
    const issues: (CompactIssue | string)[] = all.slice(0, MAX_LOGGED_ISSUES);
    if (all.length > MAX_LOGGED_ISSUES) {
      issues.push(`...and ${all.length - MAX_LOGGED_ISSUES} more`);
    }
    log({
      stage: "specialist_error",
      specialistId,
      errorType: "validation",
      issueCount: all.length,
      issues,
      rawOutputSample: sampleRawOutput(error.rawOutput),
    });
    return;
  }

  log({
    stage: "specialist_error",
    specialistId,
    errorType: "error",
    error: error instanceof Error ? error.message : String(error),
  });
}

export interface OrchestratorInput {
  diff: string;
  prTitle: string;
  prBody: string;
  repo: string;
  model: string;
  apiKey: string;
}

/**
 * Runs all three specialist reviewers concurrently and returns their results.
 *
 * A specialist that throws is logged and dropped: one crashing specialist must
 * not fail the whole review, so this returns whatever partial set succeeded
 * (possibly empty). Results are returned unmerged; synthesis happens later.
 *
 * A completion summary is always logged - including an explicit
 * `allSpecialistsFailed` flag - so a total failure (empty result set) is never
 * silent. The caller decides how to treat an empty set.
 */
export async function runAllSpecialists(
  input: OrchestratorInput
): Promise<SpecialistResult[]> {
  const settled = await Promise.all(
    SPECIALIST_IDS.map(async (specialistId): Promise<SpecialistResult | null> => {
      const promptPath = join(PROMPTS_DIR, `${specialistId}.md`);
      const promptContent = await loadPrompt(promptPath);
      const promptSha = computePromptSha(promptContent);

      const startedAt = new Date().toISOString();
      pushTraceEvent({
        type: "specialist_start",
        specialistId,
        model: input.model,
        promptSha,
        inputTokens: 0,
        startedAt,
      });

      try {
        const result = await runSpecialist({
          specialistId,
          systemPrompt: promptContent,
          ...input,
        });
        pushTraceEvent({
          type: "specialist_end",
          specialistId,
          model: input.model,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          latencyMs: result.latencyMs,
          rawFindings: result.response.findings,
          validationResult: "ok",
          endedAt: new Date().toISOString(),
        });
        return result;
      } catch (error: unknown) {
        logSpecialistError(specialistId, error);
        // Emit a failed specialist_end so the trace records the attempt.
        const validationErrors =
          error instanceof SpecialistValidationError
            ? error.zodError.issues.map((i) => `${i.path.join(".")}: ${i.message}`)
            : [error instanceof Error ? error.message : String(error)];
        pushTraceEvent({
          type: "specialist_end",
          specialistId,
          model: input.model,
          inputTokens: 0,
          outputTokens: 0,
          latencyMs: 0,
          rawFindings: [],
          validationResult: "failed",
          validationErrors,
          endedAt: new Date().toISOString(),
        });
        return null;
      }
    })
  );

  const results = settled.filter(
    (result): result is SpecialistResult => result !== null
  );
  log({
    stage: "specialists_complete",
    ran: SPECIALIST_IDS.length,
    succeeded: results.length,
    failed: SPECIALIST_IDS.length - results.length,
    allSpecialistsFailed: results.length === 0,
  });

  return results;
}
