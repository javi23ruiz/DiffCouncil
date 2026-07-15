import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import * as core from "@actions/core";
import { Octokit } from "@octokit/rest";
import { z } from "zod";

import { summarizeDiff, truncateDiff } from "./context.js";
import { estimateCostUsd, formatUsageFooter } from "./cost.js";
import { fetchPullRequest, upsertReviewComment } from "./github.js";
import { log } from "./log.js";
import { runAllSpecialists, SPECIALIST_IDS } from "./orchestrator.js";
import { renderReview } from "./render.js";
import { assignFindingId } from "./schema.js";
import { synthesize } from "./synthesizer.js";
import {
  pushTraceEvent,
  resetTrace,
  writeTraceFile,
  type ModelBreakdown,
} from "./trace.js";

const DEFAULT_MODEL = "claude-sonnet-4-6";

/**
 * Model identifiers are external input (an action input, or the
 * SENTINEL_SYNTH_MODEL env var) that we forward straight to the Anthropic API,
 * so they are validated at the boundary rather than trusted. This accepts the
 * Anthropic model-id shape (e.g. "claude-sonnet-4-6") without pinning an
 * allowlist of exact ids, which would need editing every model release.
 */
const ModelNameSchema = z
  .string()
  .regex(
    /^claude-[a-z0-9]+(?:[.-][a-z0-9]+)*$/,
    'must be a Claude model id such as "claude-sonnet-4-6"'
  );

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
  const startedAtIso = new Date().toISOString();
  const runId = randomUUID();
  resetTrace();

  try {
    const apiKey = core.getInput("anthropic-api-key", { required: true });
    const githubToken = core.getInput("github-token", { required: true });
    const model = ModelNameSchema.parse(core.getInput("model") || DEFAULT_MODEL);
    // The synthesizer can run on a different model than the specialists. It
    // defaults to the same model for now; whether Opus reasons over the merged
    // claims meaningfully better than Sonnet here is worth A/B testing.
    const synthModel = ModelNameSchema.parse(
      process.env["SENTINEL_SYNTH_MODEL"] || model
    );

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

    // Emitted only after the fetch so headSha carries the real commit the
    // review ran against; the dashboard's per-finding permalinks depend on it.
    // `timestamp` uses startedAtIso (captured at function entry) so it still
    // reflects run start, not the post-fetch moment.
    pushTraceEvent({
      type: "run_start",
      runId,
      timestamp: startedAtIso,
      prNumber,
      repo: `${owner}/${repo}`,
      headSha: pr.headSha,
      model,
      synthModel,
    });

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

    const diffSummary = summarizeDiff(truncation.diff);
    pushTraceEvent({
      type: "context_construction",
      diffFiles: diffSummary.filesTouched,
      diffLineCount: truncation.diffLineCount,
      truncatedFiles: truncation.truncatedFiles,
      skippedFiles: truncation.skippedFiles,
      finalDiffTokens: truncation.keptTokens,
    });

    const results = await runAllSpecialists({
      diff: truncation.diff,
      prTitle: pr.title,
      prBody: pr.body,
      repo: `${owner}/${repo}`,
      model,
      apiKey,
    });

    // Assign stable finding IDs.
    for (const result of results) {
      result.response.findings = result.response.findings.map((f) =>
        assignFindingId(result.specialistId, f)
      );
      log({
        stage: "specialist",
        specialistId: result.specialistId,
        model,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        latencyMs: result.latencyMs,
      });
    }

    // Every specialist failed: there is nothing to synthesize. Abort loudly
    // instead of running the synthesizer over zero findings, which would post a
    // misleading "looks good" review. Per-specialist errors were already logged.
    if (results.length === 0) {
      throw new Error(
        `All ${SPECIALIST_IDS.length} specialists failed; aborting review. See the specialist_error log entries above for details.`
      );
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

    pushTraceEvent({
      type: "synthesizer_reasoning",
      model: synthModel,
      inputTokens: synthesis.usage.inputTokens,
      outputTokens: synthesis.usage.outputTokens,
      latencyMs: synthesis.latencyMs,
      rawInputFindingCount: rawFindingCount,
      duplicateGroups: synthesis.duplicateGroups,
      droppedFindings: synthesis.droppedFindings,
      keptFindings: synthesis.response.findings,
      verdict: synthesis.response.verdict,
      verdictRationale: synthesis.response.summary,
    });

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

    pushTraceEvent({
      type: "comment",
      action: comment.action,
      commentId: comment.commentId,
    });

    // Build cost breakdown for trace.
    const modelBreakdown: ModelBreakdown[] = [];
    const modelsSeen = new Map<string, { inputTokens: number; outputTokens: number }>();
    for (const result of results) {
      const key = model;
      const acc = modelsSeen.get(key) ?? { inputTokens: 0, outputTokens: 0 };
      acc.inputTokens += result.usage.inputTokens;
      acc.outputTokens += result.usage.outputTokens;
      modelsSeen.set(key, acc);
    }
    {
      const acc = modelsSeen.get(synthModel) ?? { inputTokens: 0, outputTokens: 0 };
      acc.inputTokens += synthesis.usage.inputTokens;
      acc.outputTokens += synthesis.usage.outputTokens;
      modelsSeen.set(synthModel, acc);
    }
    let totalCostUsd = 0;
    for (const [m, u] of modelsSeen) {
      const cost = estimateCostUsd(m, u) ?? 0;
      totalCostUsd += cost;
      modelBreakdown.push({
        model: m,
        inputTokens: u.inputTokens,
        outputTokens: u.outputTokens,
        costUsd: cost,
      });
    }

    const totalMs = Date.now() - start;
    pushTraceEvent({
      type: "run_end",
      ms: totalMs,
      totalCostUsd,
      modelBreakdown,
    });

    await writeTraceFile(runId, synthesis.response.verdict, synthesis.response.findings.length);
  } catch (error: unknown) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  } finally {
    log({ stage: "done", ms: Date.now() - start });
  }
}

void main();
