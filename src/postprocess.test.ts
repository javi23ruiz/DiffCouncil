import { describe, expect, it } from "vitest";

import { postprocessReview } from "./postprocess.js";

const ctx = { owner: "javi23ruiz", repo: "DiffCouncil", headSha: "abc123" };

describe("postprocessReview", () => {
  it("turns a backticked path:line into a clickable link", () => {
    const out = postprocessReview("see `src/index.ts:42` for details", ctx);
    expect(out).toBe(
      "see [`src/index.ts:42`](https://github.com/javi23ruiz/DiffCouncil/blob/abc123/src/index.ts#L42) for details"
    );
  });

  it("does NOT convert a bare backticked identifier without a slash", () => {
    const out = postprocessReview("call `runReview` here", ctx);
    expect(out).toBe("call `runReview` here");
  });

  it("does NOT convert a colon-bearing snippet with no line number", () => {
    const out = postprocessReview("config like `key: value`", ctx);
    expect(out).toBe("config like `key: value`");
  });

  it("links every finding when there are multiple", () => {
    const input = [
      "- `src/a.ts:1` — first",
      "- `pkg/b/c.ts:99` — second",
    ].join("\n");
    const out = postprocessReview(input, ctx);
    expect(out).toContain(
      "[`src/a.ts:1`](https://github.com/javi23ruiz/DiffCouncil/blob/abc123/src/a.ts#L1)"
    );
    expect(out).toContain(
      "[`pkg/b/c.ts:99`](https://github.com/javi23ruiz/DiffCouncil/blob/abc123/pkg/b/c.ts#L99)"
    );
  });
});
