/* ========================================================
   Pit Scout Sync Client — outbox + push/pull engine
   Depends on: window.PIT_SCOUT_CONFIG, IndexedDB helpers injected via init()
   ======================================================== */
(function (global) {
  'use strict';

  const META_KEYS = {
    deviceId: 'deviceId',
    sessionToken: 'sessionToken',
    eventId: 'eventId',
    cursor: 'cursor',
    displayName: 'displayName',
    lastSyncAt: 'lastSyncAt',
    lastError: 'lastError',
    joinedAt: 'joinedAt',
  };

  let api = null; // injected IndexedDB + hooks
  let state = {
    status: 'local_only', // local_only | offline | syncing | synced | error | conflicts
    pending: 0,
    lastSyncAt: null,
    lastError: null,
    conflicts: [],
    eventId: null,
    displayName: null,
  };
  let syncTimer = null;
  let syncInFlight = false;
  let backoffMs = 2000;
  const listeners = new Set();

  function cfg() {
    return global.PIT_SCOUT_CONFIG || {};
  }

  function baseUrl() {
    return String(cfg().SYNC_API_URL || '').replace(/\/+$/, '');
  }

  function emit() {
    listeners.forEach((fn) => {
      try {
        fn({ ...state });
      } catch (e) {
        console.warn(e);
      }
    });
  }

  function setState(patch) {
    state = { ...state, ...patch };
    emit();
  }

  function newId() {
    if (global.crypto?.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function entityIdFor(entityType, key) {
    const eventId = state.eventId || cfg().DEFAULT_EVENT_ID || 'event';
    if (entityType === 'team') return `${eventId}:team:${key}`;
    if (entityType === 'qual_match') return `${eventId}:qual:${key}`;
    if (entityType === 'prescout') return `${eventId}:prescout:${key}`;
    if (entityType === 'match_observation') return `${eventId}:matchobs:${key}`;
    if (entityType === 'device_assignments') return `${eventId}:device_assignments:${key}`;
    return `${eventId}:${entityType}:${key}`;
  }

  function stripPhoto(rec) {
    if (!rec || typeof rec !== 'object') return rec;
    const copy = { ...rec };
    const had =
      !!(copy.photoDataUrl) ||
      (Array.isArray(copy.photos) && copy.photos.length > 0);
    if (had) copy.hasLocalPhoto = true;
    copy.photoDataUrl = '';
    copy.photos = [];
    return copy;
  }

  async function metaGet(key) {
    return api.syncMetaGet(key);
  }

  async function metaSet(key, value) {
    return api.syncMetaSet(key, value);
  }

  async function ensureDeviceId() {
    let id = await metaGet(META_KEYS.deviceId);
    if (!id) {
      id = newId();
      await metaSet(META_KEYS.deviceId, id);
    }
    return id;
  }

  async function refreshPendingCount() {
    const n = await api.outboxCount();
    setState({ pending: n });
    return n;
  }

  async function enqueue(entityType, entityKey, payload, options = {}) {
    const eventId = (await metaGet(META_KEYS.eventId)) || cfg().DEFAULT_EVENT_ID;
    const deviceId = await ensureDeviceId();
    const entityId = options.entityId || entityIdFor(entityType, entityKey);
    const baseRevision = Number(options.baseRevision ?? payload.syncRevision ?? 0);
    const op = {
      operationId: newId(),
      deviceId,
      eventId,
      entityType,
      entityId,
      operation: options.operation || 'upsert',
      baseRevision,
      payload: entityType === 'team' ? stripPhoto(payload) : payload,
      clientCreatedAt: new Date().toISOString(),
      attemptCount: 0,
      status: 'pending',
    };
    await api.outboxPut(op);
    await refreshPendingCount();
    if (state.status === 'synced') setState({ status: 'offline' });
    scheduleSync(250);
    return op;
  }

  async function apiFetch(path, options = {}) {
    const url = `${baseUrl()}${path}`;
    const headers = { ...(options.headers || {}) };
    if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    const token = await metaGet(META_KEYS.sessionToken);
    if (token && options.auth !== false) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(url, { ...options, headers });
    return res;
  }

  async function probeHealth() {
    if (!baseUrl()) return false;
    try {
      const res = await fetch(`${baseUrl()}/health`, { method: 'GET' });
      return res.ok;
    } catch {
      return false;
    }
  }

  async function join({ inviteCode, displayName, eventId } = {}) {
    const deviceId = await ensureDeviceId();
    const eid = eventId || cfg().DEFAULT_EVENT_ID;
    const res = await apiFetch('/auth/join', {
      method: 'POST',
      auth: false,
      body: JSON.stringify({
        inviteCode,
        displayName: displayName || (await metaGet(META_KEYS.displayName)) || 'Scout',
        deviceId,
        eventId: eid,
        deviceLabel: navigator.userAgent.slice(0, 80),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Join failed (${res.status})`);

    await metaSet(META_KEYS.sessionToken, data.token);
    await metaSet(META_KEYS.eventId, data.eventId);
    await metaSet(META_KEYS.displayName, data.displayName);
    await metaSet(META_KEYS.joinedAt, new Date().toISOString());
    await metaSet(META_KEYS.deviceId, data.deviceId);
    setState({
      eventId: data.eventId,
      displayName: data.displayName,
      lastError: null,
      status: 'offline',
    });

    await pullSnapshot();
    await runSync();
    return data;
  }

  async function pullSnapshot() {
    const eventId = (await metaGet(META_KEYS.eventId)) || cfg().DEFAULT_EVENT_ID;
    const res = await apiFetch(`/events/${encodeURIComponent(eventId)}/snapshot`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Snapshot failed (${res.status})`);
    await api.applySnapshot(data);
    await metaSet(META_KEYS.cursor, data.cursor || 0);
    await metaSet(META_KEYS.lastSyncAt, new Date().toISOString());
    setState({ lastSyncAt: new Date().toISOString(), cursor: data.cursor || 0 });
    return data;
  }

  async function pushOutbox() {
    const batch = await api.outboxList(40);
    if (!batch.length) return { pushed: 0, conflicts: [] };

    const res = await apiFetch('/sync/push', {
      method: 'POST',
      body: JSON.stringify({
        operations: batch.map((op) => ({
          operationId: op.operationId,
          deviceId: op.deviceId,
          eventId: op.eventId,
          entityType: op.entityType,
          entityId: op.entityId,
          operation: op.operation,
          baseRevision: op.baseRevision,
          payload: op.payload,
          clientCreatedAt: op.clientCreatedAt,
        })),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Push failed (${res.status})`);

    const conflicts = [];
    for (const result of data.results || []) {
      if (result.status === 'ok' || result.idempotentReplay) {
        await api.outboxDelete(result.operationId);
        if (result.revision != null && result.entityId) {
          await api.setLocalRevision(result.entityId, result.revision);
        }
      } else if (result.status === 'conflict') {
        conflicts.push(result);
        await api.outboxDelete(result.operationId);
        if (result.serverRecord && api.applyConflictServerRecord) {
          await api.applyConflictServerRecord(result);
        }
      } else {
        const op = batch.find((o) => o.operationId === result.operationId);
        if (op) {
          op.attemptCount = (op.attemptCount || 0) + 1;
          op.lastError = result.error || 'rejected';
          await api.outboxPut(op);
        }
      }
    }
    return { pushed: batch.length, conflicts };
  }

  async function pullChanges() {
    const eventId = (await metaGet(META_KEYS.eventId)) || cfg().DEFAULT_EVENT_ID;
    let cursor = Number((await metaGet(META_KEYS.cursor)) || 0);
    let total = 0;
    for (let i = 0; i < 20; i++) {
      const res = await apiFetch(
        `/sync/pull?eventId=${encodeURIComponent(eventId)}&cursor=${cursor}&limit=200`
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Pull failed (${res.status})`);
      const changes = data.changes || [];
      if (changes.length) await api.applyChanges(changes);
      cursor = data.cursor ?? cursor;
      await metaSet(META_KEYS.cursor, cursor);
      total += changes.length;
      if (!data.hasMore || !changes.length) break;
    }
    return total;
  }

  async function runSync() {
    if (syncInFlight) return;
    if (!(await metaGet(META_KEYS.sessionToken))) {
      await refreshPendingCount();
      setState({ status: 'local_only' });
      return;
    }
    syncInFlight = true;
    setState({ status: 'syncing', lastError: null });
    try {
      const healthy = await probeHealth();
      if (!healthy) throw new Error('Sync server unreachable');
      const { conflicts } = await pushOutbox();
      await pullChanges();
      await refreshPendingCount();
      const pending = state.pending;
      const now = new Date().toISOString();
      await metaSet(META_KEYS.lastSyncAt, now);
      await metaSet(META_KEYS.lastError, '');
      backoffMs = 2000;
      if (conflicts.length) {
        setState({
          status: 'conflicts',
          conflicts,
          lastSyncAt: now,
          pending,
        });
      } else {
        setState({
          status: pending > 0 ? 'offline' : 'synced',
          conflicts: [],
          lastSyncAt: now,
          pending,
        });
      }
      if (api.onSyncComplete) await api.onSyncComplete();
    } catch (e) {
      const msg = String(e.message || e);
      await metaSet(META_KEYS.lastError, msg);
      await refreshPendingCount();
      setState({ status: 'error', lastError: msg });
      backoffMs = Math.min(backoffMs * 2, 60000);
      scheduleSync(backoffMs);
    } finally {
      syncInFlight = false;
    }
  }

  function scheduleSync(delay = 0) {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => runSync(), delay);
  }

  function startBackgroundSync() {
    const interval = Number(cfg().SYNC_INTERVAL_MS) || 15000;
    scheduleSync(1000);
    setInterval(() => runSync(), interval);
    global.addEventListener('online', () => scheduleSync(200));
    global.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') scheduleSync(300);
    });
  }

  async function loadSessionState() {
    const eventId = await metaGet(META_KEYS.eventId);
    const displayName = await metaGet(META_KEYS.displayName);
    const lastSyncAt = await metaGet(META_KEYS.lastSyncAt);
    const lastError = await metaGet(META_KEYS.lastError);
    const token = await metaGet(META_KEYS.sessionToken);
    await refreshPendingCount();
    setState({
      eventId: eventId || cfg().DEFAULT_EVENT_ID || null,
      displayName: displayName || null,
      lastSyncAt: lastSyncAt || null,
      lastError: lastError || null,
      status: token ? (state.pending > 0 ? 'offline' : 'synced') : 'local_only',
    });
  }

  function statusLabel() {
    const n = state.pending;
    switch (state.status) {
      case 'local_only':
        return n ? `Local only — ${n} change(s) not synced` : 'Local only — join event to sync';
      case 'offline':
        return `Offline — ${n} change(s) saved on this device`;
      case 'syncing':
        return n ? `Syncing ${n} change(s)…` : 'Syncing…';
      case 'synced':
        return state.lastSyncAt
          ? `All changes synced at ${new Date(state.lastSyncAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
          : 'All changes synced';
      case 'conflicts':
        return `${state.conflicts.length} conflict(s) need review`;
      case 'error':
        return `Sync failed — ${state.lastError || 'tap for details'}`;
      default:
        return 'Sync status unknown';
    }
  }

  async function init(injected) {
    api = injected;
    await ensureDeviceId();
    await loadSessionState();
    startBackgroundSync();
  }

  global.PitScoutSync = {
    init,
    join,
    runSync,
    enqueue,
    entityIdFor,
    getState: () => ({ ...state }),
    statusLabel,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    probeHealth,
    pullSnapshot,
    META_KEYS,
  };
})(window);
