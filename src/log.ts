/**
 * Structured logging for the action. Every entry is emitted as one JSON line
 * prefixed with "sentinel: ", so log sinks can parse it and humans can scan it.
 * Kept here rather than inlined per module so there is a single place to change
 * the format (and the sanitization below).
 *
 * Entries routinely carry model- and PR-author-controlled strings (error
 * messages, sampled raw tool output). JSON.stringify already escapes quotes and
 * C0 control characters, but it leaves the Unicode line separators U+2028,
 * U+2029, and U+0085 intact; some sinks treat those as line terminators, which
 * would let hostile content forge additional log lines. We escape them so each
 * entry is guaranteed to occupy exactly one physical line.
 */
const LINE_SEPARATORS = /[\u2028\u2029\u0085]/g;

export function log(entry: Record<string, unknown>): void {
  const line = JSON.stringify(entry).replace(
    LINE_SEPARATORS,
    (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`
  );
  console.log(`sentinel: ${line}`);
}
