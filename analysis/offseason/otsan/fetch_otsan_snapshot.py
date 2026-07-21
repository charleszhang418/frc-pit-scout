#!/usr/bin/env python3
"""
Fetch OTSAN (2026) qualification + rankings from frc-events HTML and compute
event-level strength metrics.

Off-season events are often missing from Statbotics/TBA, so we compute:
  - Ridge OPR / DPR / CCWM from completed QM totals
  - Iterative event EPA approximation (order-aware residual updates)
  - Auto EPA proxy = OPR × (FIRST ranking Auto Fuel / Match avg)
    (Auto Fuel is an alliance-average auto, not individual auto)

Writes (into this directory):
  - raw/{event,qualifications,rankings}.html
  - otsan_event_snapshot.json
  - otsan_qual_matches.csv
  - otsan_rankings.csv
  - otsan_epa_opr.csv
  - otsan_metrics_summary.json

Usage:
  python3 analysis/offseason/otsan/fetch_otsan_snapshot.py
"""

from __future__ import annotations

import csv
import json
import re
import urllib.request
from collections import defaultdict
from pathlib import Path
from typing import Any

import numpy as np

EVENT = "OTSAN"
YEAR = 2026
BASE = f"https://frc-events.firstinspires.org/{YEAR}/{EVENT}"
URLS = {
    "qualifications": f"{BASE}/qualifications",
    "rankings": f"{BASE}/rankings",
    "event": BASE,
}
RIDGE_LAM = 4.0
UA = "Mozilla/5.0 (compatible; OTSAN-scouting/1.0)"


def http_text(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read().decode("utf-8", errors="replace")


def extract_tables(html: str) -> list[list[str]]:
    rows = re.findall(r"<tr[^>]*>(.*?)</tr>", html, flags=re.I | re.S)
    parsed: list[list[str]] = []
    for r in rows:
        cells = re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", r, flags=re.I | re.S)
        clean = []
        for c in cells:
            c = re.sub(r"<[^>]+>", " ", c)
            c = re.sub(r"&nbsp;", " ", c)
            c = re.sub(
                r"&#x([0-9A-Fa-f]+);",
                lambda m: chr(int(m.group(1), 16)),
                c,
            )
            c = re.sub(r"&amp;", "&", c)
            c = re.sub(r"\s+", " ", c).strip()
            clean.append(c)
        if clean:
            parsed.append(clean)
    return parsed


def parse_matches(qual_html: str) -> list[dict[str, Any]]:
    matches: list[dict[str, Any]] = []
    for row in extract_tables(qual_html):
        if not row or not row[0].lower().startswith("qualification"):
            continue
        mnum = int(re.search(r"(\d+)", row[0]).group(1))
        time = row[1] if len(row) > 1 else ""
        teams: list[int | None] = []
        for i in range(2, 8):
            tok = re.sub(r"[^0-9]", "", row[i] if i < len(row) else "")
            teams.append(int(tok) if tok else None)
        red_s = row[8] if len(row) > 8 else ""
        blue_s = row[9] if len(row) > 9 else ""
        played = bool(re.fullmatch(r"\d+", red_s or "")) and bool(
            re.fullmatch(r"\d+", blue_s or "")
        )
        red_score = int(red_s) if played else None
        blue_score = int(blue_s) if played else None
        winner = None
        if played:
            if red_score > blue_score:
                winner = "red"
            elif blue_score > red_score:
                winner = "blue"
            else:
                winner = "tie"
        matches.append(
            {
                "match": f"qm{mnum}",
                "match_number": mnum,
                "comp_level": "qm",
                "time": time,
                "alliances": {
                    "red": {
                        "teams": teams[0:3],
                        "team_keys": [f"frc{t}" for t in teams[0:3]],
                        "score": red_score,
                    },
                    "blue": {
                        "teams": teams[3:6],
                        "team_keys": [f"frc{t}" for t in teams[3:6]],
                        "score": blue_score,
                    },
                },
                "winning_alliance": winner,
                "played": played,
            }
        )
    return matches


def parse_rankings(rank_html: str) -> list[dict[str, Any]]:
    rankings: list[dict[str, Any]] = []
    for row in extract_tables(rank_html):
        if not row or not re.fullmatch(r"\d+", row[0] or ""):
            continue
        m = re.match(r"(\d+)\s+(.*)", row[1])
        if not m:
            continue
        team = int(m.group(1))
        name = m.group(2).strip()
        wlt = re.findall(r"\d+", row[6] if len(row) > 6 else "")
        wins, losses, ties = (
            (int(wlt[0]), int(wlt[1]), int(wlt[2])) if len(wlt) >= 3 else (0, 0, 0)
        )
        rankings.append(
            {
                "rank": int(row[0]),
                "team": team,
                "name": name,
                "ranking_score": float(row[2]),
                "avg_match": float(row[3]),
                "avg_auto": float(row[4]),
                "avg_tower": float(row[5]),
                "record": row[6],
                "wins": wins,
                "losses": losses,
                "ties": ties,
                "matches_played": int(row[7])
                if len(row) > 7 and row[7].isdigit()
                else wins + losses + ties,
            }
        )
    return rankings


def ridge_opr(A: np.ndarray, y: np.ndarray, lam: float, prior: np.ndarray) -> np.ndarray:
    n = A.shape[1]
    ata = A.T @ A + lam * np.eye(n)
    aty = A.T @ y + lam * prior
    return np.linalg.solve(ata, aty)


def load_season_epa(root: Path) -> dict[int, dict[str, float | None]]:
    season: dict[int, dict[str, float | None]] = {}
    # Prefer local copy; else season scrape under analysis/
    candidates = [
        root / "hopper_raw_data.json",
        root.parent.parent / "hopper_raw_data.json",
    ]
    raw_path = next((p for p in candidates if p.exists()), None)
    if raw_path is None:
        return season
    raw = json.loads(raw_path.read_text())
    for d in raw:
        if not isinstance(d, dict) or "team" not in d:
            continue
        t = int(d["team"])
        epa_b = d.get("epa") or {}
        tp = epa_b.get("total_points") or {}
        bd = epa_b.get("breakdown") or {}
        if tp.get("mean") is None:
            continue
        season[t] = {
            "season_epa": tp.get("mean"),
            "season_auto": bd.get("auto_points"),
            "season_tele": bd.get("teleop_points"),
            "season_end": bd.get("endgame_points"),
        }
    return season


def compute_metrics(
    matches: list[dict[str, Any]],
    rankings: list[dict[str, Any]],
    season: dict[int, dict[str, float | None]],
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    played = [m for m in matches if m["played"]]
    rank_by = {r["team"]: r for r in rankings}
    teams = sorted(
        {
            t
            for m in played
            for color in ("red", "blue")
            for t in m["alliances"][color]["teams"]
        }
    )
    idx = {t: i for i, t in enumerate(teams)}
    n = len(teams)

    A: list[np.ndarray] = []
    ys: list[float] = []
    yo: list[float] = []
    for m in played:
        for color, opp in (("red", "blue"), ("blue", "red")):
            row = np.zeros(n)
            for t in m["alliances"][color]["teams"]:
                row[idx[t]] = 1.0
            A.append(row)
            ys.append(float(m["alliances"][color]["score"]))
            yo.append(float(m["alliances"][opp]["score"]))
    A_m = np.asarray(A, float)
    ys_a = np.asarray(ys, float)
    yo_a = np.asarray(yo, float)
    mean_alliance = float(ys_a.mean()) if len(ys_a) else 0.0

    prior = np.full(n, mean_alliance / 3.0)
    opr_ols, *_ = np.linalg.lstsq(A_m, ys_a, rcond=None)
    opr = ridge_opr(A_m, ys_a, RIDGE_LAM, prior)
    dpr = ridge_opr(A_m, yo_a, RIDGE_LAM, np.full(n, float(yo_a.mean()) / 3.0))
    ccwm = opr - dpr

    epa = {t: mean_alliance / 3.0 for t in teams}
    match_n: dict[int, int] = defaultdict(int)
    for m in sorted(played, key=lambda x: x["match_number"]):
        for color in ("red", "blue"):
            ts = m["alliances"][color]["teams"]
            score = float(m["alliances"][color]["score"])
            pred = sum(epa[t] for t in ts)
            resid = score - pred
            for t in ts:
                k = match_n[t]
                alpha = 0.5 / (1.0 + 0.35 * k)
                epa[t] += alpha * resid / 3.0
                match_n[t] += 1

    margins: dict[int, list[float]] = defaultdict(list)
    for m in played:
        for color, opp in (("red", "blue"), ("blue", "red")):
            sc = float(m["alliances"][color]["score"])
            oc = float(m["alliances"][opp]["score"])
            for t in m["alliances"][color]["teams"]:
                margins[t].append(sc - oc)

    rows: list[dict[str, Any]] = []
    for t in teams:
        r = rank_by.get(t, {})
        i = idx[t]
        share = None
        if r and r.get("avg_match"):
            share = float(r["avg_auto"]) / float(r["avg_match"])
        auto_proxy = float(opr[i]) * share if share is not None else None
        tele_proxy = float(opr[i]) - auto_proxy if auto_proxy is not None else None
        s = season.get(t, {})
        rows.append(
            {
                "team": t,
                "name": r.get("name", ""),
                "qual_rank": r.get("rank"),
                "ranking_score": r.get("ranking_score"),
                "wlt": r.get("record", ""),
                "wins": r.get("wins"),
                "losses": r.get("losses"),
                "ties": r.get("ties"),
                "matches_played": r.get("matches_played"),
                "avg_match": r.get("avg_match"),
                "avg_auto_alliance": r.get("avg_auto"),
                "opr": round(float(opr[i]), 2),
                "opr_ols": round(float(opr_ols[i]), 2),
                "dpr": round(float(dpr[i]), 2),
                "ccwm": round(float(ccwm[i]), 2),
                "event_epa": round(float(epa[t]), 2),
                "auto_epa_proxy": round(auto_proxy, 2) if auto_proxy is not None else None,
                "tele_end_proxy": round(tele_proxy, 2) if tele_proxy is not None else None,
                "avg_margin": round(sum(margins[t]) / len(margins[t]), 1)
                if margins[t]
                else None,
                "season_epa": s.get("season_epa"),
                "season_auto_epa": s.get("season_auto"),
                "season_tele_epa": s.get("season_tele"),
                "season_end_epa": s.get("season_end"),
                "is_demo": 9990 <= t <= 9999,
            }
        )

    for key, outk in (
        ("opr", "opr_rank"),
        ("event_epa", "epa_rank"),
        ("auto_epa_proxy", "auto_rank"),
        ("ccwm", "ccwm_rank"),
    ):
        ordered = sorted(
            [r for r in rows if r.get(key) is not None],
            key=lambda x: x[key],
            reverse=True,
        )
        for i, r in enumerate(ordered, 1):
            r[outk] = i
        for r in rows:
            r.setdefault(outk, None)

    rows_by_epa = sorted(rows, key=lambda x: x["event_epa"], reverse=True)
    real = [r for r in rows if not r["is_demo"]]
    meta = {
        "matches_played": len(played),
        "matches_total": len(matches),
        "teams": len(teams),
        "real_teams": len(real),
        "mean_alliance_score": round(mean_alliance, 1),
        "median_event_epa": round(float(np.median([r["event_epa"] for r in real])), 1)
        if real
        else None,
        "median_opr": round(float(np.median([r["opr"] for r in real])), 1)
        if real
        else None,
    }
    return rows_by_epa, meta


def main() -> int:
    root = Path(__file__).resolve().parent
    raw_dir = root / "raw"
    raw_dir.mkdir(exist_ok=True)

    print(f"Fetching {EVENT} pages from frc-events...", flush=True)
    htmls: dict[str, str] = {}
    for name, url in URLS.items():
        htmls[name] = http_text(url)
        (raw_dir / f"{name}.html").write_text(htmls[name])
        print(f"  {name}: {len(htmls[name])} bytes", flush=True)

    matches = parse_matches(htmls["qualifications"])
    rankings = parse_rankings(htmls["rankings"])
    season = load_season_epa(root)
    metrics, meta = compute_metrics(matches, rankings, season)

    method = {
        "event_epa": (
            "Iterative residual EPA on completed QM totals "
            "(order-aware, shrinking alpha). Statbotics event EPA usually "
            "unavailable for off-season."
        ),
        "opr": f"Ridge OPR (λ={RIDGE_LAM}) for small-sample stability; opr_ols also saved.",
        "auto_epa_proxy": (
            "OPR × (FIRST ranking Auto Fuel / Match avg). "
            "Auto Fuel is alliance-average auto, not individual."
        ),
        "season_epa": "Optional prior from analysis/hopper_raw_data.json when present.",
    }

    snapshot = {
        "event_code": EVENT,
        "event_name": (
            "World Robot Contest South China Championships 2026 - "
            "Sanya FRC / China Off-Season Presented by TIMKEN"
        ),
        "source_urls": URLS,
        "fetched_note": (
            "Scraped from frc-events HTML (FIRST API needs auth; "
            "TBA/Statbotics often omit off-season)."
        ),
        **meta,
        "matches": matches,
        "rankings": rankings,
        "metrics": metrics,
        "team_11118": next((r for r in metrics if r["team"] == 11118), None),
        "method": method,
    }
    (root / "otsan_event_snapshot.json").write_text(
        json.dumps(snapshot, indent=2) + "\n"
    )

    with (root / "otsan_qual_matches.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(
            f,
            fieldnames=[
                "match",
                "time",
                "red1",
                "red2",
                "red3",
                "blue1",
                "blue2",
                "blue3",
                "red_score",
                "blue_score",
                "winner",
                "played",
            ],
        )
        w.writeheader()
        for m in matches:
            r = m["alliances"]["red"]
            b = m["alliances"]["blue"]
            w.writerow(
                {
                    "match": m["match_number"],
                    "time": m["time"],
                    "red1": r["teams"][0],
                    "red2": r["teams"][1],
                    "red3": r["teams"][2],
                    "blue1": b["teams"][0],
                    "blue2": b["teams"][1],
                    "blue3": b["teams"][2],
                    "red_score": r["score"] if m["played"] else "",
                    "blue_score": b["score"] if m["played"] else "",
                    "winner": m["winning_alliance"] or "",
                    "played": m["played"],
                }
            )

    with (root / "otsan_rankings.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(
            f,
            fieldnames=[
                "rank",
                "team",
                "name",
                "ranking_score",
                "avg_match",
                "avg_auto_fuel",
                "avg_tower",
                "record",
                "wins",
                "losses",
                "ties",
                "matches_played",
            ],
        )
        w.writeheader()
        for r in rankings:
            w.writerow(
                {
                    "rank": r["rank"],
                    "team": r["team"],
                    "name": r["name"],
                    "ranking_score": r["ranking_score"],
                    "avg_match": r["avg_match"],
                    "avg_auto_fuel": r["avg_auto"],
                    "avg_tower": r["avg_tower"],
                    "record": r["record"],
                    "wins": r["wins"],
                    "losses": r["losses"],
                    "ties": r["ties"],
                    "matches_played": r["matches_played"],
                }
            )

    cols = [
        "epa_rank",
        "opr_rank",
        "auto_rank",
        "ccwm_rank",
        "qual_rank",
        "team",
        "name",
        "event_epa",
        "opr",
        "dpr",
        "ccwm",
        "auto_epa_proxy",
        "tele_end_proxy",
        "avg_match",
        "avg_auto_alliance",
        "ranking_score",
        "wlt",
        "matches_played",
        "avg_margin",
        "season_epa",
        "season_auto_epa",
        "season_tele_epa",
        "season_end_epa",
        "is_demo",
        "opr_ols",
    ]
    with (root / "otsan_epa_opr.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for r in metrics:
            w.writerow({k: r.get(k) for k in cols})

    summary = {
        "event": EVENT,
        "as_of": f"QM {meta['matches_played']}/{meta['matches_total']}",
        **meta,
        "metrics": metrics,
        "top_epa": metrics[:12],
        "team_11118": snapshot["team_11118"],
        "method": method,
    }
    (root / "otsan_metrics_summary.json").write_text(
        json.dumps(summary, indent=2) + "\n"
    )

    print(
        f"Completed QM: {meta['matches_played']}/{meta['matches_total']} | "
        f"mean alliance {meta['mean_alliance_score']} | "
        f"median EPA(real) {meta['median_event_epa']}",
        flush=True,
    )
    print("\nTop 10 by Event EPA:", flush=True)
    for r in metrics[:10]:
        demo = " [demo]" if r["is_demo"] else ""
        print(
            f"  #{r['epa_rank']:>2} {r['team']:<6} EPA {r['event_epa']:>6.1f}  "
            f"OPR {r['opr']:>6.1f}  Auto~ {r['auto_epa_proxy'] or 0:>5.1f}  "
            f"{r['wlt']}  {r['name']}{demo}",
            flush=True,
        )
    t = snapshot["team_11118"]
    if t:
        print(
            f"\n11118: qual#{t['qual_rank']} EPA#{t['epa_rank']} "
            f"OPR#{t['opr_rank']} Auto#{t['auto_rank']} | "
            f"EPA {t['event_epa']} OPR {t['opr']} Auto~ {t['auto_epa_proxy']} "
            f"| {t['wlt']}",
            flush=True,
        )
    print(
        "\nWrote otsan_epa_opr.csv / otsan_event_snapshot.json / "
        "otsan_metrics_summary.json",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
