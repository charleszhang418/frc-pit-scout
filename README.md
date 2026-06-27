# FRC Pit Scout — Houston 2026

Offline-first pit / pre-scout / qual match logging for FRC Championship. Runs in the browser with IndexedDB (no backend).

**Live site (GitHub Pages):** https://charleszhang418.github.io/frc-pit-scout/

---

## Run locally

The app must be served over **HTTP** (not opened as `file://`). Otherwise `teams.csv`, service worker, and shared JSON files will not load reliably.

### Option A — Python (simplest)

From this folder:

```bash
cd /path/to/Scouting
python3 -m http.server 8765
```

Open **http://127.0.0.1:8765/** in your browser.

Use another port if 8765 is taken, e.g. `8080`.

### Option B — Node

```bash
npx --yes serve . -l 8765
```

Then open **http://127.0.0.1:8765/**.

### Phone on the same Wi‑Fi

Find your computer’s LAN IP (System Settings → Network), then on the phone visit:

`http://YOUR_COMPUTER_IP:8765/`

---

## Shared data on the site (no manual import)

These files sit next to `index.html` and are fetched on load:

| File | Purpose |
|------|--------|
| `prescouting.json` | Pre-scout baseline (tier, roles, summary, …). Local edits win per field. |
| `pit-scout-baseline.json` | Pit + qual backup (v2 export). Merged when backup is newer or local row has no `updatedAt`. |
| `teams.csv` | Full championship team list + division. |

To update what everyone sees on GitHub Pages: export from the app → replace the file → commit → push. Wait ~1–2 minutes for Pages to deploy, then hard-refresh the site.

Manual merge still works: **Data → Import JSON** or **Import Pre-Scout JSON**.

---

## App sections

- **Dashboard / Teams** — filter by division (default **Hopper**), search, open a team.
- **Pre** — pre-scout fields → `prescouting.json` / localStorage.
- **Pit** — completed, shooter, climb, photo, notes → IndexedDB.
- **Qual** — one screen per match: 6 teams, scores, comment per robot.
- **Data** — CSV/JSON export and import.

---

## Troubleshooting

- **0 teams / empty list** — Check division (try **All Divisions**). Reload online so `teams.csv` loads. If pit data is missing, use **Data → Import JSON** once.
- **Stale app after a push** — Close the tab and reopen, or clear site data for this origin so the service worker updates (`pit-scout-v*` in `service-worker.js`).
- **Large baseline slow on phone** — Roster from `teams.csv` appears first; `pit-scout-baseline.json` merges in the background.

---

## Repo layout

```
index.html          Main UI
app.js              App logic + IndexedDB
styles.css
teams.csv           Team roster
prescouting.json    Shared pre-scout baseline
pit-scout-baseline.json   Shared pit/qual backup (optional, large)
service-worker.js   Offline cache
analysis/           Separate analysis scripts (not required to run the app)
```
