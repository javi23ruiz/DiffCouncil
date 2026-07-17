#!/usr/bin/env bash
# Smoke check for the dashboard build: every committed trace in traces/ must be
# embedded in the built JS bundle, or the deployed site will render structurally
# empty while the build still reports success (the failure mode that shipped an
# empty dashboard once already - see docs/TESTING.md and ADR-010).
#
# Run it from the repo root after building the dashboard:
#   cd dashboard && npm run build && cd .. && ./scripts/check-dashboard-bundle.sh
set -euo pipefail

bundle_dir="dashboard/dist/assets"
if ! ls "$bundle_dir"/index-*.js >/dev/null 2>&1; then
  echo "error: no built bundle in $bundle_dir - run 'npm run build' inside dashboard/ first" >&2
  exit 1
fi

shopt -s nullglob
traces=(traces/*.json)
if [ ${#traces[@]} -eq 0 ]; then
  echo "No trace files in traces/; nothing to check."
  exit 0
fi

missing=0
checked=0
for trace in "${traces[@]}"; do
  # Local test runs drop gitignored fixtures into traces/ (see .gitignore);
  # only committed traces are promised to reach the deployed bundle.
  if git check-ignore -q "$trace"; then
    continue
  fi
  run_id="$(basename "$trace" .json)"
  checked=$((checked + 1))
  if grep -q "$run_id" "$bundle_dir"/index-*.js; then
    echo "ok: trace $run_id is embedded in the bundle"
  else
    echo "error: trace $run_id is missing from the built dashboard bundle" >&2
    missing=1
  fi
done

if [ "$missing" -ne 0 ]; then
  echo "error: the build succeeded but the bundle does not embed every committed trace." >&2
  echo "Deploying it would ship a structurally empty dashboard; failing loudly instead." >&2
  exit 1
fi

echo "Smoke check passed: all $checked committed trace(s) embedded in the bundle."
