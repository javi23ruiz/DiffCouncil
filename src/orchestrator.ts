import { join } from "node:path";

import type { ZodError } from "zod";

import { log } from "./log.js";
import {
  runSpecialist,
  SpecialistValidationError,
  type SpecialistId,
  type SpecialistResult,
} from "./reviewers/base.js";

// Prompts live in prompts/ at the repo root. The bundled action (dist/index.js)
// sits one level under the repo root, so "../prompts/<id>.md" relative to the
// bundle directory resolves to the repo-root prompts/ folder. `__dirname` is
// provided natively in the CJS bundle esbuild produces.
const PROMPTS_DIR = join(__dirname, "..", "prompts");

export const SPECIALIST_IDS: readonly SpecialistId[] = [
  "security",
  "correctness",
  "maintainability",
];

/** Most issues we expand in a log line before collapsing the rest into a count. */
const MAX_LOGGED_ISSUES = 5;
/** Characters of raw model output we sample into the log for debugging. */
const RAW_OUTPUT_SAMPLE_CHARS = 500;

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
      rawOutputSample: JSON.stringify(error.rawOutput ?? null).slice(
        0,
        RAW_OUTPUT_SAMPLE_CHARS
      ),
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
 */
export async function runAllSpecialists(
  input: OrchestratorInput
): Promise<SpecialistResult[]> {
  const settled = await Promise.all(
    SPECIALIST_IDS.map(async (specialistId): Promise<SpecialistResult | null> => {
      try {
        return await runSpecialist({
          specialistId,
          systemPromptPath: join(PROMPTS_DIR, `${specialistId}.md`),
          ...input,
        });
      } catch (error: unknown) {
        logSpecialistError(specialistId, error);
        return null;
      }
    })
  );

  return settled.filter((result): result is SpecialistResult => result !== null);
}
