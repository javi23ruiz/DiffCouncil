import { join } from "node:path";

import {
  runSpecialist,
  type SpecialistId,
  type SpecialistResult,
} from "./reviewers/base.js";

// Prompts live in prompts/ at the repo root. The bundled action (dist/index.js)
// sits one level under the repo root, so "../prompts/<id>.md" relative to the
// bundle directory resolves to the repo-root prompts/ folder. `__dirname` is
// provided natively in the CJS bundle esbuild produces.
const PROMPTS_DIR = join(__dirname, "..", "prompts");

const SPECIALIST_IDS: readonly SpecialistId[] = [
  "security",
  "correctness",
  "maintainability",
];

export interface OrchestratorInput {
  diff: string;
  prTitle: string;
  prBody: string;
  repo: string;
  model: string;
  apiKey: string;
}

/** Emits one structured JSON log line, prefixed with "sentinel: ". */
function log(entry: Record<string, unknown>): void {
  console.log(`sentinel: ${JSON.stringify(entry)}`);
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
        log({
          stage: "specialist_error",
          specialistId,
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      }
    })
  );

  return settled.filter((result): result is SpecialistResult => result !== null);
}
