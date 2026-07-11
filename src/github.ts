import type { Octokit } from "@octokit/rest";

export const REVIEW_COMMENT_MARKER = "<!-- sentinel:review -->";

export interface PullRequestData {
  title: string;
  body: string;
  baseSha: string;
  headSha: string;
  author: string;
  diff: string;
}

export type UpsertReviewCommentResult =
  | { action: "created"; commentId: number }
  | { action: "updated"; commentId: number };

/**
 * Fetches a pull request's metadata and its raw unified diff.
 *
 * Makes two Octokit calls: `pulls.get` for the PR metadata (title, body,
 * base/head SHAs, author), and a second `pulls.get` call requesting the
 * `diff` media type to retrieve the raw unified diff as text.
 *
 * @returns The PR's title, body (empty string if the API returned null),
 * base and head commit SHAs, author login, and the raw unified diff string.
 */
export async function fetchPullRequest(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number
): Promise<PullRequestData> {
  const { data: pullRequest } = await octokit.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
  });

  // The `diff` media type changes the response body to a raw diff string at
  // runtime, but Octokit's types don't reflect that per-media-type, so the
  // response data is cast from the (incorrect) generated PullRequest type.
  const diffResponse = await octokit.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
    mediaType: { format: "diff" },
  });
  const diff = diffResponse.data as unknown as string;

  return {
    title: pullRequest.title,
    body: pullRequest.body ?? "",
    baseSha: pullRequest.base.sha,
    headSha: pullRequest.head.sha,
    author: pullRequest.user.login,
    diff,
  };
}

/**
 * Finds a previously posted Sentinel review comment on a pull request.
 *
 * Lists all issue comments on the PR via `issues.listComments`, paginating
 * through every page, and matches on a body containing
 * {@link REVIEW_COMMENT_MARKER}.
 *
 * @returns The comment ID of the first matching comment, or `null` if no
 * Sentinel comment exists yet.
 */
export async function findExistingReviewComment(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number
): Promise<number | null> {
  const comments = await octokit.paginate(octokit.issues.listComments, {
    owner,
    repo,
    issue_number: prNumber,
  });

  const existing = comments.find((comment) =>
    comment.body?.includes(REVIEW_COMMENT_MARKER)
  );

  return existing?.id ?? null;
}

/**
 * Posts a new Sentinel review comment on a pull request, or updates the
 * existing one if Sentinel has already commented.
 *
 * Prepends {@link REVIEW_COMMENT_MARKER} to `body` before writing so that
 * future calls to {@link findExistingReviewComment} can find it. Looks up
 * an existing comment via {@link findExistingReviewComment}; if found, calls
 * `issues.updateComment`, otherwise `issues.createComment`.
 *
 * @returns The action taken (`"created"` or `"updated"`) and the resulting
 * comment ID.
 */
export async function upsertReviewComment(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
  body: string
): Promise<UpsertReviewCommentResult> {
  const fullBody = `${REVIEW_COMMENT_MARKER}\n\n${body}`;

  const existingCommentId = await findExistingReviewComment(
    octokit,
    owner,
    repo,
    prNumber
  );

  if (existingCommentId !== null) {
    const { data } = await octokit.issues.updateComment({
      owner,
      repo,
      comment_id: existingCommentId,
      body: fullBody,
    });
    return { action: "updated", commentId: data.id };
  }

  const { data } = await octokit.issues.createComment({
    owner,
    repo,
    issue_number: prNumber,
    body: fullBody,
  });
  return { action: "created", commentId: data.id };
}
