# curfew

A tiny Claude Code hook that watches your **5-hour** and **weekly** Claude.ai
usage limits and nudges Claude to wrap up *before* you get cut off mid-task
— including mid-turn, not just when you send your next message. Runs
entirely locally: no network calls, no telemetry.

## Install

```bash
git clone https://github.com/magdalenabay/curfew.git
cd curfew
node scripts/install.mjs
```

Restart Claude Code and you're done. The installer backs up your existing
`~/.claude/settings.json` before touching it, and is safe to re-run.

Prefer to do it by hand? Copy `src/` to `~/.claude/curfew/` and merge
`settings.snippet.json` into your `settings.json` yourself.

## Requirements

- A Claude.ai **Pro or Max** subscription — the underlying usage data isn't
  available for API-key/console billing.
- Node.js 18+ (Claude Code already requires this).

## What it does

- **Status line**: `5h [▓▓▓▓▓░░░░░] 63% (resets 2:14 PM) · 7d 21%`,
  color-coded green/yellow/red at 70%/90%.
- **Nudges Claude directly**, in its own context, as you cross configurable
  thresholds (default 70/85/95% for the 5-hour window, 70/90% for the
  weekly one) — telling it to wrap up or checkpoint now, with an ETA to the
  cap based on recent burn rate. Fires mid-task (after every tool call),
  not only at your next message, so a long autonomous run gets a chance to
  land cleanly instead of getting cut off mid-edit.

## How it works

Claude Code's `statusLine` feature is the only place 5h/7d usage
percentages are exposed — hooks don't get them directly. So `statusline.mjs`
reads them and writes a small per-session state file; `tool-guard.mjs`
(`PostToolUse`, fires after every tool call) and `prompt-guard.mjs`
(`UserPromptSubmit`, fires before each message) both read that state and
nudge Claude once a threshold is freshly crossed, sharing state so neither
repeats a crossing the other already announced. Both use hook mechanisms
that inject their output into Claude's actual context, not just a
terminal-visible log.

## Configuring

Copy `config.example.json` to `~/.claude/curfew/config.json`:

```json
{
  "thresholds": { "five_hour": [70, 85, 95], "seven_day": [70, 90] },
  "bar": { "width": 10 }
}
```

Set a window to `[]` to disable nudging for it (status line still shows it).

## Testing without waiting on real usage

```bash
echo '{"model":{"display_name":"Opus"},"session_id":"t","rate_limits":{"five_hour":{"used_percentage":92,"resets_at":9999999999}}}' | node src/statusline.mjs
echo '{"session_id":"t","tool_name":"Edit"}' | node src/tool-guard.mjs
```

## Uninstall

Remove the `statusLine` entry and the `curfew/prompt-guard.mjs` and
`curfew/tool-guard.mjs` hooks from `~/.claude/settings.json`, then delete
`~/.claude/curfew/`.

## License

MIT
