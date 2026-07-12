import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Absolute path to the repo's prompts/ directory, resolved once relative to
 * this module. The action is built as a single CJS bundle at dist/index.js, one
 * level under the repo root, so "../prompts" resolves there; the same holds when
 * running from src/ under the test runner.
 *
 * `__dirname` only exists in CommonJS. We assert it rather than assume it: if
 * this code is ever loaded as ESM (where `__dirname` is undefined) the path
 * would otherwise resolve silently against the process cwd. Failing loudly turns
 * that latent misconfiguration into an obvious error at startup.
 */
function resolvePromptsDir(): string {
  if (typeof __dirname === "undefined") {
    throw new Error(
      "Cannot resolve the prompts directory: __dirname is undefined. Sentinel " +
        "is built as a CommonJS bundle; loading it as ESM is not supported."
    );
  }
  return join(__dirname, "..", "prompts");
}

export const PROMPTS_DIR = resolvePromptsDir();

/**
 * Loads a prompt file from disk. A missing file becomes an actionable error
 * naming the path; any other error propagates unchanged. Shared by the
 * specialists and the synthesizer so this behaviour (and any future change to
 * it, e.g. retries or a different message) lives in exactly one place.
 *
 * @throws If the prompt file does not exist.
 */
export async function loadPrompt(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      throw new Error(
        `Prompt file not found at ${path}. Expected a .md file under the prompts/ directory.`
      );
    }
    throw error;
  }
}
