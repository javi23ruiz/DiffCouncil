import { afterEach, describe, expect, it, vi } from "vitest";

import { log } from "./log.js";

/** Captures everything written via console.log during `fn`. */
function capture(fn: () => void): string[] {
  const lines: string[] = [];
  const spy = vi.spyOn(console, "log").mockImplementation((msg?: unknown) => {
    lines.push(String(msg));
  });
  try {
    fn();
  } finally {
    spy.mockRestore();
  }
  return lines;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("log", () => {
  it("emits one sentinel-prefixed JSON line", () => {
    const line = capture(() => log({ stage: "test", n: 1 }))[0] ?? "";
    expect(line).toBe('sentinel: {"stage":"test","n":1}');
  });

  it("escapes Unicode line separators so hostile content cannot forge a new line", () => {
    // U+2028, U+2029, U+0085 - line terminators JSON.stringify leaves intact.
    const sep =
      String.fromCharCode(0x2028) +
      String.fromCharCode(0x2029) +
      String.fromCharCode(0x0085);
    const payload = `ok${sep}sentinel: {"stage":"forged"}`;

    const line = capture(() => log({ stage: "real", sample: payload }))[0] ?? "";

    // The whole entry stays on one physical line...
    expect(line.split(/\r\n|\r|\n/)).toHaveLength(1);
    // ...and the raw separators are gone, replaced by their \u escapes.
    expect(line).toContain("\\u2028");
    expect(line).toContain("\\u2029");
    expect(line).toContain("\\u0085");
    expect(line).not.toContain(sep);
  });

  it("relies on JSON.stringify to escape quotes and newlines in values", () => {
    const line =
      capture(() => log({ sample: 'quote " and\nnewline' }))[0] ?? "";
    expect(line.split("\n")).toHaveLength(1);
    expect(line).toContain('\\"');
    expect(line).toContain("\\n");
  });
});
