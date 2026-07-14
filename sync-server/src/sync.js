import { newId, nowIso, safeEqual, sha256Hex, signSession, verifySession } from './auth.js';
import { error, json } from './cors.js';

const SESSION_DAYS = 30;
const ENTITY_TABLE = {
  team: 'team_records',
  qual_match: 'qual_matches',
  prescout: 'prescout_records',
  match_observation: 'match_observations',
};

function bearerToken(request) {
  const h = request.headers.get('Authorization') || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : '';
}

export async function requireSession(request, env) {
  const token = bearerToken(request);
  const secret = env.SESSION_SECRET;
  if (!secret) return { errorResponse: error(500, 'SESSION_SECRET not configured') };
  const payload = await verifySession(token, secret);
  if (!payload?.deviceId || !payload?.eventId) {
    return { errorResponse: error(401, 'Invalid or expired session') };
  }
  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare(
    'SELECT token_hash, device_id, event_id, display_name, expires_at FROM sessions WHERE token_hash = ?'
  )
    .bind(tokenHash)
    .first();
  if (!row) return { errorResponse: error(401, 'Session revoked or unknown') };
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return { errorResponse: error(401, 'Session expired') };
  }
  await env.DB.prepare('UPDATE devices SET last_seen_at = ? WHERE id = ?')
    .bind(nowIso(), payload.deviceId)
    .run();
  return {
    session: {
      token,
      tokenHash,
      deviceId: payload.deviceId,
      eventId: payload.eventId,
      displayName: row.display_name || payload.displayName || '',
    },
  };
}

export async function handleJoin(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return error(400, 'Invalid JSON');
  }
  const inviteCode = String(body.inviteCode || '').trim();
  const displayName = String(body.displayName || body.scoutName || 'Scout').trim().slice(0, 80);
  const label = String(body.deviceLabel || body.label || 'phone').trim().slice(0, 80);
  const eventId = String(body.eventId || env.DEFAULT_EVENT_ID || '').trim();
  if (!inviteCode || !eventId) return error(400, 'inviteCode and eventId are required');

  const event = await env.DB.prepare(
    'SELECT id, name, year, timezone, invite_code FROM events WHERE id = ?'
  )
    .bind(eventId)
    .first();
  if (!event) return error(404, 'Event not found');
  if (!safeEqual(event.invite_code, inviteCode)) return error(403, 'Invalid invite code');

  const secret = env.SESSION_SECRET;
  if (!secret) return error(500, 'SESSION_SECRET not configured');

  const deviceId = String(body.deviceId || newId());
  const now = nowIso();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();

  const existing = await env.DB.prepare('SELECT id FROM devices WHERE id = ?').bind(deviceId).first();
  if (existing) {
    await env.DB.prepare(
      'UPDATE devices SET event_id = ?, display_name = ?, label = ?, last_seen_at = ? WHERE id = ?'
    )
      .bind(eventId, displayName, label, now, deviceId)
      .run();
  } else {
    await env.DB.prepare(
      'INSERT INTO devices (id, event_id, display_name, label, last_seen_at) VALUES (?, ?, ?, ?, ?)'
    )
      .bind(deviceId, eventId, displayName, label, now)
      .run();
  }

  const tokenPayload = {
    deviceId,
    eventId,
    displayName,
    exp: Math.floor(new Date(expiresAt).getTime() / 1000),
  };
  const token = await signSession(tokenPayload, secret);
  const tokenHash = await sha256Hex(token);
  await env.DB.prepare(
    'INSERT OR REPLACE INTO sessions (token_hash, device_id, event_id, display_name, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)'
  )
    .bind(tokenHash, deviceId, eventId, displayName, now, expiresAt)
    .run();

  return json({
    token,
    deviceId,
    eventId,
    displayName,
    expiresAt,
    event: {
      id: event.id,
      name: event.name,
      year: event.year,
      timezone: event.timezone,
    },
  });
}

function stripPhotos(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  const copy = { ...payload };
  if ('photoDataUrl' in copy) copy.photoDataUrl = '';
  return copy;
}

async function appendChangeLog(db, { eventId, entity, entityId, operation, revision, payload, deletedAt }) {
  await db
    .prepare(
      `INSERT INTO change_log (event_id, entity, entity_id, operation, revision, payload_json, deleted_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      eventId,
      entity,
      entityId,
      operation,
      revision,
      JSON.stringify(payload ?? null),
      deletedAt || null,
      nowIso()
    )
    .run();
}

async function loadEntity(db, entity, entityId) {
  const table = ENTITY_TABLE[entity];
  if (!table) return null;
  return db.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(entityId).first();
}

async function applyUpsert(db, session, op) {
  const entity = op.entityType;
  const entityId = op.entityId;
  const table = ENTITY_TABLE[entity];
  if (!table) return { status: 'rejected', error: `Unknown entityType: ${entity}` };

  const baseRevision = Number(op.baseRevision ?? 0);
  const existing = await loadEntity(db, entity, entityId);
  const payload = stripPhotos(op.payload || {});
  const deletedAt = op.operation === 'delete' ? nowIso() : null;

  if (existing && Number(existing.revision) !== baseRevision && entity !== 'match_observation') {
    return {
      status: 'conflict',
      conflictId: newId(),
      serverRecord: {
        id: existing.id,
        revision: existing.revision,
        updatedAt: existing.updated_at,
        payload: JSON.parse(existing.payload_json),
        deletedAt: existing.deleted_at,
      },
      rejectedPayload: payload,
    };
  }

  // Append-only match observations: always insert new revision path without conflict on base
  if (entity === 'match_observation' && existing && Number(existing.revision) !== baseRevision) {
    // Still allow update if same id and client sends higher intent — treat as conflict for safety
    return {
      status: 'conflict',
      conflictId: newId(),
      serverRecord: {
        id: existing.id,
        revision: existing.revision,
        updatedAt: existing.updated_at,
        payload: JSON.parse(existing.payload_json),
        deletedAt: existing.deleted_at,
      },
      rejectedPayload: payload,
    };
  }

  const nextRevision = existing ? Number(existing.revision) + 1 : 1;
  const updatedAt = op.clientCreatedAt || nowIso();
  const eventId = session.eventId;

  if (entity === 'team') {
    const teamNumber = Number(payload.teamNumber);
    if (!Number.isInteger(teamNumber) || teamNumber < 1) {
      return { status: 'rejected', error: 'Invalid teamNumber' };
    }
    await db
      .prepare(
        `INSERT INTO team_records (id, event_id, team_number, payload_json, revision, updated_at, updated_by, device_id, deleted_at, schema_version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           payload_json = excluded.payload_json,
           revision = excluded.revision,
           updated_at = excluded.updated_at,
           updated_by = excluded.updated_by,
           device_id = excluded.device_id,
           deleted_at = excluded.deleted_at,
           schema_version = excluded.schema_version`
      )
      .bind(
        entityId,
        eventId,
        teamNumber,
        JSON.stringify(payload),
        nextRevision,
        updatedAt,
        session.displayName,
        session.deviceId,
        deletedAt,
        Number(payload.schemaVersion || 1)
      )
      .run();
  } else if (entity === 'qual_match') {
    const matchKey = String(payload.matchId || payload.matchKey || '').trim();
    if (!matchKey) return { status: 'rejected', error: 'Missing matchId' };
    await db
      .prepare(
        `INSERT INTO qual_matches (id, event_id, match_key, payload_json, revision, updated_at, updated_by, device_id, deleted_at, schema_version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           match_key = excluded.match_key,
           payload_json = excluded.payload_json,
           revision = excluded.revision,
           updated_at = excluded.updated_at,
           updated_by = excluded.updated_by,
           device_id = excluded.device_id,
           deleted_at = excluded.deleted_at,
           schema_version = excluded.schema_version`
      )
      .bind(
        entityId,
        eventId,
        matchKey,
        JSON.stringify(payload),
        nextRevision,
        updatedAt,
        session.displayName,
        session.deviceId,
        deletedAt,
        Number(payload.schemaVersion || 1)
      )
      .run();
  } else if (entity === 'prescout') {
    const teamNumber = Number(payload.teamNumber);
    if (!Number.isInteger(teamNumber) || teamNumber < 1) {
      return { status: 'rejected', error: 'Invalid teamNumber' };
    }
    await db
      .prepare(
        `INSERT INTO prescout_records (id, event_id, team_number, payload_json, revision, updated_at, updated_by, device_id, deleted_at, schema_version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           payload_json = excluded.payload_json,
           revision = excluded.revision,
           updated_at = excluded.updated_at,
           updated_by = excluded.updated_by,
           device_id = excluded.device_id,
           deleted_at = excluded.deleted_at,
           schema_version = excluded.schema_version`
      )
      .bind(
        entityId,
        eventId,
        teamNumber,
        JSON.stringify(payload),
        nextRevision,
        updatedAt,
        session.displayName,
        session.deviceId,
        deletedAt,
        Number(payload.schemaVersion || 1)
      )
      .run();
  } else if (entity === 'match_observation') {
    const teamNumber = Number(payload.teamNumber);
    if (!Number.isInteger(teamNumber) || teamNumber < 1) {
      return { status: 'rejected', error: 'Invalid teamNumber' };
    }
    await db
      .prepare(
        `INSERT INTO match_observations (id, event_id, team_number, match_key, payload_json, revision, updated_at, updated_by, device_id, deleted_at, schema_version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           payload_json = excluded.payload_json,
           revision = excluded.revision,
           updated_at = excluded.updated_at,
           updated_by = excluded.updated_by,
           device_id = excluded.device_id,
           deleted_at = excluded.deleted_at,
           schema_version = excluded.schema_version`
      )
      .bind(
        entityId,
        eventId,
        teamNumber,
        payload.matchKey || payload.matchNumber || null,
        JSON.stringify(payload),
        nextRevision,
        updatedAt,
        session.displayName,
        session.deviceId,
        deletedAt,
        Number(payload.schemaVersion || 1)
      )
      .run();
  }

  await appendChangeLog(db, {
    eventId,
    entity,
    entityId,
    operation: deletedAt ? 'delete' : 'upsert',
    revision: nextRevision,
    payload,
    deletedAt,
  });

  return {
    status: 'ok',
    entityId,
    revision: nextRevision,
    updatedAt,
  };
}

export async function handlePush(request, env, session) {
  let body;
  try {
    body = await request.json();
  } catch {
    return error(400, 'Invalid JSON');
  }
  const ops = body.operations;
  if (!Array.isArray(ops)) return error(400, 'operations must be an array');
  if (ops.length > 50) return error(400, 'Batch too large (max 50)');

  const results = [];
  for (const op of ops) {
    const operationId = String(op.operationId || '');
    if (!operationId) {
      results.push({ operationId: null, status: 'rejected', error: 'Missing operationId' });
      continue;
    }
    if (String(op.eventId || session.eventId) !== session.eventId) {
      results.push({ operationId, status: 'rejected', error: 'eventId mismatch' });
      continue;
    }

    const prior = await env.DB.prepare(
      'SELECT result_json FROM processed_operations WHERE operation_id = ?'
    )
      .bind(operationId)
      .first();
    if (prior) {
      results.push({ operationId, ...JSON.parse(prior.result_json), idempotentReplay: true });
      continue;
    }

    let result;
    try {
      result = await applyUpsert(env.DB, session, {
        ...op,
        entityType: op.entityType,
        entityId: op.entityId,
        operation: op.operation || 'upsert',
      });
    } catch (e) {
      result = { status: 'rejected', error: String(e.message || e) };
    }

    await env.DB.prepare(
      'INSERT INTO processed_operations (operation_id, device_id, result_json, processed_at) VALUES (?, ?, ?, ?)'
    )
      .bind(operationId, session.deviceId, JSON.stringify(result), nowIso())
      .run();

    results.push({ operationId, ...result });
  }

  return json({ results });
}

export async function handlePull(request, env, session) {
  const url = new URL(request.url);
  const eventId = url.searchParams.get('eventId') || session.eventId;
  if (eventId !== session.eventId) return error(403, 'eventId not allowed for this session');
  const cursor = Number(url.searchParams.get('cursor') || 0);
  const limit = Math.min(Number(url.searchParams.get('limit') || 200), 500);

  const { results } = await env.DB.prepare(
    `SELECT seq, entity, entity_id, operation, revision, payload_json, deleted_at, created_at
     FROM change_log
     WHERE event_id = ? AND seq > ?
     ORDER BY seq ASC
     LIMIT ?`
  )
    .bind(eventId, cursor, limit)
    .all();

  const changes = (results || []).map((r) => ({
    seq: r.seq,
    entity: r.entity,
    entityId: r.entity_id,
    operation: r.operation,
    revision: r.revision,
    payload: JSON.parse(r.payload_json),
    deletedAt: r.deleted_at,
    createdAt: r.created_at,
  }));

  const nextCursor = changes.length ? changes[changes.length - 1].seq : cursor;
  return json({
    changes,
    cursor: nextCursor,
    hasMore: changes.length === limit,
  });
}

export async function handleSnapshot(request, env, session, eventId) {
  if (eventId !== session.eventId) return error(403, 'eventId not allowed for this session');

  const event = await env.DB.prepare(
    'SELECT id, name, year, timezone FROM events WHERE id = ?'
  )
    .bind(eventId)
    .first();
  if (!event) return error(404, 'Event not found');

  const teams = await env.DB.prepare(
    'SELECT team_number, display_name, division FROM event_teams WHERE event_id = ? ORDER BY team_number'
  )
    .bind(eventId)
    .all();

  const teamRecords = await env.DB.prepare(
    'SELECT id, team_number, payload_json, revision, updated_at, deleted_at FROM team_records WHERE event_id = ?'
  )
    .bind(eventId)
    .all();

  const quals = await env.DB.prepare(
    'SELECT id, match_key, payload_json, revision, updated_at, deleted_at FROM qual_matches WHERE event_id = ?'
  )
    .bind(eventId)
    .all();

  const prescout = await env.DB.prepare(
    'SELECT id, team_number, payload_json, revision, updated_at, deleted_at FROM prescout_records WHERE event_id = ?'
  )
    .bind(eventId)
    .all();

  const matchObs = await env.DB.prepare(
    'SELECT id, team_number, match_key, payload_json, revision, updated_at, deleted_at FROM match_observations WHERE event_id = ?'
  )
    .bind(eventId)
    .all();

  const cursorRow = await env.DB.prepare(
    'SELECT COALESCE(MAX(seq), 0) AS max_seq FROM change_log WHERE event_id = ?'
  )
    .bind(eventId)
    .first();

  return json({
    event,
    roster: (teams.results || []).map((t) => ({
      teamNumber: t.team_number,
      teamName: t.display_name,
      division: t.division,
    })),
    teamRecords: (teamRecords.results || []).map((r) => ({
      id: r.id,
      teamNumber: r.team_number,
      revision: r.revision,
      updatedAt: r.updated_at,
      deletedAt: r.deleted_at,
      payload: JSON.parse(r.payload_json),
    })),
    qualMatches: (quals.results || []).map((r) => ({
      id: r.id,
      matchKey: r.match_key,
      revision: r.revision,
      updatedAt: r.updated_at,
      deletedAt: r.deleted_at,
      payload: JSON.parse(r.payload_json),
    })),
    prescout: (prescout.results || []).map((r) => ({
      id: r.id,
      teamNumber: r.team_number,
      revision: r.revision,
      updatedAt: r.updated_at,
      deletedAt: r.deleted_at,
      payload: JSON.parse(r.payload_json),
    })),
    matchObservations: (matchObs.results || []).map((r) => ({
      id: r.id,
      teamNumber: r.team_number,
      matchKey: r.match_key,
      revision: r.revision,
      updatedAt: r.updated_at,
      deletedAt: r.deleted_at,
      payload: JSON.parse(r.payload_json),
    })),
    cursor: cursorRow?.max_seq || 0,
    snapshotAt: nowIso(),
  });
}
