import { readFile } from "node:fs/promises";

import * as core from "@actions/core";
import { Octokit } from "@octokit/rest";
import { z } from "zod";

import { truncateDiff } from "./context.js";
import { fetchPullRequest, upsertReviewComment } from "./github.js";
import { runReview } from "./reviewer.js";

const DEFAULT_MODEL = "claude-sonnet-4-6";

/** Shape of the `pull_request` webhook payload, validated at the boundary. */
const PullRequestEventSchema = z.object({
  repository: z.object({
    name: z.string(),
    owner: z.object({ login: z.string() }),
  }),
  pull_request: z.object({ number: z.number() }),
});

/** Emits one structured JSON log line, prefixed with "sentinel: ". */
function log(entry: Record<string, unknown>): void {
  console.log(`sentinel: ${JSON.stringify(entry)}`);
}

async function main(): Promise<void> {
  const start = Date.now();

  try {
    const apiKey = core.getInput("anthropic-api-key", { required: true });
    const githubToken = core.getInput("github-token", { required: true });
    const model = core.getInput("model") || DEFAULT_MODEL;

    const eventName = process.env["GITHUB_EVENT_NAME"];
    if (eventName !== "pull_request") {
      log({ stage: "skip", reason: "event is not pull_request", event: eventName ?? null });
      return;
    }

    const eventPath = process.env["GITHUB_EVENT_PATH"];
    if (!eventPath) {
      throw new Error("GITHUB_EVENT_PATH is not set");
    }

    const rawEvent = await readFile(eventPath, "utf8");
    const event = PullRequestEventSchema.parse(JSON.parse(rawEvent));
    const owner = event.repository.owner.login;
    const repo = event.repository.name;
    const prNumber = event.pull_request.number;

    const octokit = new Octokit({ auth: githubToken });

    const pr = await fetchPullRequest(octokit, owner, repo, prNumber);
    log({
      stage: "fetch",
      prNumber,
      diffBytes: Buffer.byteLength(pr.diff, "utf8"),
      author: pr.author,
    });

    const truncation = truncateDiff(pr.diff);
    log({
      stage: "truncate",
      originalTokens: truncation.originalTokens,
      keptTokens: truncation.keptTokens,
      truncated: truncation.truncated,
    });

    const result = await runReview({
      diff: truncation.diff,
      prTitle: pr.title,
      prBody: pr.body,
      repo: `${owner}/${repo}`,
      model,
      apiKey,
    });
    log({
      stage: "review",
      model,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      latencyMs: result.latencyMs,
    });

    const comment = await upsertReviewComment(
      octokit,
      owner,
      repo,
      prNumber,
      result.review
    );
    log({ stage: "comment", action: comment.action, commentId: comment.commentId });
  } catch (error: unknown) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  } finally {
    log({ stage: "done", ms: Date.now() - start });
  }
}

void main();
