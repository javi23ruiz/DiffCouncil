export interface PostprocessContext {
  owner: string;
  repo: string;
  headSha: string;
}

// Matches a backticked token that contains at least one slash and ends in
// ":<digits>", e.g. `src/index.ts:42`. The slash requirement means bare
// identifiers (`runReview`) and colon-bearing snippets without a path
// (`key: value`) are left untouched.
const PATH_LINE_PATTERN = /`([^`\n]*\/[^`\n]*):(\d+)`/g;

/**
 * Rewrites a raw review from the model into the final comment markdown.
 *
 * Every backticked `path/to/file.ext:LINE` reference is turned into a link
 * to that line on the PR's head commit, preserving the backticks in the
 * visible link text.
 */
export function postprocessReview(
  review: string,
  ctx: PostprocessContext
): string {
  return review.replace(
    PATH_LINE_PATTERN,
    (_match: string, path: string, line: string): string =>
      `[\`${path}:${line}\`](https://github.com/${ctx.owner}/${ctx.repo}/blob/${ctx.headSha}/${path}#L${line})`
  );
}
