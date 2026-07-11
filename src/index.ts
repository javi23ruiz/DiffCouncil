import { readFile } from "node:fs/promises";

import * as core from "@actions/core";
import { Octokit } from "@octokit/rest";
import { z } from "zod";

import { summarizeDiff, truncateDiff } from "./context.js";
import { formatUsageFooter } from "./cost.js";
import { fetchPullRequest, upsertReviewComment } from "./github.js";
import { log } from "./log.js";
import { runAllSpecialists, SPECIALIST_IDS } from "./orchestrator.js";
import { renderReview } from "./render.js";
import { synthesize } from "./synthesizer.js";

const DEFAULT_MODEL = "claude-sonnet-4-6";

/** Shape of the `pull_request` webhook payload, validated at the boundary. */
const PullRequestEventSchema = z.object({
  repository: z.object({
    name: z.string(),
    owner: z.object({ login: z.string() }),
  }),
  pull_request: z.object({ number: z.number() }),
});

async function main(): Promise<void> {
  const start = Date.now();

  try {
    const apiKey = core.getInput("anthropic-api-key", { required: true });
    const githubToken = core.getInput("github-token", { required: true });
    const model = core.getInput("model") || DEFAULT_MODEL;
    // The synthesizer can run on a different model than the specialists. It
    // defaults to the same model for now; whether Opus reasons over the merged
    // claims meaningfully better than Sonnet here is worth A/B testing.
    const synthModel = process.env["SENTINEL_SYNTH_MODEL"] || model;

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

    const results = await runAllSpecialists({
      diff: truncation.diff,
      prTitle: pr.title,
      prBody: pr.body,
      repo: `${owner}/${repo}`,
      model,
      apiKey,
    });
    for (const result of results) {
      log({
        stage: "specialist",
        specialistId: result.specialistId,
        model,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        latencyMs: result.latencyMs,
      });
    }

    const rawFindingCount = results.reduce(
      (sum, result) => sum + result.response.findings.length,
      0
    );

    const synthesis = await synthesize({
      specialistResults: results,
      diffSummary: summarizeDiff(truncation.diff),
      model: synthModel,
      apiKey,
    });
    log({
      stage: "synthesize",
      model: synthModel,
      inputTokens: synthesis.usage.inputTokens,
      outputTokens: synthesis.usage.outputTokens,
      latencyMs: synthesis.latencyMs,
      mergedCount: synthesis.mergedCount,
      droppedCount: synthesis.droppedCount,
      addedCount: synthesis.addedCount,
    });
    if (synthesis.addedCount > 0) {
      // The synthesizer emitted more findings than survived the confidence
      // filter, so it invented some. Its prompt forbids this; surface it loudly
      // rather than letting it pass as a normal run.
      log({
        stage: "synthesize_anomaly",
        reason: "synthesizer emitted findings not present in the specialist input",
        addedCount: synthesis.addedCount,
      });
    }

    const totalUsage = [...results, synthesis].reduce(
      (acc, part) => ({
        inputTokens: acc.inputTokens + part.usage.inputTokens,
        outputTokens: acc.outputTokens + part.usage.outputTokens,
      }),
      { inputTokens: 0, outputTokens: 0 }
    );
    log({
      stage: "usage_total",
      specialistsRan: SPECIALIST_IDS.length,
      specialistsSucceeded: results.length,
      inputTokens: totalUsage.inputTokens,
      outputTokens: totalUsage.outputTokens,
    });

    const review = renderReview(
      synthesis.response,
      { owner, repo, headSha: pr.headSha },
      {
        specialistCount: results.length,
        rawFindingCount,
        synthesizedCount: synthesis.response.findings.length,
      }
    );
    const footer = formatUsageFooter(model, totalUsage);
    const comment = await upsertReviewComment(
      octokit,
      owner,
      repo,
      prNumber,
      `${review}\n\n${footer}`
    );
    log({ stage: "comment", action: comment.action, commentId: comment.commentId });
  } catch (error: unknown) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  } finally {
    log({ stage: "done", ms: Date.now() - start });
  }
}

void main();
