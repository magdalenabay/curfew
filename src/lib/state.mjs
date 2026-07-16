import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const STATE_DIR = path.join(os.homedir(), '.claude', 'curfew', 'sessions');
const MAX_HISTORY_SAMPLES = 40;
// One rate-limit window (7 days) plus slack, so we never prune a session
// that's still inside its own weekly window.
const STALE_SESSION_MS = 9 * 24 * 60 * 60 * 1000;

function sessionPath(sessionId) {
  const safe = String(sessionId).replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(STATE_DIR, `${safe}.json`);
}

export function readState(sessionId) {
  try {
    return JSON.parse(fs.readFileSync(sessionPath(sessionId), 'utf8'));
  } catch {
    return { history: {}, nudged: {}, windowResetsAt: {} };
  }
}

export function writeState(sessionId, state) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(sessionPath(sessionId), JSON.stringify(state), 'utf8');
}

export function pruneStaleSessions() {
  let entries;
  try {
    entries = fs.readdirSync(STATE_DIR, { withFileTypes: true });
  } catch {
    return;
  }
  const now = Date.now();
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const full = path.join(STATE_DIR, entry.name);
    try {
      if (now - fs.statSync(full).mtimeMs > STALE_SESSION_MS) fs.unlinkSync(full);
    } catch {
      // lost a race with another process cleaning the same file; ignore
    }
  }
}

export { MAX_HISTORY_SAMPLES };
