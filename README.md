# claude-usage-guard

A tiny, dependency-free Claude Code hook that watches your **5-hour** and
**weekly (7-day)** Claude.ai subscription usage limits and nudges Claude to
wrap up work *before* you get locked out mid-task, instead of finding out
when the session just stops responding.

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

## What it does

- **Status line**: shows a live `5h [▓▓▓▓▓░░░░░] 63% (resets 2:14 PM) · 7d 21%`
  bar, color-coded green/yellow/red at 70%/90%.
- **Proactive nudge**: as you cross configurable thresholds (default 70/85/95%
  for the 5-hour window, 70/90% for the weekly window), Claude is told —
  directly, in its own context — that the window is getting tight, roughly
  how long until it resets, and an estimate of how long until you'd hit the
  cap at your current pace. It's asked to consider wrapping up and
  summarizing progress. Each threshold nudges once per window; the count
  resets automatically once Anthropic resets that window.

## How it works

Claude Code's `statusLine` feature is the only place the 5h/7d usage
percentages are exposed (`rate_limits.five_hour.used_percentage`,
`rate_limits.seven_day.used_percentage`, plus `resets_at` timestamps) — they
aren't included in the JSON any hook receives. So:

1. **`statusline.mjs`** runs as your status line, reads that data, renders
   the bar, and persists a snapshot per session to
   `~/.claude/usage-guard/sessions/<session_id>.json` (also used to estimate
   burn rate over time).
2. **`prompt-guard.mjs`** runs as a `UserPromptSubmit` hook (fires right
   before each of your messages is processed). It reads that same state
   file and, if a threshold's been freshly crossed, prints a plain-text
   message to stdout.

The reason this works: for most hook events, stdout is only written to a
debug log. `UserPromptSubmit` (along with `SessionStart` and
`UserPromptExpansion`) is a documented exception — its stdout is *added to
Claude's context*, so this is genuinely visible to the model, not just a
line in your terminal.

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

echo '{"session_id":"test-1"}' | node src/prompt-guard.mjs
```

Run the second command a few times with the state file already primed by
the first — you should see the nudge message once, then silence until a
higher threshold is crossed or the window resets.

## Uninstall

Remove the `statusLine` entry and the `usage-guard/prompt-guard.mjs` hook
from `~/.claude/settings.json`, then delete `~/.claude/usage-guard/`.

## License

MIT
