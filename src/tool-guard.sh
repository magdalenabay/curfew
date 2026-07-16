#!/usr/bin/env bash
# Claude Code PostToolUse hook entrypoint. Fires after EVERY tool call,
# so this stays a cheap bash+jq check that exits fast on the common case
# (nothing to report) and only spawns tool-guard-core.mjs — which has the
# real threshold/ETA/state-mutation logic — when a threshold might
# actually have been freshly crossed.
#
# Requires jq. If jq isn't on PATH, falls back to always invoking the
# Node script (i.e. behaves exactly like the old Node-only hook, just
# without the speed-up).
set -u

input=$(cat)

node_home="${USERPROFILE:-$HOME}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v jq >/dev/null 2>&1; then
  printf '%s' "$input" | node "$here/tool-guard-core.mjs"
  exit 0
fi

session_id=$(printf '%s' "$input" | jq -r '.session_id // empty' 2>/dev/null)
[ -z "$session_id" ] && exit 0

safe_id=$(printf '%s' "$session_id" | tr -c 'a-zA-Z0-9_-' '_')
state_file="$node_home/.claude/usage-guard/sessions/$safe_id.json"
config_file="$node_home/.claude/usage-guard/config.json"

[ -f "$state_file" ] || exit 0

default_thresholds='{"five_hour":[70,85,95],"seven_day":[70,90]}'
if [ -f "$config_file" ]; then
  thresholds=$(jq -c --argjson d "$default_thresholds" '$d * (.thresholds // {})' "$config_file" 2>/dev/null)
  [ -z "$thresholds" ] && thresholds="$default_thresholds"
else
  thresholds="$default_thresholds"
fi

# "maybe" errs toward true (invoke node) on any doubt — a false positive
# just costs a wasted node spawn, a false negative would silently drop a
# real nudge, which is the outcome that actually matters to avoid.
maybe=$(jq -r --argjson th "$thresholds" '
  . as $state |
  ( .rate_limits // {} ) as $rl |
  ["five_hour", "seven_day"] | any(. as $win |
    ($rl[$win].used_percentage) as $pct |
    (($th[$win] // [])) as $t |
    (($state.nudged[$win] // [])) as $done |
    ($pct != null) and ((([$t[] | select(. <= $pct)]) - $done | length) > 0)
  )
' "$state_file" 2>/dev/null)
[ -z "$maybe" ] && maybe=true

if [ "$maybe" = "true" ]; then
  printf '%s' "$input" | node "$here/tool-guard-core.mjs"
fi
