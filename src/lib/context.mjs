// Context-window meter, from the `context_window` object Claude Code puts on
// the statusLine's stdin: `used_percentage` and `total_input_tokens` (input +
// cache reads + cache writes from the last API response, so output tokens
// don't count) against `context_window_size`.
//
// `used_percentage` is null before the first response and again right after
// /compact, until the next response lands; the segment is simply omitted
// then. Claude Code versions that predate `context_window` get the same
// numbers worked out from the transcript's last assistant `usage` instead.
import fs from 'node:fs';
import { bar, colorFor, fmtTokens, RESET } from './format.mjs';

const DEFAULT_WINDOW = 200_000;
const EXTENDED_WINDOW = 1_000_000;
// The last assistant message is almost always near the end, but a big tool
// result can sit after it, so read a generous tail rather than the last line.
const TAIL_BYTES = 2 * 1024 * 1024;

function windowSizeFor(model) {
  return typeof model?.id === 'string' && model.id.endsWith('[1m]') ? EXTENDED_WINDOW : DEFAULT_WINDOW;
}

function inputTokens(usage) {
  if (!usage || typeof usage !== 'object') return null;
  const n =
    (usage.input_tokens || 0) + (usage.cache_read_input_tokens || 0) + (usage.cache_creation_input_tokens || 0);
  return n > 0 ? n : null;
}

function readTail(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const { size } = fs.fstatSync(fd);
    const len = Math.min(size, TAIL_BYTES);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, size - len);
    return buf.toString('utf8');
  } finally {
    fs.closeSync(fd);
  }
}

// Last main-conversation assistant usage in the transcript, or null. A compact
// boundary found first means the old usage no longer describes the context.
function usageFromTranscript(transcriptPath) {
  if (typeof transcriptPath !== 'string' || !transcriptPath) return null;
  let lines;
  try {
    lines = readTail(transcriptPath).split('\n');
  } catch {
    return null;
  }
  for (let i = lines.length - 1; i >= 0; i--) {
    let entry;
    try {
      entry = JSON.parse(lines[i]);
    } catch {
      continue; // blank, or the partial first line of the tail
    }
    if (entry.type === 'system' && entry.subtype === 'compact_boundary') return null;
    if (entry.type !== 'assistant' || entry.isSidechain) continue;
    const used = inputTokens(entry.message?.usage);
    if (used != null) return used;
  }
  return null;
}

/** { used, size, pct } for the live context window, or null when there's no data yet. */
export function contextUsage(data) {
  const cw = data?.context_window;
  if (cw && typeof cw === 'object') {
    if (typeof cw.used_percentage !== 'number') return null;
    const size = cw.context_window_size > 0 ? cw.context_window_size : windowSizeFor(data.model);
    const used = cw.total_input_tokens > 0 ? cw.total_input_tokens : inputTokens(cw.current_usage);
    return { used, size, pct: Math.round(cw.used_percentage) };
  }

  const used = usageFromTranscript(data?.transcript_path);
  if (used == null) return null;
  const size = windowSizeFor(data.model);
  return { used, size, pct: Math.min(100, Math.round((used / size) * 100)) };
}

/** The status line's context segment, or null when disabled or there's nothing to show. */
export function contextSegment(data, config) {
  if (!config.context.enabled) return null;
  const ctx = contextUsage(data);
  if (!ctx) return null;
  const text = `${colorFor(ctx.pct)}ctx ${bar(ctx.pct, config.bar.width)} ${ctx.pct}%${RESET}`;
  const used = fmtTokens(ctx.used);
  // Single-spaced "·", subordinate to the double-spaced one between segments.
  return used ? `${text} · ${used}/${fmtTokens(ctx.size)}` : text;
}
