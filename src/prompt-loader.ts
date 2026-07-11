import { readFile } from "node:fs/promises";

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
