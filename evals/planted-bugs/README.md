# Planted-bug eval log

This folder is the informal Phase 1 eval log for Sentinel.

The idea: dogfood Sentinel by opening pull requests against this repo that contain deliberately planted bugs, then record what Sentinel actually did.
Each dogfood PR gets one entry file here tracking:

- the PR number and link,
- what bug(s) were planted,
- what Sentinel caught,
- what it missed,
- any false positives (things it flagged that were not actually bugs).

Over time this becomes a labeled record of Sentinel's real behavior on known-answer inputs.
In Phase 4 this same set of PRs and outcomes becomes the seed dataset for a proper evaluation harness (precision/recall over planted bugs), so keep entries accurate and honest - a missed bug or a false positive recorded now is worth more than a flattering summary.

## How to add an entry

1. Open a PR against this repo that plants one or more bugs.
2. Copy [`000-template.md`](./000-template.md) to `NNN-short-slug.md`, where `NNN` is the next zero-padded number and `short-slug` describes the bugs (e.g. `001-off-by-one-truncation.md`).
3. Fill in every field. Paste Sentinel's actual comment verbatim under "Sentinel's response".
4. Mark caught (Y/N) per planted bug, and list any false positives.

## Conventions

- One file per dogfood PR.
- Number files sequentially; never renumber existing entries.
- Record outcomes as they actually happened, including misses and false positives - this log is only useful if it is truthful.
