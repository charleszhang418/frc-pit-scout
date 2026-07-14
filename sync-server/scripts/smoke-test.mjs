#!/usr/bin/env node
/**
 * Smoke-test sync API against a running wrangler dev server.
 * Usage: node scripts/smoke-test.mjs [baseUrl]
 */
const base = (process.argv[2] || 'http://127.0.0.1:8787').replace(/\/+$/, '');

async function main() {
  const health = await fetch(`${base}/health`);
  if (!health.ok) throw new Error(`health ${health.status}`);
  console.log('health ok', await health.json());

  const joinRes = await fetch(`${base}/auth/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      inviteCode: 'CHINA2026',
      displayName: 'Smoke Scout',
      eventId: '2026-china-postseason',
      deviceLabel: 'smoke-test',
    }),
  });
  const join = await joinRes.json();
  if (!joinRes.ok) throw new Error(`join failed: ${JSON.stringify(join)}`);
  console.log('joined', join.deviceId, join.eventId);

  const opId = crypto.randomUUID();
  const entityId = `${join.eventId}:team:8214`;
  const pushRes = await fetch(`${base}/sync/push`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${join.token}`,
    },
    body: JSON.stringify({
      operations: [
        {
          operationId: opId,
          deviceId: join.deviceId,
          eventId: join.eventId,
          entityType: 'team',
          entityId,
          operation: 'upsert',
          baseRevision: 0,
          payload: {
            teamNumber: 8214,
            teamName: 'Cyber Unicorn',
            completed: true,
            notes: 'smoke test',
            updatedAt: new Date().toISOString(),
          },
          clientCreatedAt: new Date().toISOString(),
        },
      ],
    }),
  });
  const push = await pushRes.json();
  if (!pushRes.ok) throw new Error(`push failed: ${JSON.stringify(push)}`);
  console.log('push', push.results);

  // Idempotent replay
  const push2 = await fetch(`${base}/sync/push`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${join.token}`,
    },
    body: JSON.stringify({
      operations: [
        {
          operationId: opId,
          deviceId: join.deviceId,
          eventId: join.eventId,
          entityType: 'team',
          entityId,
          operation: 'upsert',
          baseRevision: 0,
          payload: { teamNumber: 8214, notes: 'should not duplicate' },
          clientCreatedAt: new Date().toISOString(),
        },
      ],
    }),
  });
  const push2Body = await push2.json();
  console.log('idempotent replay', push2Body.results?.[0]?.idempotentReplay === true);

  const pullRes = await fetch(`${base}/sync/pull?eventId=${join.eventId}&cursor=0`, {
    headers: { Authorization: `Bearer ${join.token}` },
  });
  const pull = await pullRes.json();
  if (!pullRes.ok) throw new Error(`pull failed: ${JSON.stringify(pull)}`);
  console.log('pull changes', pull.changes?.length, 'cursor', pull.cursor);

  const snapRes = await fetch(`${base}/events/${join.eventId}/snapshot`, {
    headers: { Authorization: `Bearer ${join.token}` },
  });
  const snap = await snapRes.json();
  if (!snapRes.ok) throw new Error(`snapshot failed: ${JSON.stringify(snap)}`);
  console.log('snapshot roster', snap.roster?.length, 'teams', snap.teamRecords?.length);

  console.log('SMOKE OK');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
