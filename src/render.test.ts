import { describe, expect, it } from "vitest";

import { renderReview, type RenderStats } from "./render.js";
import type { Finding, ReviewResponse } from "./schema.js";

const ctx = { owner: "javi23ruiz", repo: "DiffCouncil", headSha: "abc123" };

const stats: RenderStats = {
  specialistCount: 3,
  rawFindingCount: 5,
  synthesizedCount: 2,
};

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    file: "src/a.ts",
    lineStart: 1,
    lineEnd: 1,
    severity: "medium",
    category: "correctness",
    confidence: 0.5,
    description: "something",
    ...overrides,
  };
}

function review(overrides: Partial<ReviewResponse> = {}): ReviewResponse {
  return {
    summary: "A summary.",
    findings: [],
    verdict: "looks_good",
    ...overrides,
  };
}

describe("renderReview", () => {
  it("sorts findings by severity then confidence", () => {
    const findings: Finding[] = [
      finding({ file: "low.ts", severity: "low", confidence: 0.9 }),
      finding({ file: "crit-lo.ts", severity: "critical", confidence: 0.3 }),
      finding({ file: "crit-hi.ts", severity: "critical", confidence: 0.9 }),
      finding({ file: "high.ts", severity: "high", confidence: 0.5 }),
    ];
    const out = renderReview(review({ findings }), ctx, stats);

    const order = ["crit-hi.ts", "crit-lo.ts", "high.ts", "low.ts"].map((f) =>
      out.indexOf(f)
    );
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("maps each verdict to its emoji label", () => {
    expect(renderReview(review({ verdict: "looks_good" }), ctx, stats)).toContain(
      "**Verdict:** ✅ Looks good"
    );
    expect(
      renderReview(review({ verdict: "comments_to_address" }), ctx, stats)
    ).toContain("**Verdict:** 💬 Comments to address");
    expect(
      renderReview(review({ verdict: "blocking_issues" }), ctx, stats)
    ).toContain("**Verdict:** ⚠️ Blocking issues");
  });

  it("omits the details block when there are no findings", () => {
    const out = renderReview(review({ findings: [] }), ctx, stats);
    expect(out).not.toContain("<details>");
    expect(out).not.toContain("finding(s)");
  });

  it("renders a details block with a clickable line link when findings exist", () => {
    const out = renderReview(
      review({ findings: [finding({ file: "src/b.ts", lineStart: 42, lineEnd: 42 })] }),
      ctx,
      stats
    );
    expect(out).toContain("<details>");
    expect(out).toContain(
      "[`src/b.ts:42`](https://github.com/javi23ruiz/DiffCouncil/blob/abc123/src/b.ts#L42)"
    );
  });

  it("renders the synthesis stats footer", () => {
    const out = renderReview(review({ findings: [finding()] }), ctx, stats);
    expect(out).toContain(
      "*Reviewed by 3 specialists · 5 raw findings synthesized to 2.*"
    );
  });

  it("always includes the roadmap footer line", () => {
    const footer =
      "*Reviewed diff only — no cross-file context yet (see [ROADMAP](./ROADMAP.md)).*";
    expect(
      renderReview(review({ findings: [finding()] }), ctx, stats)
    ).toContain(footer);
    expect(renderReview(review({ findings: [] }), ctx, stats)).toContain(footer);
  });
});
