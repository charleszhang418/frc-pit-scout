# FRC Pit Scout — 2026

Offline-first pit / pre-scout / qual tool with optional **Cloudflare multi-device sync**.

**Current live event:** China post-season 2026 (`2026-china-postseason`)  
**Houston Hopper archive:** [archives/2026cmptx-hopper/](archives/2026cmptx-hopper/)

**线上地址（GitHub Pages）：** https://charleszhang418.github.io/frc-pit-scout/

---

## 本地运行

必须通过 **HTTP** 访问（不要用 `file://`）：

```bash
cd /path/to/Scouting
python3 -m http.server 8765
```

打开：**http://127.0.0.1:8765/**

### Multi-device sync (Cloudflare)

```bash
cd sync-server
cp .dev.vars.example .dev.vars
npm install && npm run db:local && npm run seed:local
npm run dev   # http://127.0.0.1:8787
```

In the app: **Data → Join event** with invite code from `sync-server/seed/china-event.json` (default example: `CHINA2026`).

See [sync-server/README.md](sync-server/README.md) and [sync-server/scripts/REHEARSAL.md](sync-server/scripts/REHEARSAL.md).

Set production API URL in [`config.js`](config.js) after `npm run deploy`.

---

## Event data in the repo

| Path | Role |
|------|------|
| `teams.csv` | **Live** roster (off-season / China — replace when full list is ready) |
| `prescouting.json` | **Live** pre-scout baseline (starts empty for off-season) |
| `pit-scout-baseline.json` | **Live** pit/qual shared baseline (empty for off-season) |
| `pit-map.json` | **Live** Houston-style pit map config |
| `archives/2026cmptx-hopper/` | **Frozen** Houston Hopper teams + pre-scout + pit baseline |

Analysis snapshots under `analysis/hopper_*` are separate and unchanged.

---

## 应用结构

- **Dashboard / Teams** — 分区筛选、搜索、**My teams** 过滤、进入队伍表单。
- **Map** — Houston 风格 pit 列图（`pit-map.json`）。
- **Pre / Pit / Qual** — 预侦察、pit、资格赛录入（IndexedDB + sync outbox）。
- **Data** — 本机队伍分配、Join/Sync、CSV/JSON 导出导入。

---

## 常见问题

- **队伍数为 0 / 列表为空** — 检查分区筛选（可试 **All Divisions**）。需联网加载 `teams.csv`。换赛事后请 **Clear All Data** 再重载。
- **推送后页面仍是旧版** — 应用会自动检查更新；出现顶部 **New app version available → Reload** 即可。一般无需强制硬刷新。
- **Hopper 数据在哪** — 见 `archives/2026cmptx-hopper/`；可用 Import JSON 临时恢复查看。

---

## 目录说明

```
index.html / app.js / styles.css / config.js / sync-client.js
teams.csv / prescouting.json / pit-scout-baseline.json / pit-map.json
archives/2026cmptx-hopper/   Houston Hopper freeze
sync-server/                 Cloudflare Workers + D1 sync API
analysis/                    Independent analysis scripts + Hopper reports
```
