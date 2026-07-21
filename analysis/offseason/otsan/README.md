# OTSAN 2026 — Sanya / South China off-season

Event: [frc-events · OTSAN](https://frc-events.firstinspires.org/2026/OTSAN)  
Team focus: **11118 The Baybies**

## Refresh data

```bash
python3 analysis/offseason/otsan/fetch_otsan_snapshot.py
```

Off-season → FIRST HTML scrape (no Statbotics event EPA). Metrics:

| Output | Meaning |
|--------|---------|
| `event_epa` | Iterative residual EPA on completed QM totals |
| `opr` / `dpr` / `ccwm` | Ridge OPR (λ=4) for small-sample stability |
| `auto_epa_proxy` | OPR × (FIRST Auto Fuel ÷ Match avg) — Auto Fuel is alliance-average |

## Key files

| File | Contents |
|------|----------|
| `otsan_qual_matches.csv` | Full qual schedule + scores |
| `otsan_today_quals.csv` | Tue 7/21 block (Q15–Q48) |
| `otsan_rankings.csv` | Official FIRST rankings snapshot |
| `otsan_epa_opr.csv` | Full-field EPA / OPR / Auto ranks |
| `otsan_remaining_preds.csv` | Q37–Q48 win probs (EPA model) |
| `otsan_final_projection.json` | Monte Carlo final qual finish |
| `otsan_event_snapshot.json` | Combined audit snapshot |
| `raw/*.html` | Last scraped FIRST pages |
| `canvases/*.canvas.tsx` | Cursor canvas copies (EPA board + final projection) |

## Notes

- Demo teams `9991–9999` are scheduled robots — treat separately when ranking “real” China teams.
- Playoff bracket appears only after quals; re-run the fetch script when night session ends.
