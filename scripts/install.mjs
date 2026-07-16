#!/usr/bin/env node
// Copies src/ into ~/.claude/curfew/ and wires statusLine + the
// UserPromptSubmit and PostToolUse hooks into ~/.claude/settings.json,
// backing up the original settings file first. Safe to re-run.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import url from 'node:url';

console.log('Installing curfew...\n');

const here = path.dirname(url.fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const claudeDir = path.join(os.homedir(), '.claude');
const settingsPath = path.join(claudeDir, 'settings.json');
const installDir = path.join(claudeDir, 'curfew');

// Clear out previously-installed script files (lib/ and any top-level
// .mjs/.sh) before copying, so a script renamed or removed since a past
// install (e.g. old tool-guard.mjs) doesn't linger alongside the current
// ones. sessions/ and a user's own config.json live in this same
// directory but aren't scripts, so the extension/name filter leaves them
// untouched.
fs.mkdirSync(installDir, { recursive: true });
fs.rmSync(path.join(installDir, 'lib'), { recursive: true, force: true });
for (const entry of fs.readdirSync(installDir)) {
  if (entry.endsWith('.mjs') || entry.endsWith('.sh')) {
    fs.rmSync(path.join(installDir, entry), { force: true });
  }
}
fs.cpSync(path.join(repoRoot, 'src'), installDir, { recursive: true });
console.log(`Copied scripts to ${installDir}`);

let settings = {};
if (fs.existsSync(settingsPath)) {
  const backupPath = `${settingsPath}.bak-${Date.now()}`;
  fs.copyFileSync(settingsPath, backupPath);
  console.log(`Backed up existing settings to ${backupPath}`);
  settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
}

// Matched by script basename rather than the exact path, so an older
// install of this same tool under a previous directory name (e.g. before
// a rename) is recognized as "ours" and migrated instead of being
// mistaken for an unrelated custom statusLine.
const ourStatusLine = 'node ~/.claude/curfew/statusline.mjs';
const looksLikeOurs = (command) => typeof command === 'string' && command.endsWith('/statusline.mjs');
if (settings.statusLine && !looksLikeOurs(settings.statusLine.command)) {
  console.log('\nA different statusLine command is already configured — leaving it as-is.');
  console.log('Add this manually if you want the curfew status line too:');
  console.log(JSON.stringify({ type: 'command', command: ourStatusLine }, null, 2));
} else {
  settings.statusLine = { type: 'command', command: ourStatusLine };
}

// Removes any hook group under `eventName` left over from an older
// version of this tool, then wires in the current one. Matched by script
// basename (e.g. "prompt-guard.mjs") rather than a directory prefix, so
// an install from before a rename of the containing folder — the
// directory name is not stable across versions, the script name is —
// is still recognized and replaced instead of left stale alongside the
// new entry.
function wireHook(eventName, command) {
  const basename = command.split('/').pop();
  settings.hooks ||= {};
  settings.hooks[eventName] ||= [];
  settings.hooks[eventName] = settings.hooks[eventName].filter(
    (group) => !(group.hooks || []).every((h) => h.command && h.command.endsWith(`/${basename}`))
  );
  settings.hooks[eventName].push({ hooks: [{ type: 'command', command }] });
}

wireHook('UserPromptSubmit', 'node ~/.claude/curfew/prompt-guard.mjs');
wireHook('PostToolUse', 'node ~/.claude/curfew/tool-guard.mjs');

fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
console.log(`Wired into ${settingsPath}`);
console.log('\nDone. Restart Claude Code (or start a new session) to pick it up.');
