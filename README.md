# FRC Pit Scout — Houston 2026

面向 FRC 锦标赛的离线优先 pit / 预侦察 / 资格赛记录工具。纯浏览器运行，数据存 IndexedDB，无需后端。

**线上地址（GitHub Pages）：** https://charleszhang418.github.io/frc-pit-scout/

---

## 本地运行

必须通过 **HTTP** 访问（不要用 `file://` 直接打开 `index.html`），否则 `teams.csv`、Service Worker 和共享 JSON 可能无法正常加载。

在本仓库根目录执行：

```bash
cd /path/to/Scouting
python3 -m http.server 8765
```

浏览器打开：**http://127.0.0.1:8765/**

若 8765 端口被占用，可换成其他端口，例如 `8080`。

---

## 线上共享数据（无需手动导入）

以下文件与 `index.html` 同级，应用启动时会自动拉取并合并：

| 文件 | 说明 |
|------|------|
| `prescouting.json` | 预侦察基线（tier、角色、摘要等）。本机已填写的字段优先保留。 |
| `pit-scout-baseline.json` | Pit + Qual 备份（v2 导出格式）。备份较新或本机无 `updatedAt` 时合并。 |
| `teams.csv` | 全场队伍列表与分区。 |

更新 GitHub Pages 上的共享数据：在应用中导出 → 替换对应文件 → commit → push。部署约 1–2 分钟后，强制刷新页面即可。

仍可使用 **Data → Import JSON** 或 **Import Pre-Scout JSON** 手动导入。

---

## 应用结构

- **Dashboard / Teams** — 按分区筛选（默认 **Hopper**）、搜索、进入队伍表单。
- **Pre** — 预侦察字段，存 `prescouting.json` / localStorage。
- **Pit** — 完成状态、射球、攀爬、照片、备注，存 IndexedDB。
- **Qual** — 按场次录入：6 支队伍、比分、每队备注。
- **Data** — CSV / JSON 导出与导入。

---

## 常见问题

- **队伍数为 0 / 列表为空** — 检查分区筛选（可试 **All Divisions**）。需联网以便加载 `teams.csv`。Pit 数据缺失时，可 **Data → Import JSON** 导入一次备份。
- **推送后页面仍是旧版** — 关闭标签页重新打开，或清除该站点的网站数据，让 Service Worker 更新（版本号见 `service-worker.js` 中的 `pit-scout-v*`）。
- **`pit-scout-baseline.json` 较大** — 会先显示 `teams.csv` 的名单，再在后台合并 pit 备份。

---

## 目录说明

```
index.html              主界面
app.js                  逻辑与 IndexedDB
styles.css
teams.csv               队伍名单
prescouting.json        共享预侦察基线
pit-scout-baseline.json 共享 pit/qual 备份（可选，体积较大）
service-worker.js       离线缓存
analysis/               独立分析脚本（运行应用不需要）
```
