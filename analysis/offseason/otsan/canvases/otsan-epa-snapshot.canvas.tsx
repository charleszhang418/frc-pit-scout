import {
  BarChart,
  Callout,
  Card,
  CardBody,
  CardHeader,
  Divider,
  Grid,
  H1,
  H2,
  Pill,
  Row,
  Stack,
  Stat,
  Table,
  Text,
} from "cursor/canvas";

/** Refresh: 2026-07-21 after Q36 · 12 quals left tonight */
const META = {
  played: 36,
  total: 48,
  todayPlayed: 22,
  todayTotal: 34,
  remaining: 12,
  meanAlliance: 264.3,
  todayMean: 271.4,
  medianEpa: 81.9,
  highScore: 840,
};

const US = {
  team: 11118,
  name: "The Baybies",
  qual: 12,
  rs: 2.6,
  wlt: "3–2–0",
  epa: 82.4,
  epaRank: 20,
  opr: 98.7,
  oprRank: 14,
  auto: 23.8,
  autoRank: 10,
  tele: 75.0,
  ccwm: 25.6,
  avgMatch: 259,
  avgAuto: 62.4,
  margin: 26.6,
  seasonEpa: 72.7,
  today: "2–1",
  todayScores: "490 / 447 / 221",
};

const US_MATCHES = [
  ["Q4", "L", "66–217", "5849 · 5516", "5823 · 9597 · 11019", "Mon"],
  ["Q12", "W", "146–121", "10000 · 5449", "9996 · 10016 · 9994", "Mon"],
  ["Q20", "W", "490–376", "9997 · 6907", "6487 · 9999 · 9635", "Tue"],
  ["Q24", "W", "447–179", "8011 · 10711", "6766 · 6353 · 7002", "Tue"],
  ["Q28", "L", "221–344", "9996 · 8015", "6399 · 6941 · 6494", "Tue"],
];

const US_REMAINING = [
  [
    "Q39",
    "9:24 PM",
    "Blue",
    "11019 · 11328",
    "10120 · 11256 · 9995",
    "partners EPA Σ217 vs opp Σ315",
  ],
  [
    "Q44",
    "10:24 PM",
    "Blue",
    "9991 · 9992",
    "11352 · 10479 · 6940",
    "partners EPA Σ140 vs opp Σ304 — tough",
  ],
];

type M = {
  er: number;
  or: number;
  ar: number;
  qr: number;
  team: number;
  name: string;
  epa: number;
  opr: number;
  auto: number;
  ccwm: number;
  wlt: string;
  demo?: boolean;
  us?: boolean;
};

const FIELD: M[] = [
  { er: 1, or: 1, ar: 1, qr: 1, team: 8214, name: "Cyber Unicorn", epa: 233.4, opr: 256.2, auto: 51.0, ccwm: 215.8, wlt: "5–0" },
  { er: 2, or: 2, ar: 5, qr: 2, team: 9997, name: "Demo 9997", epa: 205.3, opr: 196.0, auto: 29.1, ccwm: 116.1, wlt: "5–0", demo: true },
  { er: 3, or: 3, ar: 3, qr: 4, team: 8011, name: "Wayi Guangzhou", epa: 178.6, opr: 159.9, auto: 31.0, ccwm: 120.9, wlt: "5–1" },
  { er: 4, or: 4, ar: 7, qr: 7, team: 10479, name: "Powerhouse", epa: 166.7, opr: 150.2, auto: 27.6, ccwm: 46.8, wlt: "4–2" },
  { er: 5, or: 9, ar: 8, qr: 18, team: 6766, name: "AtomStorm", epa: 139.6, opr: 128.1, auto: 26.0, ccwm: 6.2, wlt: "2–3" },
  { er: 6, or: 8, ar: 6, qr: 6, team: 11328, name: "SIA", epa: 138.6, opr: 130.8, auto: 28.8, ccwm: 101.8, wlt: "4–1" },
  { er: 7, or: 13, ar: 12, qr: 9, team: 11256, name: "Satellites", epa: 134.0, opr: 108.2, auto: 20.5, ccwm: 62.9, wlt: "3–2" },
  { er: 8, or: 5, ar: 9, qr: 8, team: 8810, name: "The Alphabots", epa: 129.4, opr: 146.2, auto: 25.8, ccwm: 64.0, wlt: "3–2" },
  { er: 9, or: 7, ar: 2, qr: 3, team: 6940, name: "Violet Z", epa: 123.6, opr: 137.4, auto: 38.2, ccwm: 85.4, wlt: "4–0" },
  { er: 10, or: 6, ar: 4, qr: 5, team: 9635, name: "Cyber Rabbit", epa: 122.2, opr: 142.5, auto: 30.8, ccwm: 46.1, wlt: "5–1" },
  { er: 11, or: 10, ar: 11, qr: 16, team: 6494, name: "Wings of Liberty", epa: 111.2, opr: 125.4, auto: 23.4, ccwm: 51.4, wlt: "3–3" },
  { er: 12, or: 11, ar: 13, qr: 10, team: 10541, name: "CarbonPulse", epa: 110.5, opr: 124.4, auto: 20.3, ccwm: 87.0, wlt: "3–2" },
  { er: 13, or: 12, ar: 15, qr: 11, team: 6907, name: "The G.O.A.T", epa: 108.4, opr: 112.8, auto: 20.1, ccwm: 2.0, wlt: "3–2" },
  { er: 14, or: 16, ar: 14, qr: 19, team: 6487, name: "Clockwork Knights", epa: 105.0, opr: 90.8, auto: 20.3, ccwm: -37.2, wlt: "2–3" },
  { er: 20, or: 14, ar: 10, qr: 12, team: 11118, name: "The Baybies", epa: 82.4, opr: 98.7, auto: 23.8, ccwm: 25.6, wlt: "3–2", us: true },
  { er: 21, or: 19, ar: 22, qr: 13, team: 5849, name: "Joker", epa: 81.4, opr: 80.1, auto: 14.0, ccwm: 18.0, wlt: "3–2" },
  { er: 23, or: 21, ar: 16, qr: 17, team: 6941, name: "IronPulse", epa: 78.3, opr: 83.5, auto: 17.1, ccwm: -5.0, wlt: "4–2" },
  { er: 29, or: 23, ar: 25, qr: 15, team: 6399, name: "Tinspiratio", epa: 56.1, opr: 67.9, auto: 12.9, ccwm: 20.0, wlt: "4–1" },
  { er: 36, or: 36, ar: 38, qr: 41, team: 10016, name: "Absolute Zero", epa: 42.3, opr: 34.2, auto: 5.5, ccwm: -40.0, wlt: "0–5" },
  { er: 41, or: 41, ar: 41, qr: 38, team: 11352, name: "Flying Tiger", epa: 13.5, opr: 19.6, auto: 4.1, ccwm: -120.0, wlt: "1–4" },
];

const EPA_TOP = [
  { t: "8214", v: 233 },
  { t: "9997*", v: 205 },
  { t: "8011", v: 179 },
  { t: "10479", v: 167 },
  { t: "6766", v: 140 },
  { t: "11328", v: 139 },
  { t: "11256", v: 134 },
  { t: "8810", v: 129 },
  { t: "6940", v: 124 },
  { t: "9635", v: 122 },
  { t: "6494", v: 111 },
  { t: "11118", v: 82 },
];

const AUTO_TOP = [
  { t: "8214", v: 51.0 },
  { t: "6940", v: 38.2 },
  { t: "8011", v: 31.0 },
  { t: "9635", v: 30.8 },
  { t: "9997*", v: 29.1 },
  { t: "11328", v: 28.8 },
  { t: "10479", v: 27.6 },
  { t: "6766", v: 26.0 },
  { t: "8810", v: 25.8 },
  { t: "11118", v: 23.8 },
];

const TODAY_HIGHLIGHTS = [
  ["Q26", "840–99", "8214 · 10541 · 9997", "day high score"],
  ["Q30", "532–371", "10479 · 8214 · 6433", "8214 still rolling"],
  ["Q20", "490–376", "11118 · 9997 · 6907", "11118 peak"],
  ["Q24", "447–179", "11118 · 8011 · 10711", "11118 + 8011"],
  ["Q28", "221–344", "9996 · 8015 · 11118", "11118 loss"],
  ["Q36", "336–269", "10479 · 9635 · 10000", "last before night"],
];

const OFFICIAL_TOP = [
  ["1", "8214", "5.00", "595", "5–0", "Cyber Unicorn"],
  ["2", "9997*", "4.60", "528", "5–0", "Demo"],
  ["3", "6940", "4.50", "344", "4–0", "Violet Z"],
  ["4", "8011", "3.83", "410", "5–1", "Wayi"],
  ["5", "9635", "3.67", "323", "5–1", "Cyber Rabbit"],
  ["6", "11328", "3.60", "361", "4–1", "SIA"],
  ["7", "10479", "3.50", "424", "4–2", "Powerhouse"],
  ["8", "8810", "3.40", "371", "3–2", "Alphabots"],
  ["9", "11256", "3.00", "334", "3–2", "Satellites"],
  ["10", "10541", "2.80", "363", "3–2", "CarbonPulse"],
  ["11", "6907", "2.80", "308", "3–2", "G.O.A.T"],
  ["12", "11118", "2.60", "259", "3–2", "The Baybies"],
];

function fieldRows(rows: M[]) {
  return rows.map((r) => [
    r.er,
    r.or,
    r.ar,
    r.qr,
    r.team,
    r.name + (r.demo ? " *" : ""),
    r.epa.toFixed(1),
    r.opr.toFixed(1),
    r.auto.toFixed(1),
    r.ccwm.toFixed(0),
    r.wlt,
  ]);
}

function fieldTones(rows: M[]) {
  return rows.map((r) =>
    r.us ? ("info" as const) : r.demo ? ("neutral" as const) : undefined,
  );
}

export default function OtsanDayRefresh() {
  return (
    <Stack gap={24}>
      <Stack gap={8}>
        <H1>OTSAN — Day refresh (through Q36)</H1>
        <Text tone="secondary">
          Tue 7/21 session done · night block Q37–Q48 starts 9:00 PM ET · frc-events scrape
        </Text>
        <Row gap={8} wrap>
          <Pill tone="success">{META.played}/{META.total} quals</Pill>
          <Pill>Today {META.todayPlayed}/{META.todayTotal} played</Pill>
          <Pill tone="warning">{META.remaining} left tonight</Pill>
          <Pill tone="info">11118 · qual #12</Pill>
        </Row>
      </Stack>

      <Grid columns={4} gap={12}>
        <Stat value={`${META.played}/${META.total}`} label="Quals complete" tone="success" />
        <Stat value={META.meanAlliance.toFixed(0)} label="Mean alliance (all)" />
        <Stat value={String(META.highScore)} label="High score (Q26)" />
        <Stat value={META.medianEpa.toFixed(0)} label="Median EPA (real)" />
      </Grid>

      <Callout tone="info" title="What changed since half-quals">
        8214 pulled away (EPA 195→233, still undefeated). 9997 demo stays #2. 8011 dipped slightly after a loss but remains elite. 11118 went 2–1 today (big wins Q20/Q24, loss Q28) — still ~median EPA, Auto~ still top-10.
      </Callout>

      <H2>11118 right now</H2>
      <Grid columns={4} gap={12}>
        <Stat value={`#${US.qual}`} label={`Qual · RS ${US.rs}`} tone="info" />
        <Stat value={US.epa.toFixed(1)} label={`Event EPA · #${US.epaRank}`} />
        <Stat value={US.opr.toFixed(1)} label={`OPR · #${US.oprRank}`} />
        <Stat value={US.auto.toFixed(1)} label={`Auto~ · #${US.autoRank}`} tone="success" />
      </Grid>
      <Grid columns={2} gap={12}>
        <Card>
          <CardHeader trailing={<Pill tone="info">{US.wlt}</Pill>}>All 5 matches</CardHeader>
          <CardBody>
            <Table
              headers={["Match", "Res", "Score", "Partners", "Opponents", "Day"]}
              rows={US_MATCHES}
              striped
            />
            <Text tone="secondary" size="small">
              Today {US.today} · scores {US.todayScores} · season EPA prior {US.seasonEpa}
            </Text>
          </CardBody>
        </Card>
        <Card>
          <CardHeader trailing={<Pill tone="warning">2 left</Pill>}>Tonight remaining</CardHeader>
          <CardBody>
            <Table
              headers={["Match", "Time", "Side", "Partners", "Opponents", "EPA lens"]}
              rows={US_REMAINING}
            />
            <Text tone="secondary" size="small">
              Q44 looks hard on paper (10479+6940 opposite, demo partners). Q39 partners include 11328 (EPA #6).
            </Text>
          </CardBody>
        </Card>
      </Grid>

      <Divider />

      <H2>Event EPA ladder</H2>
      <Text tone="secondary" size="small">
        Ridge OPR + iterative EPA · * = off-season demo · source otsan_epa_opr.csv
      </Text>
      <BarChart
        horizontal
        height={340}
        categories={EPA_TOP.map((d) => d.t)}
        series={[{ name: "Event EPA", data: EPA_TOP.map((d) => d.v), tone: "info" }]}
        referenceLines={[
          { value: META.medianEpa, label: "median", tone: "neutral" },
          { value: US.epa, label: "11118", tone: "warning" },
        ]}
      />

      <H2>Full strength table (selected + 11118 band)</H2>
      <Table
        headers={["EPA#", "OPR#", "Auto#", "Qual#", "Team", "Name", "EPA", "OPR", "Auto~", "CCWM", "W–L"]}
        rows={fieldRows(FIELD)}
        rowTone={fieldTones(FIELD)}
        striped
        stickyHeader
      />

      <Grid columns={2} gap={16}>
        <Stack gap={8}>
          <H2>Auto~ leaders</H2>
          <BarChart
            horizontal
            height={280}
            categories={AUTO_TOP.map((d) => d.t)}
            series={[{ name: "Auto EPA proxy", data: AUTO_TOP.map((d) => d.v), tone: "success" }]}
          />
        </Stack>
        <Stack gap={8}>
          <H2>Official qual board (top 12)</H2>
          <Table
            headers={["Rank", "Team", "RS", "Avg Match", "W–L", "Name"]}
            rows={OFFICIAL_TOP}
            rowTone={OFFICIAL_TOP.map((r) =>
              r[1] === "11118" ? ("info" as const) : String(r[1]).includes("*") ? ("neutral" as const) : undefined,
            )}
            striped
          />
        </Stack>
      </Grid>

      <H2>Today highlights (Tue 7/21)</H2>
      <Table
        headers={["Match", "Score", "Alliance", "Note"]}
        rows={TODAY_HIGHLIGHTS}
        striped
      />

      <Callout tone="warning" title="Files refreshed">
        analysis/otsan_today_quals.csv (all Tue Q15–Q48) · otsan_epa_opr.csv · otsan_epa_opr_full.csv · otsan_event_snapshot.json. Re-run python3 analysis/fetch_otsan_snapshot.py after the night session.
      </Callout>
    </Stack>
  );
}
