#!/usr/bin/env node
// Copies src/ into ~/.claude/usage-guard/ and wires statusLine + the
// UserPromptSubmit hook into ~/.claude/settings.json, backing up the
// original settings file first. Safe to re-run.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import url from 'node:url';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const claudeDir = path.join(os.homedir(), '.claude');
const settingsPath = path.join(claudeDir, 'settings.json');
const installDir = path.join(claudeDir, 'usage-guard');

fs.mkdirSync(installDir, { recursive: true });
fs.cpSync(path.join(repoRoot, 'src'), installDir, { recursive: true });
console.log(`Copied scripts to ${installDir}`);

let settings = {};
if (fs.existsSync(settingsPath)) {
  const backupPath = `${settingsPath}.bak-${Date.now()}`;
  fs.copyFileSync(settingsPath, backupPath);
  console.log(`Backed up existing settings to ${backupPath}`);
  settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
}

if (settings.statusLine) {
  console.log('\nA statusLine command is already configured — leaving it as-is.');
  console.log('Add this manually if you want the usage-guard status line too:');
  console.log(JSON.stringify({ type: 'command', command: 'node ~/.claude/usage-guard/statusline.mjs' }, null, 2));
} else {
  settings.statusLine = { type: 'command', command: 'node ~/.claude/usage-guard/statusline.mjs' };
}

settings.hooks ||= {};
settings.hooks.UserPromptSubmit ||= [];
const alreadyWired = settings.hooks.UserPromptSubmit.some((group) =>
  (group.hooks || []).some((h) => h.command && h.command.includes('usage-guard/prompt-guard.mjs'))
);
if (!alreadyWired) {
  settings.hooks.UserPromptSubmit.push({
    hooks: [{ type: 'command', command: 'node ~/.claude/usage-guard/prompt-guard.mjs' }]
  });
}

fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
console.log(`\nWired into ${settingsPath}`);
console.log('Restart Claude Code (or start a new session) to pick it up.');
