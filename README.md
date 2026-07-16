# claude-usage-guard

A tiny Claude Code hook that watches your **5-hour** and **weekly (7-day)**
Claude.ai subscription usage limits and nudges Claude to wrap up work
*before* you get locked out mid-task, instead of finding out when the
session just stops responding.

Everything runs locally. No network calls, no telemetry, no data leaves
your machine — it only reads the usage numbers Claude Code already has and
writes small JSON state files under `~/.claude/usage-guard/`.

## Requirements

- A Claude.ai **Pro or Max** subscription used through Claude Code. The
  underlying `rate_limits` data (see [How it works](#how-it-works)) is only
  present for subscription auth — API-key/console billing sessions don't
  get it, and this tool has nothing to show for them.
- Node.js 18+ (Claude Code already requires Node, so you almost certainly
  have this).
- `bash` on PATH to run the `PostToolUse` hook (`tool-guard.sh`). On
  Windows this means Git Bash — which Claude Code itself already needs to
  run most hook/statusLine commands, so if hooks work at all you have
  this. `jq` is recommended but optional: `tool-guard.sh` uses it for a
  fast pre-check and transparently falls back to always invoking Node if
  `jq` isn't installed, just without the speed-up.

## What it does

- **Status line**: shows a live `5h [▓▓▓▓▓░░░░░] 63% (resets 2:14 PM) · 7d 21%`
  bar, color-coded green/yellow/red at 70%/90%.
- **Proactive nudge, including mid-task**: as you cross configurable
  thresholds (default 70/85/95% for the 5-hour window, 70/90% for the
  weekly window), Claude is told — directly, in its own context — that the
  window is getting tight, roughly how long until it resets, and an
  estimate of how long until you'd hit the cap at your current pace. It's
  told to wrap up or checkpoint the current task now, rather than leaving
  code half-edited. This fires **during** a long autonomous run (after
  every tool call), not only when you send your next message — that's the
  difference between catching it at 85% and finding unfinished work after
  it hit 100% with nobody watching. Each threshold nudges once per window;
  the count resets automatically once Anthropic resets that window.

## How it works

Claude Code's `statusLine` feature is the only place the 5h/7d usage
percentages are exposed (`rate_limits.five_hour.used_percentage`,
`rate_limits.seven_day.used_percentage`, plus `resets_at` timestamps) — they
aren't included in the JSON any hook receives. So:

1. **`statusline.mjs`** runs as your status line, reads that data, renders
   the bar, and persists a snapshot per session to
   `~/.claude/usage-guard/sessions/<session_id>.json` (also used to estimate
   burn rate over time). It refreshes after every assistant message,
   including the intermediate ones inside a long tool-calling turn, so the
   snapshot stays reasonably current mid-task.
2. **`tool-guard.sh`** runs as a `PostToolUse` hook, which fires after
   *every single tool call* — the key piece for mid-task awareness. Since
   that's a lot more often than the other two hooks fire, it's a small
   bash+jq script rather than Node: it does a cheap check against the
   state file (has any threshold been freshly crossed and not yet
   nudged?) and exits immediately on the common answer of "no" — which is
   most tool calls, since there are only ever ~5 possible crossings per
   rate-limit window. Only when the answer might be "yes" does it spawn
   **`tool-guard-core.mjs`**, which has the real threshold/ETA/state logic
   (identical to what a pure-Node version would do), and returns
   `hookSpecificOutput.additionalContext` in its JSON output. Claude Code
   injects that next to the tool result, and Claude reads it and can act
   on it in the same turn — no need to wait for you to send another
   message.
3. **`prompt-guard.mjs`** runs as a `UserPromptSubmit` hook (fires right
   before each of your messages is processed) as a fallback for turns with
   no tool calls at all, where `tool-guard.sh` never gets a chance to
   fire. It shares the same state file and threshold-tracking, so a
   crossing already announced mid-task by `tool-guard.sh` won't be
   repeated here. Its plain-text stdout is added to Claude's context too —
   `UserPromptSubmit` (along with `SessionStart` and `UserPromptExpansion`)
   is one of the few hook events where that's documented to happen; for
   most other hooks stdout only goes to a debug log.

## Install

Manual setup, so you can see exactly what's changing before it changes it:

```bash
# 1. Copy the scripts somewhere Claude Code will find them
cp -r src ~/.claude/usage-guard

# 2. Merge settings.snippet.json into ~/.claude/settings.json by hand
```

Or use the installer, which backs up your existing `settings.json` before
touching it:

```bash
node scripts/install.mjs
```

Then restart Claude Code (or start a new session).

## Configuring

Copy `config.example.json` to `~/.claude/usage-guard/config.json` and edit:

```json
{
  "thresholds": {
    "five_hour": [70, 85, 95],
    "seven_day": [70, 90]
  },
  "bar": { "width": 10 }
}
```

Set a window's threshold list to `[]` to disable nudging for it entirely
(the status line keeps showing it either way).

## Testing without waiting on real usage

Both scripts just read JSON from stdin, so you can feed them mock data
directly:

```bash
echo '{"model":{"display_name":"Opus"},"session_id":"test-1","rate_limits":{"five_hour":{"used_percentage":92,"resets_at":9999999999},"seven_day":{"used_percentage":40,"resets_at":9999999999}}}' | node src/statusline.mjs

echo '{"session_id":"test-1","tool_name":"Edit"}' | bash src/tool-guard.sh

echo '{"session_id":"test-1"}' | node src/prompt-guard.mjs
```

Run either of the last two commands again — you should see the nudge
once, then silence until a higher threshold is crossed or the window
resets, and neither hook re-announces a crossing the other already
reported.

## Uninstall

Remove the `statusLine` entry and the `usage-guard/prompt-guard.mjs` and
`usage-guard/tool-guard.sh` hooks from `~/.claude/settings.json`, then
delete `~/.claude/usage-guard/`.

## License

MIT
