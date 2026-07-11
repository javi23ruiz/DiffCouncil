export interface PostprocessContext {
  owner: string;
  repo: string;
  headSha: string;
}

// The literal logo src the reviewer prompt emits, with OWNER/REPO left as
// placeholders for this step to fill in.
const LOGO_PLACEHOLDER = "raw.githubusercontent.com/OWNER/REPO/main/assets/logo.svg";

// Matches a backticked token that contains at least one slash and ends in
// ":<digits>", e.g. `src/index.ts:42`. The slash requirement means bare
// identifiers (`runReview`) and colon-bearing snippets without a path
// (`key: value`) are left untouched.
const PATH_LINE_PATTERN = /`([^`\n]*\/[^`\n]*):(\d+)`/g;

/**
 * Rewrites a raw review from the model into the final comment markdown.
 *
 * Two substitutions are applied:
 * 1. The OWNER/REPO placeholders in the Sentinel logo `<img>` src are replaced
 *    with the real owner and repo. Only the specific logo URL is touched, so
 *    the strings "OWNER"/"REPO" appearing elsewhere in review prose are safe.
 * 2. Every backticked `path/to/file.ext:LINE` reference is turned into a link
 *    to that line on the PR's head commit, preserving the backticks in the
 *    visible link text.
 */
export function postprocessReview(
  review: string,
  ctx: PostprocessContext
): string {
  const withLogo = review.replace(
    LOGO_PLACEHOLDER,
    `raw.githubusercontent.com/${ctx.owner}/${ctx.repo}/main/assets/logo.svg`
  );

  return withLogo.replace(
    PATH_LINE_PATTERN,
    (_match: string, path: string, line: string): string =>
      `[\`${path}:${line}\`](https://github.com/${ctx.owner}/${ctx.repo}/blob/${ctx.headSha}/${path}#L${line})`
  );
}
