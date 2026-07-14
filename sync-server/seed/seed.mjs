#!/usr/bin/env node
/**
 * Seed D1 with an event + roster from seed/china-event.json
 * Usage:
 *   node seed/seed.mjs --local
 *   node seed/seed.mjs --remote
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const seedPath = join(__dirname, 'china-event.json');
const remote = process.argv.includes('--remote');
const local = process.argv.includes('--local') || !remote;

if (!existsSync(seedPath)) {
  console.error('Missing seed/china-event.json');
  process.exit(1);
}

const seed = JSON.parse(readFileSync(seedPath, 'utf8'));
const ev = seed.event;
if (!ev?.id || !ev?.inviteCode) {
  console.error('seed.event.id and seed.event.inviteCode are required');
  process.exit(1);
}

const statements = [];
statements.push(
  `INSERT OR REPLACE INTO events (id, name, year, timezone, invite_code, created_at) VALUES ('${esc(ev.id)}', '${esc(ev.name)}', ${Number(ev.year) || 2026}, '${esc(ev.timezone || 'Asia/Shanghai')}', '${esc(ev.inviteCode)}', datetime('now'));`
);
statements.push(`DELETE FROM event_teams WHERE event_id = '${esc(ev.id)}';`);

for (const t of seed.teams || []) {
  const num = Number(t.teamNumber);
  if (!Number.isInteger(num)) continue;
  statements.push(
    `INSERT INTO event_teams (event_id, team_number, display_name, division) VALUES ('${esc(ev.id)}', ${num}, '${esc(t.teamName || '')}', '${esc(t.division || '')}');`
  );
}

const sqlFile = join(__dirname, '_seed_generated.sql');
const { writeFileSync } = await import('node:fs');
writeFileSync(sqlFile, statements.join('\n') + '\n');

const args = ['d1', 'execute', 'pit-scout', ...(local ? ['--local'] : ['--remote']), '--file', sqlFile];
console.log(`Running: wrangler ${args.join(' ')}`);
const r = spawnSync('npx', ['wrangler', ...args], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
process.exit(r.status ?? 1);

function esc(s) {
  return String(s ?? '').replace(/'/g, "''");
}
