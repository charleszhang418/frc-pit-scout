/* ========================================================
   FRC Pit Scouting App — Hopper Division 2026
   Offline-first, IndexedDB-backed, zero-dependency
   ======================================================== */

(function () {
  'use strict';

  // ───── Team data loaded from teams.csv ─────
  const DIVISIONS = ['Hopper', 'Archimedes', 'Curie', 'Daly', 'Galileo', 'Johnson', 'Milstein', 'Newton'];
  let allCsvTeams = []; // { teamNumber, teamName, division }

  async function loadTeamsCSV() {
    try {
      const resp = await fetch('teams.csv');
      if (!resp.ok) throw new Error('Failed to load teams.csv');
      const text = await resp.text();
      const lines = text.trim().split('\n');
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim());
        const num = parseInt(cols[0], 10);
        if (isNaN(num)) continue;
        allCsvTeams.push({ teamNumber: num, teamName: cols[1] || '', division: cols[2] || '' });
      }
    } catch (e) {
      console.warn('Could not load teams.csv, starting empty:', e);
    }
  }

  // ───── IndexedDB Setup ─────
  const DB_NAME = 'frcPitScout';
  const DB_VERSION = 3;
  const STORE = 'teams';
  const STORE_QUAL = 'qualMatches';
  const STORE_OUTBOX = 'outbox';
  const STORE_SYNC_META = 'syncMeta';
  let db = null;
  let syncEnqueueEnabled = true;

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains(STORE)) {
          d.createObjectStore(STORE, { keyPath: 'teamNumber' });
        }
        if (!d.objectStoreNames.contains(STORE_QUAL)) {
          d.createObjectStore(STORE_QUAL, { keyPath: 'matchId' });
        }
        if (!d.objectStoreNames.contains(STORE_OUTBOX)) {
          d.createObjectStore(STORE_OUTBOX, { keyPath: 'operationId' });
        }
        if (!d.objectStoreNames.contains(STORE_SYNC_META)) {
          d.createObjectStore(STORE_SYNC_META, { keyPath: 'key' });
        }
      };
      req.onsuccess = (e) => { db = e.target.result; resolve(db); };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  function txStore(mode) {
    return db.transaction(STORE, mode).objectStore(STORE);
  }

  function qualTx(mode) {
    return db.transaction(STORE_QUAL, mode).objectStore(STORE_QUAL);
  }

  function outboxTx(mode) {
    return db.transaction(STORE_OUTBOX, mode).objectStore(STORE_OUTBOX);
  }

  function syncMetaTx(mode) {
    return db.transaction(STORE_SYNC_META, mode).objectStore(STORE_SYNC_META);
  }

  function dbGet(key) {
    return new Promise((resolve, reject) => {
      const req = txStore('readonly').get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function dbPutRaw(record) {
    return new Promise((resolve, reject) => {
      const req = txStore('readwrite').put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async function dbPut(record, options = {}) {
    await dbPutRaw(record);
    if (syncEnqueueEnabled && !options.skipOutbox && window.PitScoutSync) {
      try {
        await window.PitScoutSync.enqueue('team', record.teamNumber, record, {
          baseRevision: Number(record.syncRevision || 0),
        });
      } catch (e) {
        console.warn('Outbox enqueue (team) failed:', e);
      }
    }
  }

  function dbGetAll() {
    return new Promise((resolve, reject) => {
      const req = txStore('readonly').getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function dbClear() {
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE, STORE_QUAL, STORE_OUTBOX], 'readwrite');
      tx.objectStore(STORE).clear();
      tx.objectStore(STORE_QUAL).clear();
      tx.objectStore(STORE_OUTBOX).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  function qualGet(matchId) {
    return new Promise((resolve, reject) => {
      const req = qualTx('readonly').get(matchId);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function qualPutRaw(record) {
    return new Promise((resolve, reject) => {
      const req = qualTx('readwrite').put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async function qualPut(record, options = {}) {
    await qualPutRaw(record);
    if (syncEnqueueEnabled && !options.skipOutbox && window.PitScoutSync) {
      try {
        await window.PitScoutSync.enqueue('qual_match', record.matchId, record, {
          baseRevision: Number(record.syncRevision || 0),
        });
      } catch (e) {
        console.warn('Outbox enqueue (qual) failed:', e);
      }
    }
  }

  function qualDelete(matchId) {
    return new Promise((resolve, reject) => {
      const req = qualTx('readwrite').delete(matchId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  function qualGetAll() {
    return new Promise((resolve, reject) => {
      const req = qualTx('readonly').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  function qualClearAll() {
    return new Promise((resolve, reject) => {
      const req = qualTx('readwrite').clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  function outboxPut(op) {
    return new Promise((resolve, reject) => {
      const req = outboxTx('readwrite').put(op);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  function outboxDelete(operationId) {
    return new Promise((resolve, reject) => {
      const req = outboxTx('readwrite').delete(operationId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  function outboxList(limit = 50) {
    return new Promise((resolve, reject) => {
      const req = outboxTx('readonly').getAll();
      req.onsuccess = () => {
        const rows = (req.result || []).sort((a, b) =>
          String(a.clientCreatedAt || '').localeCompare(String(b.clientCreatedAt || ''))
        );
        resolve(rows.slice(0, limit));
      };
      req.onerror = () => reject(req.error);
    });
  }

  function outboxCount() {
    return new Promise((resolve, reject) => {
      const req = outboxTx('readonly').count();
      req.onsuccess = () => resolve(req.result || 0);
      req.onerror = () => reject(req.error);
    });
  }

  function syncMetaGet(key) {
    return new Promise((resolve, reject) => {
      const req = syncMetaTx('readonly').get(key);
      req.onsuccess = () => resolve(req.result ? req.result.value : null);
      req.onerror = () => reject(req.error);
    });
  }

  function syncMetaSet(key, value) {
    return new Promise((resolve, reject) => {
      const req = syncMetaTx('readwrite').put({ key, value });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async function applyRemoteTeamPayload(payload, revision) {
    if (!payload?.teamNumber) return;
    const existing = await dbGet(payload.teamNumber);
    const next = { ...payload, syncRevision: revision };
    if (existing?.photoDataUrl && !next.photoDataUrl) {
      next.photoDataUrl = existing.photoDataUrl;
    }
    await dbPutRaw(next);
  }

  async function applyRemoteQualPayload(payload, revision) {
    if (!payload?.matchId) return;
    await qualPutRaw({ ...payload, syncRevision: revision });
  }

  async function applySyncChanges(changes) {
    syncEnqueueEnabled = false;
    let touchedQual = false;
    try {
      for (const ch of changes) {
        if (ch.deletedAt) {
          if (ch.entity === 'team' && ch.payload?.teamNumber) {
            const t = await dbGet(ch.payload.teamNumber);
            if (t) {
              t.deletedAt = ch.deletedAt;
              t.syncRevision = ch.revision;
              await dbPutRaw(t);
            }
          } else if (ch.entity === 'qual_match' && ch.payload?.matchId) {
            await qualDelete(ch.payload.matchId);
            touchedQual = true;
          } else if (ch.entity === 'prescout' && ch.payload?.teamNumber) {
            deletePrescoutLocal(ch.payload.teamNumber);
          }
          continue;
        }
        if (ch.entity === 'team') {
          await applyRemoteTeamPayload(ch.payload, ch.revision);
        } else if (ch.entity === 'qual_match') {
          await applyRemoteQualPayload(ch.payload, ch.revision);
          touchedQual = true;
        } else if (ch.entity === 'prescout') {
          applyPrescoutRemote(ch.payload, ch.revision);
        }
      }
      if (touchedQual) await rebuildQualFanoutFromStore();
    } finally {
      syncEnqueueEnabled = true;
    }
  }

  function deletePrescoutLocal(teamNumber) {
    delete prescoutData[teamNumber];
    delete prescoutData[String(teamNumber)];
    savePrescoutData();
  }

  function applyPrescoutRemote(payload, revision) {
    if (!payload?.teamNumber) return;
    const key = payload.teamNumber;
    const { teamNumber, syncRevision, ...rest } = payload;
    prescoutData[key] = { ...rest, syncRevision: revision };
    savePrescoutData();
  }

  async function applySyncSnapshot(data) {
    syncEnqueueEnabled = false;
    try {
      if (Array.isArray(data.roster) && data.roster.length) {
        allCsvTeams = data.roster.map((t) => ({
          teamNumber: t.teamNumber,
          teamName: t.teamName || '',
          division: t.division || '',
        }));
        await seedTeams(allCsvTeams);
        const divisions = [...new Set(allCsvTeams.map((t) => t.division).filter(Boolean))];
        refreshDivisionSelect(divisions);
      }
      for (const row of data.teamRecords || []) {
        if (row.deletedAt) continue;
        await applyRemoteTeamPayload(row.payload, row.revision);
      }
      for (const row of data.qualMatches || []) {
        if (row.deletedAt) continue;
        await applyRemoteQualPayload(row.payload, row.revision);
      }
      for (const row of data.prescout || []) {
        if (row.deletedAt) continue;
        applyPrescoutRemote(row.payload, row.revision);
      }
      await rebuildQualFanoutFromStore();
    } finally {
      syncEnqueueEnabled = true;
    }
    await refreshData();
    await renderQualRecentList();
  }

  async function setLocalRevision(entityId, revision) {
    const parts = String(entityId).split(':');
    const kind = parts[1];
    const key = parts.slice(2).join(':');
    if (kind === 'team') {
      const num = parseInt(key, 10);
      const t = await dbGet(num);
      if (t) {
        t.syncRevision = revision;
        await dbPutRaw(t);
      }
    } else if (kind === 'qual') {
      const q = await qualGet(key);
      if (q) {
        q.syncRevision = revision;
        await qualPutRaw(q);
      }
    } else if (kind === 'prescout') {
      const num = parseInt(key, 10);
      const pc = getPrescoutForTeam(num);
      if (pc) {
        pc.syncRevision = revision;
        setPrescoutForTeam(num, pc, { skipOutbox: true });
      }
    }
  }

  function refreshDivisionSelect(divisions) {
    const sel = $('#division-select');
    if (!sel || !divisions?.length) return;
    const current = sel.value;
    const opts = divisions.map((d) => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('');
    sel.innerHTML = opts + '<option value="All">All Divisions</option>';
    if ([...sel.options].some((o) => o.value === current)) sel.value = current;
    else if (divisions[0]) {
      sel.value = divisions[0];
      currentDivision = divisions[0];
      localStorage.setItem('division', currentDivision);
    }
  }

  function makeDefaultRecord(team) {
    return {
      teamNumber: team.teamNumber,
      teamName: team.teamName || '',
      division: team.division || '',
      assignedScout: '',
      updatedAt: '',
      completed: false,
      needsRecheck: false,
      photoDataUrl: '',
      robot: {
        shooterType: '',
        jamNotes: '',
      },
      fuel: {
        scoringRange: '',
        scoringConsistency: '',
        teleopRole: '',
        inactiveHubBehavior: '',
      },
      auto: {
        startLocation: '',
        pathDescription: '',
        fuelEstimate: '',
        climbsL1: '',
        centerLineRisk: '',
        partnerConflicts: '',
      },
      climb: {
        maxClimb: '',
        climbTime: '',
      },
      defense: {
        canPlayDefense: '',
        canHandleDefense: '',
        foulRisk: '',
        knownIssues: '',
        notes: '',
      },
      verification: {
        evidenceLevel: '',
        status: '',
        notes: '',
        matchEvidenceNotes: '',
        lastVerifiedMatch: '',
        confidenceScore: '',
      },
      matchNotes: [],
      notes: '',
    };
  }

  async function seedTeams(teamList) {
    const existing = await dbGetAll();
    const existingMap = new Map(existing.map(t => [t.teamNumber, t]));
    for (const t of teamList) {
      const rec = existingMap.get(t.teamNumber);
      if (!rec) {
        await dbPut(makeDefaultRecord(t), { skipOutbox: true });
      } else if (!rec.division && t.division) {
        rec.division = t.division;
        await dbPut(rec, { skipOutbox: true });
      }
    }
  }

  // ───── State ─────
  let allTeams = [];
  let currentFilter = 'all';
  let currentDivision = 'Hopper';
  let currentSearch = '';
  let currentTeamNumber = null;
  let autosaveTimer = null;
  let assignedTeamNumbers = []; // device-local "my teams"
  let pitMapConfig = null;
  let mapHighlightMineOnly = false;
  let assignSearch = '';
  const ASSIGNED_TEAMS_KEY = 'assignedTeams';

  async function loadAssignedTeams() {
    const raw = await syncMetaGet(ASSIGNED_TEAMS_KEY);
    if (Array.isArray(raw)) {
      assignedTeamNumbers = raw.map(Number).filter((n) => Number.isInteger(n) && n > 0);
    } else {
      assignedTeamNumbers = [];
    }
  }

  async function saveAssignedTeams() {
    const unique = [...new Set(assignedTeamNumbers)].sort((a, b) => a - b);
    assignedTeamNumbers = unique;
    await syncMetaSet(ASSIGNED_TEAMS_KEY, unique);
    updateAssignmentSummaries();
  }

  function isAssignedTeam(teamNumber) {
    return assignedTeamNumbers.includes(Number(teamNumber));
  }

  async function toggleAssignedTeam(teamNumber) {
    const num = Number(teamNumber);
    if (!Number.isInteger(num) || num < 1) return;
    if (isAssignedTeam(num)) {
      assignedTeamNumbers = assignedTeamNumbers.filter((n) => n !== num);
    } else {
      assignedTeamNumbers.push(num);
    }
    await saveAssignedTeams();
    renderAssignTeamList();
    if (currentFilter === 'mine') renderTeamList('dashboard-team-list');
    renderPitMap();
  }

  async function clearAssignedTeams() {
    assignedTeamNumbers = [];
    await saveAssignedTeams();
    renderAssignTeamList();
    if (currentFilter === 'mine') renderTeamList('dashboard-team-list');
    renderPitMap();
  }

  function updateAssignmentSummaries() {
    const n = assignedTeamNumbers.length;
    const countEl = $('#my-teams-count');
    if (countEl) countEl.textContent = `My teams: ${n} — set in Data`;
    const assignCount = $('#assign-count');
    if (assignCount) assignCount.textContent = `Selected: ${n}`;
    const mapSum = $('#map-assign-summary');
    if (mapSum) mapSum.textContent = `My teams: ${n}`;
  }

  async function loadPitMapConfig() {
    try {
      const res = await fetch('./pit-map.json', { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to load pit-map.json');
      const data = await res.json();
      if (!data || !Array.isArray(data.halls)) {
        throw new Error('Invalid pit-map.json shape (need halls[])');
      }
      pitMapConfig = data;
    } catch (e) {
      console.warn('Pit map config load failed:', e);
      pitMapConfig = { eventId: '', halls: [] };
    }
  }

  function teamByNumber(num) {
    return allTeams.find((t) => t.teamNumber === Number(num));
  }

  function teamChipClass(teamNumber) {
    const mine = isAssignedTeam(teamNumber);
    const team = teamByNumber(teamNumber);
    const done = !!(team && team.completed);
    if (mine && done) return 'mine-done';
    if (mine && !done) return 'mine-open';
    if (!mine && done) return 'other-done';
    return 'other-open';
  }

  function renderPitStall(pit) {
    const pitId = escapeHtml(pit.pitId || '');
    const kind = pit.kind || (pit.teamNumber ? 'team' : 'empty');

    if (kind === 'inspection' || kind === 'radio' || kind === 'emt') {
      return `<div class="pit-stall pit-stall-${escapeHtml(kind)}" title="${pitId}">
        <span class="pit-stall-id">${pitId}</span>
        <span class="pit-stall-label">${escapeHtml(pit.label || kind.toUpperCase())}</span>
      </div>`;
    }

    if (kind === 'empty' || !pit.teamNumber) {
      return `<div class="pit-stall pit-stall-empty" title="${pitId}">
        <span class="pit-stall-id">${pitId}</span>
        <span class="pit-stall-label">—</span>
      </div>`;
    }

    const tn = Number(pit.teamNumber);
    const cls = teamChipClass(tn);
    const dimMine = mapHighlightMineOnly && !isAssignedTeam(tn);
    return `<button type="button" class="pit-stall pit-stall-team ${cls}${dimMine ? ' dimmed' : ''}" data-team="${tn}" title="${pitId}">
      <span class="pit-stall-id">${pitId}</span>
      <span class="pit-stall-teamnum">${escapeHtml(tn)}</span>
    </button>`;
  }

  function renderPitColumn(col) {
    if (col.kind === 'aisle') {
      return '<div class="pit-aisle" aria-hidden="true"></div>';
    }
    const pits = Array.isArray(col.pits) ? col.pits : [];
    const hasMine = pits.some((p) => p.teamNumber && isAssignedTeam(p.teamNumber));
    const dimCol = mapHighlightMineOnly && pits.some((p) => p.teamNumber) && !hasMine;
    return `<div class="pit-column${dimCol ? ' dimmed' : ''}${hasMine ? ' has-mine' : ''}" data-col="${escapeHtml(col.id || '')}">
      <div class="pit-column-header">${escapeHtml(col.id || '')}</div>
      <div class="pit-column-stack">${pits.map(renderPitStall).join('')}</div>
    </div>`;
  }

  function renderPitDivision(div) {
    const color = div.color || '#888';
    const columns = Array.isArray(div.columns) ? div.columns : [];
    return `<section class="pit-division" data-division="${escapeHtml(div.id || '')}">
      <header class="pit-division-header" style="background:${escapeHtml(color)}">${escapeHtml(div.label || div.id || '')}</header>
      <div class="pit-division-columns">${columns.map(renderPitColumn).join('')}</div>
    </section>`;
  }

  function renderPitHall(hall) {
    const divisions = Array.isArray(hall.divisions) ? hall.divisions : [];
    return `<section class="pit-hall">
      <h2 class="pit-hall-label">${escapeHtml(hall.label || hall.id || '')}</h2>
      <div class="pit-hall-divisions">${divisions.map(renderPitDivision).join('')}</div>
    </section>`;
  }

  function renderPitMap() {
    const grid = $('#pit-map-grid');
    if (!grid) return;
    if (!pitMapConfig) {
      grid.innerHTML = '<div class="empty-state">Pit map not loaded.</div>';
      return;
    }
    grid.removeAttribute('style');
    const halls = pitMapConfig.halls || [];
    if (!halls.length) {
      grid.innerHTML = '<div class="empty-state">No halls in pit-map.json</div>';
      return;
    }
    grid.innerHTML = `<div class="pit-map-floor">${halls.map(renderPitHall).join('')}</div>`;
    updateAssignmentSummaries();
  }

  function renderAssignTeamList() {
    const list = $('#assign-team-list');
    if (!list) return;
    const q = (assignSearch || '').toLowerCase();
    const teams = allTeams
      .slice()
      .sort((a, b) => a.teamNumber - b.teamNumber)
      .filter((t) => {
        if (!q) return true;
        return (
          String(t.teamNumber).includes(q) ||
          (t.teamName || '').toLowerCase().includes(q)
        );
      });
    if (!teams.length) {
      list.innerHTML = '<div class="empty-state" style="padding:12px">No teams match.</div>';
      updateAssignmentSummaries();
      return;
    }
    list.innerHTML = teams
      .map((t) => {
        const selected = isAssignedTeam(t.teamNumber);
        return `<button type="button" class="assign-team-row${selected ? ' selected' : ''}" data-team="${t.teamNumber}">
          <span class="assign-num">${t.teamNumber}</span>
          <span class="assign-name">${escapeHtml(t.teamName || 'Unknown')}</span>
          <span class="assign-check">${selected ? 'Assigned' : 'Tap to assign'}</span>
        </button>`;
      })
      .join('');
    updateAssignmentSummaries();
  }

  function normalizeCurrentDivision() {
    const raw = localStorage.getItem('division') || 'Hopper';
    const allowed = new Set([...DIVISIONS, 'All']);
    if (allowed.has(raw)) {
      currentDivision = raw;
    } else {
      currentDivision = 'Hopper';
      localStorage.setItem('division', 'Hopper');
    }
  }

  // ───── Global Scout Name ─────
  function getScoutName() { return localStorage.getItem('scoutName') || ''; }
  function setScoutName(name) {
    localStorage.setItem('scoutName', name);
    const el = $('#global-scout-display');
    if (el) el.textContent = name || 'Set name →';
  }

  // ───── Pre-Scout Data (separate from pit scouting) ─────
  let prescoutData = {};   // merged: Export JSON + optional prescouting.json baseline + local edits

  function loadPrescoutData() {
    try {
      const saved = localStorage.getItem('prescoutData');
      if (saved) prescoutData = JSON.parse(saved);
    } catch (e) {
      console.warn('Could not load pre-scout data:', e);
    }
  }

  function savePrescoutData() {
    localStorage.setItem('prescoutData', JSON.stringify(prescoutData));
  }

  /** Empty field: treat as “use baseline” when merging online `prescouting.json`. */
  function prescoutFieldEmpty(v) {
    if (v == null) return true;
    if (typeof v === 'string') return v.trim() === '';
    if (Array.isArray(v)) return v.length === 0;
    return false;
  }

  /** Start from shared baseline; local non-empty values win (per field). */
  function mergePrescoutBaselineIntoLocal(baseTeam, localTeam) {
    const out = baseTeam && typeof baseTeam === 'object' ? { ...baseTeam } : {};
    if (!localTeam || typeof localTeam !== 'object') return out;
    for (const [k, v] of Object.entries(localTeam)) {
      if (prescoutFieldEmpty(v)) continue;
      out[k] = v;
    }
    return out;
  }

  /** Fetch `./prescouting.json` (same shape as Export Pre-Scout JSON) and merge into localStorage. */
  async function mergeOnlinePrescoutBaseline() {
    try {
      const res = await fetch('./prescouting.json', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (!data.teams || typeof data.teams !== 'object') return;
      const ids = Object.keys(data.teams);
      if (ids.length === 0) return;
      for (const tn of ids) {
        const baseTeam = data.teams[tn];
        const num = Number(tn);
        const key = Number.isInteger(num) && num > 0 ? num : tn;
        const local = prescoutData[key] ?? prescoutData[String(key)] ?? prescoutData[tn];
        const merged = mergePrescoutBaselineIntoLocal(baseTeam, local);
        if (typeof key === 'number') {
          delete prescoutData[String(key)];
          delete prescoutData[tn];
        } else {
          delete prescoutData[tn];
        }
        prescoutData[key] = merged;
      }
      savePrescoutData();
    } catch (e) {
      console.warn('Could not merge online pre-scout baseline:', e);
    }
  }

  function prescoutMultiAsArray(val) {
    if (Array.isArray(val)) return val.filter(Boolean);
    if (typeof val === 'string' && val.trim()) {
      return val.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
    }
    return [];
  }

  function getPrescoutForTeam(teamNumber) {
    const raw = prescoutData[teamNumber] ?? prescoutData[String(teamNumber)];
    const def = {
      tier: '',
      shooterType: '',
      autoClimb: '',
      autoRoute: '',
      driverAbility: '',
      inactiveHub: [],
      primaryRole: [],
      summary: '',
    };
    if (!raw) return { ...def };
    return {
      ...def,
      ...raw,
      inactiveHub: prescoutMultiAsArray(raw.inactiveHub ?? raw.inactiveBehavior),
      primaryRole: prescoutMultiAsArray(raw.primaryRole),
    };
  }

  function setPrescoutForTeam(teamNumber, data, options = {}) {
    prescoutData[teamNumber] = data;
    savePrescoutData();
    if (!options.skipOutbox && syncEnqueueEnabled && window.PitScoutSync) {
      const payload = { teamNumber: Number(teamNumber), ...data };
      window.PitScoutSync.enqueue('prescout', teamNumber, payload, {
        baseRevision: Number(data.syncRevision || 0),
      }).catch((e) => console.warn('Outbox enqueue (prescout) failed:', e));
    }
  }

  function savePrescoutFromForm() {
    if (!currentTeamNumber) return;
    const prev = getPrescoutForTeam(currentTeamNumber);
    const data = { ...prev };
    ['presct.tier', 'presct.shooterType', 'presct.autoClimb', 'presct.driverAbility'].forEach((field) => {
      const ctrl = $(`.seg-control[data-field="${field}"]`);
      if (!ctrl) return;
      const key = field.split('.')[1];
      const selected = ctrl.querySelector('.seg-btn.selected');
      data[key] = selected ? selected.dataset.val : '';
    });
    ['presct.inactiveHub', 'presct.primaryRole'].forEach((field) => {
      const ctrl = $(`.seg-control[data-field="${field}"]`);
      if (!ctrl) return;
      const key = field.split('.')[1];
      data[key] = [...ctrl.querySelectorAll('.seg-btn.selected')].map((b) => b.dataset.val);
    });
    const ar = $('#f-presct-autoRoute');
    const sm = $('#f-presct-summary');
    if (ar) data.autoRoute = ar.value.trim();
    if (sm) data.summary = sm.value.trim();
    setPrescoutForTeam(currentTeamNumber, data);
  }

  function populatePresctControls(teamNumber) {
    const p = getPrescoutForTeam(teamNumber);
    ['presct.tier', 'presct.shooterType', 'presct.autoClimb', 'presct.driverAbility'].forEach((field) => {
      const ctrl = $(`.seg-control[data-field="${field}"]`);
      if (!ctrl) return;
      const key = field.split('.')[1];
      const val = p[key] ?? '';
      ctrl.querySelectorAll('.seg-btn').forEach((btn) => {
        btn.classList.toggle('selected', btn.dataset.val === val);
      });
    });
    ['presct.inactiveHub', 'presct.primaryRole'].forEach((field) => {
      const ctrl = $(`.seg-control[data-field="${field}"]`);
      if (!ctrl) return;
      const key = field.split('.')[1];
      const set = new Set(prescoutMultiAsArray(p[key]));
      ctrl.querySelectorAll('.seg-btn').forEach((btn) => {
        btn.classList.toggle('selected', set.has(btn.dataset.val));
      });
    });
    const ar = $('#f-presct-autoRoute');
    const sm = $('#f-presct-summary');
    if (ar) ar.value = p.autoRoute || '';
    if (sm) sm.value = p.summary || '';
  }

  function exportPrescoutJSON() {
    const blob = new Blob([JSON.stringify({ lastUpdated: new Date().toISOString(), teams: prescoutData }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prescouting_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importPrescoutJSON(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (data.teams && typeof data.teams === 'object') {
          prescoutData = data.teams;
          savePrescoutData();
          alert(`Pre-scout data imported for ${Object.keys(data.teams).length} teams.`);
          if (currentTeamNumber) populatePresctControls(currentTeamNumber);
        }
      } catch (e) {
        alert('Invalid pre-scout JSON file.');
      }
    };
    reader.readAsText(file);
  }

  // ───── DOM Refs ─────
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // ───── Navigation ─────
  function switchView(name) {
    $$('.view').forEach(v => v.classList.remove('active'));
    $$('.nav-btn').forEach(b => b.classList.remove('active'));
    const view = $(`#view-${name}`);
    if (view) view.classList.add('active');
    const navBtn = $(`.nav-btn[data-view="${name}"]`);
    if (navBtn) navBtn.classList.add('active');
    if (name === 'form') {
      $('#nav-form-btn').style.display = '';
    }
    window.scrollTo(0, 0);
  }

  // ───── Toast ─────
  let toastEl = null;
  let toastTimeout = null;
  function showToast(msg, type = '') {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.className = 'toast' + (type ? ` toast-${type}` : '');
    clearTimeout(toastTimeout);
    requestAnimationFrame(() => {
      toastEl.classList.add('show');
      toastTimeout = setTimeout(() => toastEl.classList.remove('show'), 2500);
    });
  }

  // ───── Confirm Dialog ─────
  function confirmDialog(title, message) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'dialog-overlay';
      overlay.innerHTML = `
        <div class="dialog-box">
          <h3>${title}</h3>
          <p>${message}</p>
          <div class="dialog-actions">
            <button class="btn btn-secondary" data-action="cancel">Cancel</button>
            <button class="btn btn-danger" data-action="confirm">Confirm</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      overlay.addEventListener('click', (e) => {
        const action = e.target.dataset.action;
        if (action) {
          document.body.removeChild(overlay);
          resolve(action === 'confirm');
        }
      });
    });
  }

  // ───── Team List Rendering ─────
  function getStatusInfo(team) {
    if (team.needsRecheck) return { label: 'Recheck', cls: 'chip-recheck' };
    const vs = team.verification?.status;
    if (vs === 'match_verified' || vs === 'practice_verified')
      return { label: 'Verified', cls: 'chip-verified' };
    if (team.completed) return { label: 'Done', cls: 'chip-completed' };
    return { label: 'Unscouted', cls: 'chip-unscouted' };
  }

  function matchesDivision(team) {
    if (currentDivision === 'All') return true;
    return (team.division || '') === currentDivision;
  }

  function matchesFilter(team) {
    if (!matchesDivision(team)) return false;
    const status = getStatusInfo(team);
    switch (currentFilter) {
      case 'mine': return isAssignedTeam(team.teamNumber);
      case 'unscouted': return status.label === 'Unscouted';
      case 'completed': return team.completed;
      case 'recheck': return team.needsRecheck;
      case 'verified': return status.label === 'Verified';
      default: return true;
    }
  }

  function matchesSearch(team) {
    if (!currentSearch) return true;
    const q = currentSearch.toLowerCase();
    return (
      String(team.teamNumber).includes(q) ||
      (team.teamName || '').toLowerCase().includes(q)
    );
  }

  function getIndicators(team) {
    const inds = [];
    const pc = getPrescoutForTeam(team.teamNumber);
    if (pc.tier && pc.tier !== 'unknown' && pc.tier !== 'unranked') {
      inds.push({ cls: 'ind-tier', text: pc.tier });
    }
    const pitShooter = team.robot?.shooterType;
    const st = pitShooter && pitShooter !== 'unknown' && pitShooter !== '' ? pitShooter : pc.shooterType;
    if (st && st !== 'unknown' && st !== 'none') {
      const short = { fixed_drum: '滚筒', turret: '炮台', rotatable_drum: '转滚筒' }[st] || st;
      inds.push({ cls: 'ind-fuel', text: short });
    }
    if (pc.autoClimb === 'yes') inds.push({ cls: 'ind-auto', text: 'AUTO↑' });
    const maxC = team.climb?.maxClimb || pc.maxClimb;
    if (maxC && maxC !== 'none' && maxC !== 'unknown')
      inds.push({ cls: 'ind-climb', text: String(maxC).toUpperCase() });
    if (team.matchNotes?.length) inds.push({ cls: 'ind-auto', text: `${team.matchNotes.length} M` });
    if (team.needsRecheck) inds.push({ cls: 'ind-recheck', text: 'RECHECK' });
    return inds;
  }

  function renderTeamRow(team) {
    const status = getStatusInfo(team);
    const indicators = getIndicators(team);
    const divTag = (currentDivision === 'All' && team.division)
      ? `<span class="indicator" style="background:var(--surface2);color:var(--text-dim)">${escapeHtml(team.division)}</span>` : '';
    const indHTML = divTag + indicators.map(i => `<span class="indicator ${escapeHtml(i.cls)}">${escapeHtml(i.text)}</span>`).join('');
    return `
      <div class="team-row" data-team="${team.teamNumber}">
        <div class="team-row-num">${team.teamNumber}</div>
        <div class="team-row-info">
          <div class="team-row-name">${escapeHtml(team.teamName || 'Unknown')}</div>
          <div class="team-row-indicators">${indHTML}${isAssignedTeam(team.teamNumber) ? '<span class="indicator ind-mine">MINE</span>' : ''}</div>
        </div>
        <span class="status-chip ${escapeHtml(status.cls)}">${escapeHtml(status.label)}</span>
      </div>`;
  }

  function renderTeamList(containerId) {
    const filtered = allTeams
      .filter(t => matchesFilter(t) && matchesSearch(t))
      .sort((a, b) => a.teamNumber - b.teamNumber);
    const container = $(`#${containerId}`);
    if (filtered.length === 0) {
      let extra = '';
      if (allTeams.length > 0) {
        if (currentDivision !== 'All') {
          extra = `<p class="presct-note" style="margin-top:8px">${allTeams.length} teams are saved — try division <strong>All Divisions</strong> if yours is empty.</p>`;
        } else if (currentFilter !== 'all') {
          extra = `<p class="presct-note" style="margin-top:8px">Try the <strong>All</strong> filter chip to see every team.</p>`;
        }
      }
      container.innerHTML = `<div class="empty-state">No teams match your filter.</div>${extra}`;
    } else {
      container.innerHTML = filtered.map(renderTeamRow).join('');
    }
  }

  async function refreshData() {
    allTeams = await dbGetAll();
    updateStats();
    updateAssignmentSummaries();
    renderTeamList('dashboard-team-list');
    renderTeamList('teamlist-container');
    renderAssignTeamList();
    renderPitMap();
  }

  function updateStats() {
    const divTeams = allTeams.filter(matchesDivision);
    const dbTotal = allTeams.length;
    const totalEl = $('#stat-total');
    const subEl = $('#stat-total-sub');
    if (totalEl) totalEl.textContent = String(divTeams.length);
    if (subEl) {
      if (dbTotal === 0) {
        subEl.textContent = 'No roster loaded — go online and reload';
        subEl.style.color = 'var(--red)';
      } else if (currentDivision !== 'All' && divTeams.length < dbTotal) {
        subEl.textContent = `${dbTotal} teams in app (all divisions)`;
        subEl.style.color = 'var(--text-dim)';
      } else {
        subEl.textContent = '';
        subEl.style.color = '';
      }
    }
    const completed = divTeams.filter(t => t.completed).length;
    const recheck = divTeams.filter(t => t.needsRecheck).length;
    const verified = divTeams.filter(t => {
      const vs = t.verification?.status;
      return vs === 'match_verified' || vs === 'practice_verified';
    }).length;
    $('#stat-completed').textContent = completed;
    $('#stat-recheck').textContent = recheck;
    $('#stat-verified').textContent = verified;
  }

  // ───── Form Logic ─────
  async function openTeamForm(teamNumber) {
    const team = await dbGet(teamNumber);
    if (!team) return;
    currentTeamNumber = teamNumber;

    $('#form-team-number').textContent = `#${team.teamNumber}`;
    $('#form-team-name').textContent = team.teamName || '';

    // Populate inputs
    $('#f-completed').checked = !!team.completed;
    $('#f-notes').value = team.notes || '';
    $('#f-needsRecheck').checked = !!team.needsRecheck;

    // Photo
    if (team.photoDataUrl) {
      $('#photo-preview').src = team.photoDataUrl;
      $('#photo-preview').style.display = '';
      $('#photo-placeholder').style.display = 'none';
      $('#photo-remove-btn').style.display = '';
    } else {
      $('#photo-preview').style.display = 'none';
      $('#photo-placeholder').style.display = '';
      $('#photo-remove-btn').style.display = 'none';
    }

    // Text fields mapped to nested objects
    const textFields = {
      'f-verify-notes': ['verification', 'notes'],
      'f-verify-matchEvidenceNotes': ['verification', 'matchEvidenceNotes'],
      'f-verify-lastVerifiedMatch': ['verification', 'lastVerifiedMatch'],
    };
    for (const [id, path] of Object.entries(textFields)) {
      const el = $(`#${id}`);
      if (el) el.value = (team[path[0]] && team[path[0]][path[1]]) || '';
    }

    // Segmented controls (pit + verify only — not match compose)
    $$('#view-form .seg-control').forEach(ctrl => {
      const field = ctrl.dataset.field;
      if (!field || field.startsWith('matchEntry.')) return;
      const [section, key] = field.split('.');
      if (!['robot', 'climb', 'verification'].includes(section)) return;
      const val = team[section] && team[section][key];
      ctrl.querySelectorAll('.seg-btn').forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.val === val);
      });
    });

    // Activate first tab (pre-scout reference)
    $$('.form-tab').forEach(t => t.classList.toggle('active', t.dataset.section === 'presct'));
    $$('.form-section').forEach(s => s.classList.toggle('active', s.dataset.section === 'presct'));

    populatePresctControls(teamNumber);

    // Match notes
    renderMatchNotesList(team);
    $('#f-match-number').value = '';
    $('#f-match-notes').value = '';
    $('#f-match-alliancePoints').value = '';
    const matchRoles = $('#match-note-form .seg-control[data-field="matchEntry.observedRoles"]');
    const matchPerf = $('#match-note-form .seg-control[data-field="matchEntry.performance"]');
    const matchDriver = $('#match-note-form .seg-control[data-field="matchEntry.driverSkill"]');
    matchRoles?.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('selected'));
    matchPerf?.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('selected'));
    matchDriver?.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('selected'));

    showAutosave('Saved on this device');
    switchView('form');
  }

  function collectFormData() {
    const data = {};
    data.assignedScout = getScoutName();
    data.completed = $('#f-completed').checked;
    data.needsRecheck = $('#f-needsRecheck').checked;
    data.notes = $('#f-notes').value.trim();
    data.updatedAt = new Date().toISOString();

    // Segmented controls
    $$('.seg-control').forEach(ctrl => {
      const field = ctrl.dataset.field;
      if (!field || field.startsWith('matchEntry.')) return;
      const [section, key] = field.split('.');
      if (!['robot', 'climb', 'verification'].includes(section)) return;
      if (!data[section]) data[section] = {};
      const selected = ctrl.querySelector('.seg-btn.selected');
      data[section][key] = selected ? selected.dataset.val : '';
    });

    // Text fields
    const textFields = {
      'f-verify-notes': ['verification', 'notes'],
      'f-verify-matchEvidenceNotes': ['verification', 'matchEvidenceNotes'],
      'f-verify-lastVerifiedMatch': ['verification', 'lastVerifiedMatch'],
    };
    for (const [id, path] of Object.entries(textFields)) {
      const el = $(`#${id}`);
      if (el) {
        if (!data[path[0]]) data[path[0]] = {};
        data[path[0]][path[1]] = el.value.trim();
      }
    }

    return data;
  }

  async function saveForm() {
    if (!currentTeamNumber) return;
    savePrescoutFromForm();
    const existing = await dbGet(currentTeamNumber);
    if (!existing) return;
    const formData = collectFormData();

    // Merge nested objects
    for (const key of ['robot', 'climb', 'verification']) {
      existing[key] = { ...existing[key], ...formData[key] };
    }
    existing.assignedScout = formData.assignedScout;
    existing.completed = formData.completed;
    existing.needsRecheck = formData.needsRecheck;
    existing.notes = formData.notes;
    existing.updatedAt = formData.updatedAt;

    await dbPut(existing);
    showAutosave('Saved on this device');
  }

  function showAutosave(text) {
    const el = $('#autosave-indicator');
    el.textContent = text;
    el.classList.toggle('saving', text !== 'Saved on this device');
  }

  function scheduleAutosave() {
    showAutosave('Saving…');
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(async () => {
      await saveForm();
    }, 800);
  }

  // ───── Photo Handling ─────
  function compressImage(file, maxDim, quality) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let w = img.width, h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
            else { w = Math.round(w * maxDim / h); h = maxDim; }
          }
          canvas.width = w;
          canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  async function handlePhoto(file) {
    if (!file || !currentTeamNumber) return;
    const dataUrl = await compressImage(file, 800, 0.7);
    const team = await dbGet(currentTeamNumber);
    if (!team) return;
    team.photoDataUrl = dataUrl;
    team.updatedAt = new Date().toISOString();
    await dbPut(team);
    $('#photo-preview').src = dataUrl;
    $('#photo-preview').style.display = '';
    $('#photo-placeholder').style.display = 'none';
    $('#photo-remove-btn').style.display = '';
    showAutosave('Saved on this device');
    showToast('Photo saved', 'success');
  }

  async function removePhoto() {
    if (!currentTeamNumber) return;
    const team = await dbGet(currentTeamNumber);
    if (!team) return;
    team.photoDataUrl = '';
    team.updatedAt = new Date().toISOString();
    await dbPut(team);
    $('#photo-preview').style.display = 'none';
    $('#photo-placeholder').style.display = '';
    $('#photo-remove-btn').style.display = 'none';
    showToast('Photo removed');
  }

  // ───── Match Notes ─────
  function renderMatchNotesList(team) {
    const container = $('#match-notes-list');
    const notes = team.matchNotes || [];
    if (notes.length === 0) {
      container.innerHTML = '<div class="empty-state" style="padding:16px">No match observations yet. Tap "Add Match Note" above.</div>';
      return;
    }
    container.innerHTML = notes
      .slice()
      .reverse()
      .map((n, idx) => {
        const realIdx = notes.length - 1 - idx;
        if (n.source === 'qual_session' && n.qualMatchId) {
          const pts =
            n.scoreRed != null && n.scoreBlue != null
              ? `<span class="match-note-points">${escapeHtml(n.scoreRed)}–${escapeHtml(n.scoreBlue)}</span>`
              : '';
          const al = n.alliance === 'red' ? 'Red' : 'Blue';
          const ra = escapeHtml((n.redAlliance || []).join(', '));
          const ba = escapeHtml((n.blueAlliance || []).join(', '));
          const timeLabel = n.timestamp
            ? escapeHtml(new Date(n.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }))
            : '';
          return `
        <div class="match-note-card match-note-qual" data-idx="${realIdx}">
          <div class="match-note-header">
            <strong>${escapeHtml(n.matchNumber || 'Match')}</strong>
            ${pts}
            <span class="match-note-tag qual-alliance-tag">${al}</span>
            <span class="match-note-time">${timeLabel}</span>
            <button class="match-note-delete" data-idx="${realIdx}" aria-label="Delete">&times;</button>
          </div>
          <div class="qual-field-match-meta">R: ${ra} · B: ${ba}</div>
          ${n.notes ? `<div class="match-note-body">${escapeNoteHtml(n.notes)}</div>` : '<div class="match-note-body muted">(no comment for this robot)</div>'}
        </div>`;
        }
        // Handle both old single role and new multi-role format
        const roles = n.observedRoles || (n.observedRole ? [n.observedRole] : []);
        const rolesTags = roles.map(r => `<div class="match-note-tag">${escapeHtml(String(r).replace(/_/g, ' '))}</div>`).join('');
        const perfCls = /^[a-z0-9_-]+$/i.test(String(n.performance || '')) ? n.performance : '';
        const driverCls = /^[a-z0-9_-]+$/i.test(String(n.driverSkill || '')) ? n.driverSkill : '';
        const timeLabel = n.timestamp
          ? escapeHtml(new Date(n.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }))
          : '';
        return `
        <div class="match-note-card" data-idx="${realIdx}">
          <div class="match-note-header">
            <strong>${escapeHtml(n.matchNumber || 'No match #')}</strong>
            ${n.alliancePoints ? `<span class="match-note-points">${escapeHtml(n.alliancePoints)} pts</span>` : ''}
            <span class="match-note-time">${timeLabel}</span>
            <button class="match-note-delete" data-idx="${realIdx}" aria-label="Delete">&times;</button>
          </div>
          ${rolesTags}
          ${n.performance ? `<div class="match-note-tag${perfCls ? ` perf-${escapeHtml(perfCls)}` : ''}">${escapeHtml(n.performance)}</div>` : ''}
          ${n.driverSkill ? `<div class="match-note-tag${driverCls ? ` driver-${escapeHtml(driverCls)}` : ''}">Driver: ${escapeHtml(n.driverSkill)}</div>` : ''}
          ${n.notes ? `<div class="match-note-body">${escapeNoteHtml(n.notes)}</div>` : ''}
        </div>`;
      })
      .join('');
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeNoteHtml(s) {
    return escapeHtml(s).replace(/\n/g, '<br>');
  }

  async function addMatchNote() {
    if (!currentTeamNumber) return;
    const matchNum = $('#f-match-number').value.trim();
    const rolesCtrl = $('#match-note-form .seg-control[data-field="matchEntry.observedRoles"]');
    const perf = $('#match-note-form .seg-control[data-field="matchEntry.performance"]');
    const driver = $('#match-note-form .seg-control[data-field="matchEntry.driverSkill"]');
    // Multi-select: get all selected roles
    const rolesVal = Array.from(rolesCtrl?.querySelectorAll('.seg-btn.selected') || []).map(b => b.dataset.val);
    const perfVal = perf?.querySelector('.seg-btn.selected')?.dataset.val || '';
    const driverVal = driver?.querySelector('.seg-btn.selected')?.dataset.val || '';
    const alliancePoints = $('#f-match-alliancePoints').value.trim();
    const notes = $('#f-match-notes').value.trim();

    if (!matchNum && !notes) {
      showToast('Enter a match number or notes', 'error');
      return;
    }

    const entry = {
      matchNumber: matchNum,
      observedRoles: rolesVal,
      performance: perfVal,
      driverSkill: driverVal,
      alliancePoints: alliancePoints ? parseInt(alliancePoints, 10) : null,
      notes: notes,
      timestamp: new Date().toISOString(),
    };

    const team = await dbGet(currentTeamNumber);
    if (!team) return;
    if (!team.matchNotes) team.matchNotes = [];
    team.matchNotes.push(entry);
    team.updatedAt = new Date().toISOString();
    await dbPut(team);

    // Reset form
    $('#f-match-number').value = '';
    $('#f-match-notes').value = '';
    $('#f-match-alliancePoints').value = '';
    rolesCtrl?.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('selected'));
    perf?.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('selected'));
    driver?.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('selected'));

    renderMatchNotesList(team);
    showAutosave('Saved on this device');
    showToast('Match note added', 'success');
  }

  async function deleteMatchNote(idx) {
    if (!currentTeamNumber) return;
    const team = await dbGet(currentTeamNumber);
    if (!team || !team.matchNotes) return;
    const removed = team.matchNotes[idx];
    if (removed?.source === 'qual_session' && removed.qualMatchId) {
      await deleteQualMatchSession(removed.qualMatchId);
      const t2 = await dbGet(currentTeamNumber);
      renderMatchNotesList(t2 || team);
      showAutosave('Saved on this device');
      return;
    }
    team.matchNotes.splice(idx, 1);
    team.updatedAt = new Date().toISOString();
    await dbPut(team);
    renderMatchNotesList(team);
    showAutosave('Saved on this device');
  }

  // ───── Qual match (full field entry → fan-out to team matchNotes) ─────
  function normalizeQualMatchId(raw) {
    const s = String(raw || '').trim();
    if (!s) return '';
    const m = s.toUpperCase().match(/(\d+)/);
    return m ? 'QM' + m[1] : s.toUpperCase().replace(/\s+/g, '');
  }

  async function ensureTeamStub(teamNumber) {
    let team = await dbGet(teamNumber);
    if (!team) {
      const fromCsv = allCsvTeams.find((t) => t.teamNumber === teamNumber);
      team = makeDefaultRecord(fromCsv || { teamNumber, teamName: '' });
      await dbPut(team);
    }
    return team;
  }

  async function removeQualFanoutFromTeams(matchId) {
    const old = await qualGet(matchId);
    if (!old) return;
    const nums = [...(old.red || []), ...(old.blue || [])];
    for (const num of nums) {
      const team = await dbGet(num);
      if (!team || !team.matchNotes) continue;
      const next = team.matchNotes.filter((n) => n.qualMatchId !== matchId);
      if (next.length === team.matchNotes.length) continue;
      team.matchNotes = next;
      team.updatedAt = new Date().toISOString();
      await dbPut(team);
    }
  }

  async function appendQualFanoutNote(teamNumber, record, alliance, comment) {
    await ensureTeamStub(teamNumber);
    const team = await dbGet(teamNumber);
    if (!team.matchNotes) team.matchNotes = [];
    const entry = {
      matchNumber: record.matchLabel || record.matchId,
      qualMatchId: record.matchId,
      source: 'qual_session',
      alliance,
      scoreRed: record.scoreRed,
      scoreBlue: record.scoreBlue,
      redAlliance: record.red,
      blueAlliance: record.blue,
      notes: comment || '',
      alliancePoints: alliance === 'red' ? record.scoreRed : record.scoreBlue,
      observedRoles: [],
      performance: '',
      driverSkill: '',
      timestamp: record.updatedAt,
    };
    team.matchNotes.push(entry);
    team.updatedAt = record.updatedAt;
    await dbPut(team);
  }

  async function rebuildQualFanoutFromStore() {
    const allTeams = await dbGetAll();
    for (const team of allTeams) {
      if (!team.matchNotes?.length) continue;
      const filtered = team.matchNotes.filter((n) => n.source !== 'qual_session');
      if (filtered.length === team.matchNotes.length) continue;
      team.matchNotes = filtered;
      team.updatedAt = new Date().toISOString();
      await dbPut(team);
    }
    const quals = await qualGetAll();
    for (const r of quals) {
      const comments = r.comments || {};
      for (const tn of r.red || []) {
        await appendQualFanoutNote(tn, r, 'red', comments[String(tn)] || '');
      }
      for (const tn of r.blue || []) {
        await appendQualFanoutNote(tn, r, 'blue', comments[String(tn)] || '');
      }
    }
  }

  function clearQualForm() {
    $('#qual-match-label').value = '';
    for (let i = 1; i <= 3; i++) {
      $(`#qual-r${i}`).value = '';
      $(`#qual-b${i}`).value = '';
      $(`#qual-note-r${i}`).value = '';
      $(`#qual-note-b${i}`).value = '';
    }
    $('#qual-score-red').value = '';
    $('#qual-score-blue').value = '';
  }

  async function saveQualMatchSession() {
    const matchLabel = $('#qual-match-label').value.trim();
    const matchId = normalizeQualMatchId(matchLabel);
    if (!matchId) {
      showToast('Enter match # (e.g. 14 or Q14)', 'error');
      return;
    }
    const reds = [1, 2, 3].map((i) => parseInt($(`#qual-r${i}`).value.trim(), 10));
    const blues = [1, 2, 3].map((i) => parseInt($(`#qual-b${i}`).value.trim(), 10));
    if (reds.some((n) => !Number.isFinite(n) || n < 1) || blues.some((n) => !Number.isFinite(n) || n < 1)) {
      showToast('Enter all six team numbers', 'error');
      return;
    }
    const sr = $('#qual-score-red').value.trim();
    const sb = $('#qual-score-blue').value.trim();
    const scoreRed = sr === '' ? null : parseInt(sr, 10);
    const scoreBlue = sb === '' ? null : parseInt(sb, 10);
    const comments = {};
    for (let i = 0; i < 3; i++) {
      comments[String(reds[i])] = $(`#qual-note-r${i + 1}`).value.trim();
      comments[String(blues[i])] = $(`#qual-note-b${i + 1}`).value.trim();
    }

    await removeQualFanoutFromTeams(matchId);

    const record = {
      matchId,
      matchLabel: matchLabel || matchId,
      red: reds,
      blue: blues,
      scoreRed: Number.isFinite(scoreRed) ? scoreRed : null,
      scoreBlue: Number.isFinite(scoreBlue) ? scoreBlue : null,
      comments,
      updatedAt: new Date().toISOString(),
      scout: getScoutName(),
    };
    await qualPut(record);

    for (let i = 0; i < 3; i++) {
      await appendQualFanoutNote(reds[i], record, 'red', comments[String(reds[i])] || '');
    }
    for (let i = 0; i < 3; i++) {
      await appendQualFanoutNote(blues[i], record, 'blue', comments[String(blues[i])] || '');
    }

    clearQualForm();
    await renderQualRecentList();
    await refreshData();
    showToast('Match saved — see each team’s Match tab', 'success');
  }

  async function deleteQualMatchSession(matchId) {
    await removeQualFanoutFromTeams(matchId);
    await qualDelete(matchId);
    await renderQualRecentList();
    await refreshData();
    showToast('Qual match removed', 'success');
  }

  async function renderQualRecentList() {
    const el = $('#qual-recent-list');
    if (!el) return;
    const rows = await qualGetAll();
    rows.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    if (rows.length === 0) {
      el.innerHTML = '<div class="empty-state" style="padding:12px">No matches logged from this screen yet.</div>';
      return;
    }
    el.innerHTML = rows
      .map((r) => {
        const score =
          r.scoreRed != null && r.scoreBlue != null
            ? ` · ${escapeHtml(r.scoreRed)}–${escapeHtml(r.scoreBlue)}`
            : '';
        return `<div class="qual-recent-card">
          <div class="qual-recent-main">
            <strong>${escapeHtml(r.matchLabel || r.matchId)}</strong>${score}
            <div class="qual-recent-meta">R: ${escapeHtml((r.red || []).join(', '))} · B: ${escapeHtml((r.blue || []).join(', '))}</div>
          </div>
          <button type="button" class="btn btn-small qual-recent-del" data-mid="${escapeHtml(r.matchId)}">Delete</button>
        </div>`;
      })
      .join('');
  }

  // ───── Add Team ─────
  async function addTeamManually() {
    const numStr = $('#add-team-number').value.trim();
    const name = $('#add-team-name').value.trim();
    const num = parseInt(numStr, 10);
    if (isNaN(num) || num < 1) {
      showToast('Enter a valid team number', 'error');
      return;
    }
    const existing = await dbGet(num);
    if (existing) {
      showToast(`Team ${num} already exists`, 'error');
      return;
    }
    await dbPut(makeDefaultRecord({ teamNumber: num, teamName: name }));
    await refreshData();
    $('#add-team-number').value = '';
    $('#add-team-name').value = '';
    showToast(`Team ${num} added`, 'success');
  }

  // ───── CSV Export ─────
  function flattenForCSV(team) {
    const row = {};
    row.teamNumber = team.teamNumber;
    row.teamName = team.teamName;
    row.division = team.division || '';
    row.scout = team.assignedScout;
    row.updatedAt = team.updatedAt;
    row.completed = team.completed;
    row.needsRecheck = team.needsRecheck;
    row.notes = team.notes;
    for (const section of ['robot', 'fuel', 'auto', 'climb', 'defense', 'verification']) {
      if (team[section]) {
        for (const [k, v] of Object.entries(team[section])) {
          row[`${section}_${k}`] = v;
        }
      }
    }
    row.hasPhoto = !!team.photoDataUrl;
    row.matchNotesCount = (team.matchNotes || []).length;
    return row;
  }

  function toCSV(teams) {
    if (!teams.length) return '';
    const rows = teams.map(flattenForCSV);
    const headers = Object.keys(rows[0]);
    const escape = (v) => {
      const s = String(v ?? '');
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.join(',')];
    for (const r of rows) {
      lines.push(headers.map(h => escape(r[h])).join(','));
    }
    return lines.join('\n');
  }

  function downloadFile(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function exportCSV() {
    const teams = await dbGetAll();
    const csv = toCSV(teams);
    const ts = new Date().toISOString().slice(0, 16).replace(/[:.]/g, '-');
    downloadFile(csv, `hopper-pit-scout-${ts}.csv`, 'text/csv');
    updateExportTimestamp();
    showToast('CSV exported', 'success');
  }

  /** Prefer newer ISO timestamps; equal/missing remote never beats a local record. */
  function isRemoteNewer(remoteTs, localTs) {
    if (!remoteTs) return false;
    if (!localTs) return true;
    return String(remoteTs) > String(localTs);
  }

  function stripTeamPhotos(rec) {
    if (!rec || typeof rec !== 'object') return rec;
    const copy = { ...rec };
    copy.photoDataUrl = '';
    return copy;
  }

  /**
   * Validate a pit backup / import payload before any IndexedDB writes.
   * Returns { ok, errors, payload } — payload is normalized when ok.
   */
  function validatePitBackupPayload(data) {
    const errors = [];
    if (data == null) {
      errors.push('Backup is empty');
      return { ok: false, errors, payload: null };
    }
    let teams;
    let qualMatches;
    if (Array.isArray(data)) {
      teams = data;
      qualMatches = undefined;
    } else if (typeof data === 'object' && Array.isArray(data.teams)) {
      teams = data.teams;
      qualMatches = data.qualMatches;
      if (data.format != null && data.format !== 'frcPitScout-v2' && data.format !== 'frcPitScout-v1') {
        errors.push(`Unsupported format: ${data.format}`);
      }
    } else {
      errors.push('Expected team array or { teams, qualMatches } object');
      return { ok: false, errors, payload: null };
    }

    const normalizedTeams = [];
    for (let i = 0; i < teams.length; i++) {
      const rec = teams[i];
      if (!rec || typeof rec !== 'object') {
        errors.push(`teams[${i}]: not an object`);
        continue;
      }
      const num = Number(rec.teamNumber);
      if (!Number.isInteger(num) || num < 1 || num > 99999) {
        errors.push(`teams[${i}]: invalid teamNumber`);
        continue;
      }
      if (rec.teamName != null && typeof rec.teamName !== 'string') {
        errors.push(`teams[${i}]: teamName must be a string`);
        continue;
      }
      if (rec.matchNotes != null && !Array.isArray(rec.matchNotes)) {
        errors.push(`teams[${i}]: matchNotes must be an array`);
        continue;
      }
      if (rec.photoDataUrl != null && typeof rec.photoDataUrl !== 'string') {
        errors.push(`teams[${i}]: photoDataUrl must be a string`);
        continue;
      }
      if (typeof rec.photoDataUrl === 'string' && rec.photoDataUrl.length > 6_000_000) {
        errors.push(`teams[${i}]: photoDataUrl exceeds size limit`);
        continue;
      }
      normalizedTeams.push({ ...rec, teamNumber: num });
    }

    let normalizedQual = undefined;
    if (qualMatches !== undefined && qualMatches !== null) {
      if (!Array.isArray(qualMatches)) {
        errors.push('qualMatches must be an array when present');
      } else {
        normalizedQual = [];
        for (let i = 0; i < qualMatches.length; i++) {
          const q = qualMatches[i];
          if (!q || typeof q !== 'object') {
            errors.push(`qualMatches[${i}]: not an object`);
            continue;
          }
          const matchId = normalizeQualMatchId(q.matchId || q.matchLabel || '');
          if (!matchId) {
            errors.push(`qualMatches[${i}]: missing matchId`);
            continue;
          }
          if (q.red != null && !Array.isArray(q.red)) {
            errors.push(`qualMatches[${i}]: red must be an array`);
            continue;
          }
          if (q.blue != null && !Array.isArray(q.blue)) {
            errors.push(`qualMatches[${i}]: blue must be an array`);
            continue;
          }
          normalizedQual.push({ ...q, matchId });
        }
      }
    }

    if (errors.length) return { ok: false, errors, payload: null };
    return {
      ok: true,
      errors: [],
      payload: { teams: normalizedTeams, qualMatches: normalizedQual },
    };
  }

  /**
   * Merge v2 backup without clearing local stores.
   * Teams: keep local when it has updatedAt and remote is not newer.
   * Qual: upsert by matchId when remote is newer or local is missing; never wipe the store.
   * Empty/missing qualMatches leaves local qual matches unchanged.
   */
  async function applyPitBackupPayload(data, options = {}) {
    const { stripPhotos = false } = options;
    if (!data || !Array.isArray(data.teams)) {
      return { teamsUpdated: 0, qualUpserted: 0, qualSkipped: 0, qualSynced: false, qualCount: 0 };
    }
    let teamsUpdated = 0;
    for (const raw of data.teams) {
      if (!raw.teamNumber) continue;
      const rec = stripPhotos ? stripTeamPhotos(raw) : raw;
      try {
        const existing = await dbGet(rec.teamNumber);
        if (!existing || !existing.updatedAt || isRemoteNewer(rec.updatedAt, existing.updatedAt)) {
          // Preserve a local photo when the incoming record intentionally has none (auto baseline).
          if (
            stripPhotos &&
            existing?.photoDataUrl &&
            (!rec.photoDataUrl || rec.photoDataUrl === '')
          ) {
            rec.photoDataUrl = existing.photoDataUrl;
          }
          await dbPut(rec, { skipOutbox: true });
          teamsUpdated++;
        }
      } catch (err) {
        console.warn('Skipping team', rec.teamNumber, err);
      }
    }

    const qualList = data.qualMatches;
    let qualUpserted = 0;
    let qualSkipped = 0;
    if (qualList && Array.isArray(qualList) && qualList.length > 0) {
      for (const q of qualList) {
        if (!q || !q.matchId) {
          qualSkipped++;
          continue;
        }
        const matchId = normalizeQualMatchId(q.matchId);
        if (!matchId) {
          qualSkipped++;
          continue;
        }
        const incoming = { ...q, matchId };
        try {
          const existing = await qualGet(matchId);
          if (!existing || isRemoteNewer(incoming.updatedAt, existing.updatedAt)) {
            await qualPut(incoming, { skipOutbox: true });
            qualUpserted++;
          } else {
            qualSkipped++;
          }
        } catch (err) {
          console.warn('Skipping qual match', matchId, err);
          qualSkipped++;
        }
      }
      if (qualUpserted > 0) {
        await rebuildQualFanoutFromStore();
      }
      console.info(
        `[pit-merge] qual upserted=${qualUpserted} skipped=${qualSkipped} (local unmatched preserved)`
      );
    }
    return {
      teamsUpdated,
      qualUpserted,
      qualSkipped,
      qualSynced: qualUpserted > 0,
      qualCount: qualUpserted,
    };
  }

  async function mergeOnlinePitBaseline() {
    try {
      const res = await fetch('./pit-scout-baseline.json', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      const { ok, errors, payload } = validatePitBackupPayload(data);
      if (!ok) {
        console.warn('Online pit baseline failed validation:', errors.slice(0, 5));
        return;
      }
      if (!payload.teams.length) return;
      // Automatic baseline never carries photos (keeps startup light; preserves local photos).
      await applyPitBackupPayload(payload, { stripPhotos: true });
    } catch (e) {
      console.warn('Could not merge online pit baseline:', e);
    }
  }

  async function exportJSON() {
    const teams = await dbGetAll();
    const qualMatches = await qualGetAll();
    const payload = {
      format: 'frcPitScout-v2',
      exportedAt: new Date().toISOString(),
      teams,
      qualMatches,
    };
    const json = JSON.stringify(payload, null, 2);
    const ts = new Date().toISOString().slice(0, 16).replace(/[:.]/g, '-');
    downloadFile(json, `hopper-pit-scout-${ts}.json`, 'application/json');
    updateExportTimestamp();
    showToast('JSON backup exported', 'success');
  }

  async function importJSON(file) {
    try {
      const text = await file.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error('File is not valid JSON');
      }
      const { ok, errors, payload } = validatePitBackupPayload(data);
      if (!ok) {
        const preview = errors.slice(0, 3).join('; ');
        throw new Error(
          `Validation failed (${errors.length} issue${errors.length === 1 ? '' : 's'}): ${preview}`
        );
      }
      const { teamsUpdated, qualUpserted, qualSkipped } = await applyPitBackupPayload(payload);
      await refreshData();
      await renderQualRecentList();
      const qualMsg =
        qualUpserted > 0
          ? ` + ${qualUpserted} qual match(es)` + (qualSkipped ? ` (${qualSkipped} kept local)` : '')
          : qualSkipped
            ? ` (kept ${qualSkipped} newer local qual match(es))`
            : '';
      showToast(`Imported ${teamsUpdated} team row(s)${qualMsg}`, 'success');
    } catch (err) {
      showToast('Import failed: ' + err.message, 'error');
    }
  }

  async function importTeamsCSV(file) {
    try {
      const text = await file.text();
      const lines = text.trim().split('\n');
      if (lines.length < 2) throw new Error('No data rows');
      const header = lines[0].split(',').map(h => h.trim().toLowerCase());
      const numIdx = header.findIndex(h => h.includes('number') || h === 'teamnumber' || h === 'team');
      const nameIdx = header.findIndex(h => h.includes('name') || h === 'teamname');
      if (numIdx === -1) throw new Error('No teamNumber column found');
      const teams = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
        const num = parseInt(cols[numIdx], 10);
        if (isNaN(num)) continue;
        teams.push({ teamNumber: num, teamName: nameIdx >= 0 ? cols[nameIdx] : '' });
      }
      await seedTeams(teams);
      await refreshData();
      showToast(`Added ${teams.length} team(s)`, 'success');
    } catch (err) {
      showToast('Team import failed: ' + err.message, 'error');
    }
  }

  function updateExportTimestamp() {
    const ts = new Date().toLocaleString();
    localStorage.setItem('lastExport', ts);
    $('#last-export-time').textContent = `Last export: ${ts}`;
  }

  // ───── Event Wiring ─────
  function wireEvents() {
    // Navigation
    $$('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.view;
        if (view === 'form' && !currentTeamNumber) return;
        switchView(view);
        if (view === 'qual') renderQualRecentList();
        if (view === 'map') renderPitMap();
        if (view === 'export') renderAssignTeamList();
        if (view !== 'form' && view !== 'qual') refreshData();
      });
    });

    // Dashboard search & filters
    $('#search-input').addEventListener('input', (e) => {
      currentSearch = e.target.value.trim();
      renderTeamList('dashboard-team-list');
    });

    $$('.filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        $$('.filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        currentFilter = chip.dataset.filter;
        renderTeamList('dashboard-team-list');
      });
    });

    // Team list search
    $('#teamlist-search').addEventListener('input', (e) => {
      currentSearch = e.target.value.trim();
      renderTeamList('teamlist-container');
    });

    // Team row clicks (delegated)
    document.addEventListener('click', (e) => {
      const mapTeam = e.target.closest('.pit-stall-team, .pit-map-team');
      if (mapTeam) {
        const num = parseInt(mapTeam.dataset.team, 10);
        if (num) openTeamForm(num);
        return;
      }
      const assignRow = e.target.closest('.assign-team-row');
      if (assignRow) {
        const num = parseInt(assignRow.dataset.team, 10);
        if (num) toggleAssignedTeam(num);
        return;
      }
      const row = e.target.closest('.team-row');
      if (row) {
        const num = parseInt(row.dataset.team, 10);
        if (num) openTeamForm(num);
      }
    });

    $('#map-highlight-mine')?.addEventListener('change', (e) => {
      mapHighlightMineOnly = !!e.target.checked;
      renderPitMap();
    });
    $('#assign-search')?.addEventListener('input', (e) => {
      assignSearch = e.target.value.trim();
      renderAssignTeamList();
    });
    $('#btn-assign-clear')?.addEventListener('click', async () => {
      const yes = await confirmDialog(
        'Clear assignments',
        'Remove all teams from this phone’s assignment list? Pit data is not deleted.'
      );
      if (yes) await clearAssignedTeams();
    });

    // Form back
    $('#form-back-btn').addEventListener('click', async () => {
      clearTimeout(autosaveTimer);
      await saveForm();
      await refreshData();
      switchView('teamlist');
    });

    // Form save button
    $('#form-save-btn').addEventListener('click', async () => {
      clearTimeout(autosaveTimer);
      await saveForm();
      await refreshData();
      switchView('teamlist');
      showToast('Saved!', 'success');
    });

    // Form tabs
    $$('.form-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        $$('.form-tab').forEach(t => t.classList.remove('active'));
        $$('.form-section').forEach(s => s.classList.remove('active'));
        tab.classList.add('active');
        const section = $(`.form-section[data-section="${tab.dataset.section}"]`);
        if (section) section.classList.add('active');
        if (tab.dataset.section === 'presct' && currentTeamNumber) {
          populatePresctControls(currentTeamNumber);
        }
      });
    });

    // Segmented control clicks
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.seg-btn');
      if (!btn) return;
      const ctrl = btn.closest('.seg-control');
      if (!ctrl) return;
      
      // Check if multi-select
      if (ctrl.classList.contains('multi')) {
        // Toggle the clicked button
        btn.classList.toggle('selected');
      } else {
        // Single select: deselect others
        ctrl.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
      }
      
      if (btn.closest('#match-note-form')) return;
      const field = ctrl.dataset.field;
      if (field && field.startsWith('presct.')) {
        savePrescoutFromForm();
      } else {
        scheduleAutosave();
      }
    });

    // Division selector
    $('#division-select').addEventListener('change', (e) => {
      currentDivision = e.target.value;
      localStorage.setItem('division', currentDivision);
      refreshData();
    });

    // Global scout name
    $('#global-scout-input').addEventListener('input', (e) => {
      setScoutName(e.target.value.trim());
    });

    // Autosave on text inputs within form
    $$('#view-form .field-input, #view-form .field-textarea').forEach(el => {
      el.addEventListener('input', scheduleAutosave);
    });
    $('#f-notes').addEventListener('input', scheduleAutosave);
    $('#f-completed').addEventListener('change', scheduleAutosave);
    $('#f-needsRecheck').addEventListener('change', scheduleAutosave);

    // Match notes + qual list delete
    $('#btn-add-match-note').addEventListener('click', addMatchNote);
    document.addEventListener('click', (e) => {
      const qdel = e.target.closest('.qual-recent-del');
      if (qdel && qdel.dataset.mid) {
        deleteQualMatchSession(qdel.dataset.mid);
        return;
      }
      const del = e.target.closest('.match-note-delete');
      if (del) {
        const idx = parseInt(del.dataset.idx, 10);
        if (!isNaN(idx)) deleteMatchNote(idx);
      }
    });

    $('#btn-qual-save').addEventListener('click', () => saveQualMatchSession());

    // Add team
    $('#btn-add-team').addEventListener('click', addTeamManually);

    // Photo
    $('#photo-area').addEventListener('click', () => $('#photo-input').click());
    $('#photo-input').addEventListener('change', (e) => {
      if (e.target.files[0]) handlePhoto(e.target.files[0]);
    });
    $('#photo-remove-btn').addEventListener('click', removePhoto);

    // Export/Import
    $('#btn-export-csv').addEventListener('click', exportCSV);
    $('#btn-export-json').addEventListener('click', exportJSON);
    $('#btn-import-json').addEventListener('click', () => $('#import-json-input').click());
    $('#import-json-input').addEventListener('change', (e) => {
      if (e.target.files[0]) importJSON(e.target.files[0]);
      e.target.value = '';
    });
    $('#btn-import-teams').addEventListener('click', () => $('#import-teams-input').click());
    $('#import-teams-input').addEventListener('change', (e) => {
      if (e.target.files[0]) importTeamsCSV(e.target.files[0]);
      e.target.value = '';
    });

    // Pre-scout export/import
    $('#btn-export-presct').addEventListener('click', exportPrescoutJSON);
    $('#btn-import-presct').addEventListener('click', () => $('#import-presct-input').click());
    $('#import-presct-input').addEventListener('change', (e) => {
      if (e.target.files[0]) importPrescoutJSON(e.target.files[0]);
      e.target.value = '';
    });

    // Clear data
    $('#btn-clear-data').addEventListener('click', async () => {
      const yes = await confirmDialog(
        'Clear All Data',
        'This will permanently delete all scouting data on this device. This cannot be undone. Export a backup first!'
      );
      if (yes) {
        await dbClear();
        await seedTeams(allCsvTeams);
        await refreshData();
        await renderQualRecentList();
        showToast('All data cleared', 'success');
      }
    });

    // Sync
    $('#btn-sync-join')?.addEventListener('click', () => handleSyncJoin());
    $('#btn-sync-now')?.addEventListener('click', async () => {
      try {
        await window.PitScoutSync.runSync();
        showToast('Sync finished', 'success');
      } catch (e) {
        showToast('Sync failed: ' + e.message, 'error');
      }
    });
    $('#btn-sync-snapshot')?.addEventListener('click', async () => {
      try {
        await window.PitScoutSync.pullSnapshot();
        showToast('Snapshot applied', 'success');
      } catch (e) {
        showToast('Snapshot failed: ' + e.message, 'error');
      }
    });
    $('#sync-status-chip')?.addEventListener('click', () => {
      const panel = $('#sync-panel');
      if (panel) panel.hidden = !panel.hidden;
    });

    // Load last export timestamp
    const lastExport = localStorage.getItem('lastExport');
    if (lastExport) {
      $('#last-export-time').textContent = `Last export: ${lastExport}`;
    }
  }

  // ───── Sync status UI ─────
  function updateSyncStatusUI(s) {
    const chip = $('#sync-status-chip');
    const detail = $('#sync-status-detail');
    if (!chip || !window.PitScoutSync) return;
    const label = window.PitScoutSync.statusLabel();
    chip.textContent = label;
    chip.dataset.status = s.status;
    chip.className = 'sync-status-chip status-' + s.status;
    if (detail) {
      const cfg = window.PIT_SCOUT_CONFIG || {};
      detail.innerHTML = '';
      const lines = [
        `Event: ${s.eventId || cfg.DEFAULT_EVENT_ID || '—'}`,
        `API: ${cfg.SYNC_API_URL || '—'}`,
        `Pending: ${s.pending}`,
        s.lastSyncAt ? `Last sync: ${new Date(s.lastSyncAt).toLocaleString()}` : 'Last sync: never',
        s.lastError ? `Error: ${s.lastError}` : '',
      ].filter(Boolean);
      lines.forEach((line) => {
        const p = document.createElement('p');
        p.textContent = line;
        detail.appendChild(p);
      });
    }
  }

  async function handleSyncJoin() {
    const code = ($('#sync-invite-input')?.value || '').trim();
    const name = getScoutName() || ($('#global-scout-input')?.value || '').trim() || 'Scout';
    if (!code) {
      showToast('Enter invite code', 'error');
      return;
    }
    try {
      setScoutName(name);
      showToast('Joining event…', '');
      await window.PitScoutSync.join({ inviteCode: code, displayName: name });
      showToast('Joined — syncing', 'success');
      updateSyncStatusUI(window.PitScoutSync.getState());
    } catch (e) {
      showToast('Join failed: ' + e.message, 'error');
    }
  }

  async function initSyncClient() {
    if (!window.PitScoutSync) return;
    await window.PitScoutSync.init({
      outboxPut,
      outboxDelete,
      outboxList,
      outboxCount,
      syncMetaGet,
      syncMetaSet,
      applySnapshot: applySyncSnapshot,
      applyChanges: async (changes) => {
        await applySyncChanges(changes);
        await refreshData();
        await renderQualRecentList();
      },
      setLocalRevision,
      applyConflictServerRecord: async (result) => {
        const rec = result.serverRecord;
        if (!rec) return;
        // entity inferred from entityId in operation — use payload shape
        if (rec.payload?.teamNumber && rec.payload?.robot !== undefined) {
          await applyRemoteTeamPayload(rec.payload, rec.revision);
        } else if (rec.payload?.matchId) {
          await applyRemoteQualPayload(rec.payload, rec.revision);
        } else if (rec.payload?.teamNumber) {
          applyPrescoutRemote(rec.payload, rec.revision);
        }
      },
      onSyncComplete: async () => {
        await refreshData();
        await renderQualRecentList();
      },
    });
    window.PitScoutSync.subscribe(updateSyncStatusUI);
    updateSyncStatusUI(window.PitScoutSync.getState());
  }

  // ───── Service Worker Registration ─────
  function registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('service-worker.js').catch(() => {});
    }
  }

  // ───── Init ─────
  async function init() {
    normalizeCurrentDivision();
    await openDB();
    await loadAssignedTeams();
    await loadPitMapConfig();
    await loadTeamsCSV();
    await seedTeams(allCsvTeams);

    loadPrescoutData();
    await mergeOnlinePrescoutBaseline();

    await refreshData();
    wireEvents();
    registerSW();
    await initSyncClient();

    mergeOnlinePitBaseline()
      .then(() => refreshData())
      .then(() => renderQualRecentList())
      .catch((e) => console.warn('Pit baseline merge failed:', e));

    const savedScout = getScoutName();
    $('#global-scout-input').value = savedScout;
    $('#global-scout-display').textContent = savedScout || 'Set name →';

    $('#division-select').value = currentDivision;

    await renderQualRecentList();
    updateAssignmentSummaries();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
