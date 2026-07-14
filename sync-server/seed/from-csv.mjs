#!/usr/bin/env node
/**
 * Convert a teams CSV into seed/china-event.json (keeps existing event metadata).
 * CSV columns: teamNumber,teamName,division  (header required)
 *
 *   node seed/from-csv.mjs path/to/teams.csv
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const csvPath = process.argv[2];
const outPath = join(__dirname, 'china-event.json');
const examplePath = join(__dirname, 'china-event.example.json');

if (!csvPath || !existsSync(csvPath)) {
  console.error('Usage: node seed/from-csv.mjs path/to/teams.csv');
  process.exit(1);
}

const base = existsSync(outPath)
  ? JSON.parse(readFileSync(outPath, 'utf8'))
  : JSON.parse(readFileSync(examplePath, 'utf8'));

const lines = readFileSync(csvPath, 'utf8').trim().split(/\r?\n/);
const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
const numIdx = header.findIndex((h) => h.includes('number') || h === 'team' || h === 'teamnumber');
const nameIdx = header.findIndex((h) => h.includes('name'));
const divIdx = header.findIndex((h) => h.includes('division') || h === 'div');
if (numIdx < 0) {
  console.error('CSV needs a team number column');
  process.exit(1);
}

const teams = [];
for (let i = 1; i < lines.length; i++) {
  const cols = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
  const num = parseInt(cols[numIdx], 10);
  if (!Number.isInteger(num)) continue;
  teams.push({
    teamNumber: num,
    teamName: nameIdx >= 0 ? cols[nameIdx] || '' : '',
    division: divIdx >= 0 ? cols[divIdx] || '' : '',
  });
}

base.teams = teams;
delete base._comment;
writeFileSync(outPath, JSON.stringify(base, null, 2) + '\n');
console.log(`Wrote ${teams.length} teams to ${outPath}`);
console.log(`Invite code: ${base.event.inviteCode}  event: ${base.event.id}`);
