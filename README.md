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

- **Status line**: `5h [▓▓▓▓▓░░░░░] 63% (resets 2:14 PM) · 7d [▓▓░░░░░░░░] 21% (resets Thu 9:00 AM) · cache [▓▓▓▓▓▓▓▓▓░] 91% (cold in 3:41) · ctx [▓▓▓▓▓▓░░░░] 62% · 124k/200k`,
  color-coded green/yellow/red at 70%/90%. Reset times carry a day
  (`tomorrow`/`Thu`/`Aug 23`) whenever the window doesn't reset today, since
  the weekly one is usually days out.
- **Context meter**, so you see `/compact` coming — see
  [Context meter](#context-meter) below.
- **Prompt-cache meter**, because a cold cache spends your windows on work
  you already paid for — see [Prompt cache](#prompt-cache) below.
- **Nudges Claude directly**, in its own context, as you cross configurable
  thresholds (default 70/85/95% for the 5-hour window, 70/90% for the
  weekly one) — telling it to wrap up or checkpoint now, with an ETA to the
  cap based on recent burn rate. Fires mid-task (after every tool call),
  not only at your next message, so a long autonomous run gets a chance to
  land cleanly instead of getting cut off mid-edit.

## Prompt cache

Claude Code re-sends the whole conversation on every request and relies on
Anthropic's [prompt cache](https://code.claude.com/docs/en/prompt-caching) so
you're only charged ~0.1x for the part that hasn't changed. The entry lives 5
minutes by default (1 hour on a subscription within its plan usage), every
request refreshes it for free, and a change to the prefix — model, effort,
thinking settings, tool set, system prompt, `CLAUDE.md` — makes the next
request write instead of read. Go quiet long enough and it lapses, and the
next request re-writes the entire prompt at 1.25x (5m) or 2x (1h) input rate.

On a 150k-token context that's a five-figure token bill against the same
5-hour and weekly windows curfew already watches, for zero work. So curfew
reports it:

```
cache [▓▓▓▓▓▓▓▓▓░] 91% (cold in 3:41)        warm, 91% of input served from cache
cache [▓▓▓▓▓▓▓▓░░] 77% (cold in 0:40)        yellow: under warn_seconds left
cache [▓▓▓▓▓▓▓▓▓░] 88% (cold, rebuild 151k)  red: lapsed, and the rebuild is expensive
cache [▓▓▓▓▓░░░░░] 50% (cold, rebuild 20k)   yellow: lapsed, but cheap to rebuild
cache [▓▓▓░░░░░░░] 30% (not cached)          last response reported no cache tokens
cache off                                    caching disabled, or the provider doesn't report it
```

The bar is the session's cache hit ratio; the parenthetical is the current
entry's countdown, in `m:ss` inside the last 10 minutes and `46m` beyond it.
Colour tracks cache *health* rather than repeating the bar: green while warm,
yellow once it's nearly up, and red only for a lapsed cache whose rebuild
exceeds `compact_at_tokens` — a cold 20k prompt isn't worth alarming about.

**It also nudges Claude once per lapsed entry**, when the rebuild crosses that
threshold, naming the cost and Claude Code's diagnosis of the last miss
(`tools_changed`, `system_prompt_changed`, `ttl_expired_5m`, …). Claude can't
run `/compact` itself, so the nudge asks it to checkpoint and pass the
suggestion on to you.

All of it comes from the `prompt_cache` object Claude Code puts on the status
line's stdin, which needs **Claude Code 2.1.251+** (miss causes: 2.1.260+).
Older versions simply don't get the segment. Unlike a function-hooks mod — which
is handed only the four raw token counts and has to infer the lifetime by
watching whether a late request still hit — Claude Code has already worked out
the TTL, hit ratio and miss causes, so curfew just reads them.

## Context meter

```
ctx [▓▓▓▓▓▓░░░░] 62% · 124k/200k
```

How full the context window is: input tokens from the last response (fresh
input plus cache reads and writes; output doesn't count) against the model's
window, with the same 70%/90% colours as the usage bars. It reads
`context_window.used_percentage` and `context_window_size` from the status
line's stdin. On Claude Code versions without that object it falls back to the
last assistant message's `usage` in the transcript, against 200k (1M for a
model id ending in `[1m]`). The segment is left out until the first response
lands, and again right after `/compact` until the next one.

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
  "bar": { "width": 10 },
  "cache": {
    "enabled": true,
    "warn_seconds": 60,
    "compact_at_tokens": 100000,
    "show_misses": false,
    "nudge": true
  },
  "context": { "enabled": true }
}
```

Set a window to `[]` to disable nudging for it (status line still shows it).

`cache.warn_seconds` is when the meter turns yellow; `compact_at_tokens` is the
rebuild size above which a lapsed cache goes red and nudges (a judgement call,
not a documented figure — lower it if cache writes are expensive for you);
`show_misses` appends the session's miss count; `enabled: false` drops the
segment entirely and `nudge: false` keeps the meter but stops the nudge.
`context.enabled: false` drops the context meter.

## Testing without waiting on real usage

```bash
echo '{"model":{"display_name":"Opus"},"session_id":"t","rate_limits":{"five_hour":{"used_percentage":92,"resets_at":9999999999}}}' | node src/statusline.mjs
echo '{"model":{"display_name":"Opus"},"session_id":"t","context_window":{"total_input_tokens":124000,"context_window_size":200000,"used_percentage":62}}' | node src/statusline.mjs
echo '{"session_id":"t","tool_name":"Edit"}' | node src/tool-guard.mjs
```

A lapsed, expensive cache — the status line records it, then the guard nudges
on it (and stays quiet on a second call, since it's one nudge per entry):

```bash
echo '{"model":{"display_name":"Opus"},"session_id":"c","prompt_cache":{"warm":false,"caching_observed":true,"ttl":"5m","expires_at":1,"hit_ratio":0.88,"misses":3,"recache_tokens_if_cold":151000,"last_miss_cause":{"causes":["ttl_expired_5m"]}}}' | node src/statusline.mjs
echo '{"session_id":"c"}' | node src/prompt-guard.mjs
```

## Troubleshooting

**Status line/nudges silently don't appear, but the installer ran fine.**
If Node is managed by `nvm` (common on macOS/Linux), the shell Claude Code
uses to run hook/statusLine commands may not source `.zshrc`/`.bashrc` —
so `node` isn't on `PATH` there, even though it works fine in your normal
terminal. The installer auto-detects this and wraps commands in a small
`bash -lc` snippet that sources `nvm.sh` directly, so a plain re-run of
`node scripts/install.mjs` should fix it. Restarting Claude Code fully
(fully quit, not just a new tab/window) is required either way — settings
are only read at startup.

## Uninstall

Remove the `statusLine` entry and the `curfew/prompt-guard.mjs` and
`curfew/tool-guard.mjs` hooks from `~/.claude/settings.json`, then delete
`~/.claude/curfew/`.

## License

MIT
