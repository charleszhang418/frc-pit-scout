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
  const DB_VERSION = 1;
  const STORE = 'teams';
  let db = null;

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains(STORE)) {
          d.createObjectStore(STORE, { keyPath: 'teamNumber' });
        }
      };
      req.onsuccess = (e) => { db = e.target.result; resolve(db); };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  function txStore(mode) {
    return db.transaction(STORE, mode).objectStore(STORE);
  }

  function dbGet(key) {
    return new Promise((resolve, reject) => {
      const req = txStore('readonly').get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function dbPut(record) {
    return new Promise((resolve, reject) => {
      const req = txStore('readwrite').put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
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
      const req = txStore('readwrite').clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
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
        await dbPut(makeDefaultRecord(t));
      } else if (!rec.division && t.division) {
        rec.division = t.division;
        await dbPut(rec);
      }
    }
  }

  // ───── State ─────
  let allTeams = [];
  let currentFilter = 'all';
  let currentDivision = localStorage.getItem('division') || 'Hopper';
  let currentSearch = '';
  let currentTeamNumber = null;
  let autosaveTimer = null;

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

  function setPrescoutForTeam(teamNumber, data) {
    prescoutData[teamNumber] = data;
    savePrescoutData();
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
      ? `<span class="indicator" style="background:var(--surface2);color:var(--text-dim)">${team.division}</span>` : '';
    const indHTML = divTag + indicators.map(i => `<span class="indicator ${i.cls}">${i.text}</span>`).join('');
    return `
      <div class="team-row" data-team="${team.teamNumber}">
        <div class="team-row-num">${team.teamNumber}</div>
        <div class="team-row-info">
          <div class="team-row-name">${team.teamName || 'Unknown'}</div>
          <div class="team-row-indicators">${indHTML}</div>
        </div>
        <span class="status-chip ${status.cls}">${status.label}</span>
      </div>`;
  }

  function renderTeamList(containerId) {
    const filtered = allTeams
      .filter(t => matchesFilter(t) && matchesSearch(t))
      .sort((a, b) => a.teamNumber - b.teamNumber);
    const container = $(`#${containerId}`);
    if (filtered.length === 0) {
      container.innerHTML = '<div class="empty-state">No teams match your filter.</div>';
    } else {
      container.innerHTML = filtered.map(renderTeamRow).join('');
    }
  }

  async function refreshData() {
    allTeams = await dbGetAll();
    updateStats();
    renderTeamList('dashboard-team-list');
    renderTeamList('teamlist-container');
  }

  function updateStats() {
    const divTeams = allTeams.filter(matchesDivision);
    const total = divTeams.length;
    const completed = divTeams.filter(t => t.completed).length;
    const recheck = divTeams.filter(t => t.needsRecheck).length;
    const verified = divTeams.filter(t => {
      const vs = t.verification?.status;
      return vs === 'match_verified' || vs === 'practice_verified';
    }).length;
    $('#stat-total').textContent = total;
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

    showAutosave('Saved');
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
    showAutosave('Saved');
  }

  function showAutosave(text) {
    const el = $('#autosave-indicator');
    el.textContent = text;
    el.classList.toggle('saving', text !== 'Saved');
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
    showAutosave('Saved');
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
        // Handle both old single role and new multi-role format
        const roles = n.observedRoles || (n.observedRole ? [n.observedRole] : []);
        const rolesTags = roles.map(r => `<div class="match-note-tag">${r.replace(/_/g, ' ')}</div>`).join('');
        return `
        <div class="match-note-card" data-idx="${realIdx}">
          <div class="match-note-header">
            <strong>${n.matchNumber || 'No match #'}</strong>
            ${n.alliancePoints ? `<span class="match-note-points">${n.alliancePoints} pts</span>` : ''}
            <span class="match-note-time">${n.timestamp ? new Date(n.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}</span>
            <button class="match-note-delete" data-idx="${realIdx}" aria-label="Delete">&times;</button>
          </div>
          ${rolesTags}
          ${n.performance ? `<div class="match-note-tag perf-${n.performance}">${n.performance}</div>` : ''}
          ${n.driverSkill ? `<div class="match-note-tag driver-${n.driverSkill}">Driver: ${n.driverSkill}</div>` : ''}
          ${n.notes ? `<div class="match-note-body">${n.notes}</div>` : ''}
        </div>`;
      })
      .join('');
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
    showAutosave('Saved');
    showToast('Match note added', 'success');
  }

  async function deleteMatchNote(idx) {
    if (!currentTeamNumber) return;
    const team = await dbGet(currentTeamNumber);
    if (!team || !team.matchNotes) return;
    team.matchNotes.splice(idx, 1);
    team.updatedAt = new Date().toISOString();
    await dbPut(team);
    renderMatchNotesList(team);
    showAutosave('Saved');
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

  async function exportJSON() {
    const teams = await dbGetAll();
    const json = JSON.stringify(teams, null, 2);
    const ts = new Date().toISOString().slice(0, 16).replace(/[:.]/g, '-');
    downloadFile(json, `hopper-pit-scout-${ts}.json`, 'application/json');
    updateExportTimestamp();
    showToast('JSON backup exported', 'success');
  }

  async function importJSON(file) {
    try {
      const text = await file.text();
      const records = JSON.parse(text);
      if (!Array.isArray(records)) throw new Error('Expected array');
      let imported = 0;
      for (const rec of records) {
        if (!rec.teamNumber) continue;
        const existing = await dbGet(rec.teamNumber);
        if (!existing || !existing.updatedAt || (rec.updatedAt && rec.updatedAt > existing.updatedAt)) {
          await dbPut(rec);
          imported++;
        }
      }
      await refreshData();
      showToast(`Imported ${imported} team(s)`, 'success');
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
        if (view !== 'form') refreshData();
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
      const row = e.target.closest('.team-row');
      if (row) {
        const num = parseInt(row.dataset.team, 10);
        if (num) openTeamForm(num);
      }
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

    // Match notes
    $('#btn-add-match-note').addEventListener('click', addMatchNote);
    document.addEventListener('click', (e) => {
      const del = e.target.closest('.match-note-delete');
      if (del) {
        const idx = parseInt(del.dataset.idx, 10);
        if (!isNaN(idx)) deleteMatchNote(idx);
      }
    });

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
        showToast('All data cleared', 'success');
      }
    });

    // Load last export timestamp
    const lastExport = localStorage.getItem('lastExport');
    if (lastExport) {
      $('#last-export-time').textContent = `Last export: ${lastExport}`;
    }
  }

  // ───── Service Worker Registration ─────
  function registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('service-worker.js').catch(() => {});
    }
  }

  // ───── Init ─────
  async function init() {
    await openDB();
    await loadTeamsCSV();
    await seedTeams(allCsvTeams);
    
    // Load pre-scout data (separate from pit scouting)
    loadPrescoutData();
    await mergeOnlinePrescoutBaseline();
    
    await refreshData();
    wireEvents();
    registerSW();

    // Restore global scout name
    const savedScout = getScoutName();
    $('#global-scout-input').value = savedScout;
    $('#global-scout-display').textContent = savedScout || 'Set name →';

    // Restore division selector
    $('#division-select').value = currentDivision;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
