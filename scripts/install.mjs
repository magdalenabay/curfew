#!/usr/bin/env node
// Copies src/ into ~/.claude/usage-guard/ and wires statusLine + the
// UserPromptSubmit and PostToolUse hooks into ~/.claude/settings.json,
// backing up the original settings file first. Safe to re-run.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import url from 'node:url';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const claudeDir = path.join(os.homedir(), '.claude');
const settingsPath = path.join(claudeDir, 'settings.json');
const installDir = path.join(claudeDir, 'usage-guard');

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

const ourStatusLine = 'node ~/.claude/usage-guard/statusline.mjs';
if (settings.statusLine && settings.statusLine.command !== ourStatusLine) {
  console.log('\nA different statusLine command is already configured — leaving it as-is.');
  console.log('Add this manually if you want the usage-guard status line too:');
  console.log(JSON.stringify({ type: 'command', command: ourStatusLine }, null, 2));
} else {
  settings.statusLine = { type: 'command', command: ourStatusLine };
}

// Removes any hook group under `eventName` left over from an older
// version of this tool (e.g. tool-guard.mjs before it was replaced by
// tool-guard.sh), then wires in the current one. Keyed on the
// "usage-guard/" path prefix so any past or present usage-guard script
// name is recognized, not just the exact one we're about to add.
function wireHook(eventName, command) {
  settings.hooks ||= {};
  settings.hooks[eventName] ||= [];
  settings.hooks[eventName] = settings.hooks[eventName].filter(
    (group) => !(group.hooks || []).every((h) => h.command && h.command.includes('usage-guard/'))
  );
  settings.hooks[eventName].push({ hooks: [{ type: 'command', command }] });
}

wireHook('UserPromptSubmit', 'node ~/.claude/usage-guard/prompt-guard.mjs');
wireHook('PostToolUse', 'bash ~/.claude/usage-guard/tool-guard.sh');

fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
console.log(`\nWired into ${settingsPath}`);
console.log('Restart Claude Code (or start a new session) to pick it up.');
