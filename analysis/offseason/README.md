# Off-season analysis

Separate from Championship / Hopper season scouting. Each event lives in its own folder.

| Event | Folder | Notes |
|-------|--------|-------|
| **OTSAN** 2026 (Sanya / South China) | [`otsan/`](otsan/) | China off-season · scraped from frc-events (Statbotics/TBA usually omit off-season) |

## Quick start (OTSAN)

```bash
python3 analysis/offseason/otsan/fetch_otsan_snapshot.py
```

That refreshes quals/rankings HTML, recomputes ridge OPR + event EPA + Auto~, and writes CSVs/JSON next to the script.
