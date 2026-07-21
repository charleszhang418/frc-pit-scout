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

/** Projection from Q36 state · 5000 Monte Carlo sims · event-EPA model */
const META = {
  asOf: "36/48",
  remaining: 12,
  sims: 5000,
  sigma: 84,
};

const US = {
  cur: 12,
  meanRank: 15.7,
  p50: 15,
  band: "10–20",
  top8: 0.5,
  q39: 45,
  q44: 24,
  expectedW: "~3.7 / 7",
};

const REMAINING = [
  ["Q37", "9:00", "8214 · 6766 · 9597", "6487 · 9994 · 9997", "420–345", "74% RED", "8214 favored over 9997 stack"],
  ["Q38", "9:12", "5515 · 11352 · 10016", "6940 · 8015 · 6433", "120–235", "84% BLUE", "6940 cruise"],
  ["Q39", "9:24", "10120 · 11256 · 9995", "11019 · 11328 · 11118", "315–300", "55% RED", "11118 coin-flip"],
  ["Q40", "9:36", "5823 · 9992 · 6706", "7002 · 8810 · 9991", "223–275", "68% BLUE", "8810 edge"],
  ["Q41", "9:48", "6907 · 6399 · 9996", "5849 · 10711 · 10541", "210–259", "67% BLUE", "10541 side"],
  ["Q42", "10:00", "6433 · 10000 · 6353", "9999 · 6766 · 8015", "162–251", "78% BLUE", "6766 carry"],
  ["Q43", "10:12", "9994 · 9995 · 8011", "5516 · 6487 · 10016", "307–185", "85% RED", "8011 lock"],
  ["Q44", "10:24", "11352 · 10479 · 6940", "11118 · 9991 · 9992", "304–222", "76% RED", "11118 underdog"],
  ["Q45", "10:36", "10541 · 11019 · 11256", "6941 · 8214 · 6706", "323–399", "75% BLUE", "8214 closes"],
  ["Q46", "10:48", "5449 · 5515 · 9996", "10120 · 6907 · 5823", "145–281", "88% BLUE", "soft red"],
  ["Q47", "11:00", "9997 · 11328 · 6394", "6494 · 5849 · 7002", "379–249", "86% RED", "9997 + SIA"],
  ["Q48", "11:12", "9597 · 8810 · 9635", "10711 · 6399 · 6940", "298–247", "68% RED", "close finale"],
];

const FINAL_TOP = [
  ["1", "8214", "1", "1.2", "1–2", "100%", "5–0", "Cyber Unicorn"],
  ["2", "9997*", "2", "2.1", "1–3", "100%", "5–0", "Demo"],
  ["3", "8011", "4", "3.5", "3–5", "100%", "5–1", "Wayi Guangzhou"],
  ["4", "9635", "5", "4.5", "3–6", "100%", "5–1", "Cyber Rabbit"],
  ["5", "6940", "3", "4.6", "2–7", "100%", "4–0", "Violet Z"],
  ["6", "10479", "7", "5.7", "5–7", "100%", "4–2", "Powerhouse"],
  ["7", "11328", "6", "7.0", "5–8", "97%", "4–1", "SIA"],
  ["8", "8810", "8", "7.7", "6–9", "86%", "3–2", "Alphabots"],
  ["9", "6907", "11", "11.2", "9–14", "4%", "3–2", "G.O.A.T"],
  ["10", "10541", "10", "11.8", "9–16", "1%", "3–2", "CarbonPulse"],
  ["11", "11256", "9", "11.8", "9–16", "9%", "3–2", "Satellites"],
  ["16", "11118", "12", "15.7", "10–20", "0.5%", "3–2", "The Baybies"],
];

const BUBBLE = [
  { t: "8810", p: 86 },
  { t: "11256", p: 9 },
  { t: "6907", p: 4 },
  { t: "9995*", p: 3 },
  { t: "10541", p: 1 },
  { t: "11118", p: 0.5 },
];

const US_OUTCOMES = [
  ["Best realistic", "W Q39 · W Q44", "~5–2", "qual ~#10"],
  ["Base case", "split or 0–2", "~3–4 / 4–3", "qual ~#15"],
  ["Floor", "L Q39 · L Q44", "3–4", "qual ~#18–20"],
];

export default function OtsanFinalProjection() {
  return (
    <Stack gap={24}>
      <Stack gap={8}>
        <H1>OTSAN — Remaining quals & final projection</H1>
        <Text tone="secondary">
          Night block Q37–Q48 (Tue 7/21 9PM ET / Wed morning China) · playoffs not posted yet · model: event EPA + σ={META.sigma}
        </Text>
        <Row gap={8} wrap>
          <Pill tone="warning">{META.remaining} matches left</Pill>
          <Pill>{META.sims.toLocaleString()} sims</Pill>
          <Pill tone="info">As of Q{META.asOf}</Pill>
        </Row>
      </Stack>

      <Grid columns={4} gap={12}>
        <Stat value="8214" label="Projected #1 (near lock)" tone="success" />
        <Stat value="8" label="Likely captain cut line" />
        <Stat value={`#${US.p50}`} label="11118 expected finish" tone="info" />
        <Stat value={`${US.top8}%`} label="11118 Top-8 %" />
      </Grid>

      <Callout tone="info" title="How this works">
        Alliance μ = sum of event EPA. Win probs from calibrated score noise (σ≈84). Ranking Score projected with ~2 RP/win + typical objective bonus from current field. Off-season demo 999x included as scheduled. Playoff bracket still empty on FIRST — this is qualification finish only.
      </Callout>

      <H2>Remaining slate Q37–Q48</H2>
      <Text tone="secondary" size="small">
        Favored side & confidence · predicted μ scores (EPA sum, not raw field points)
      </Text>
      <Table
        headers={["Match", "ET", "Red", "Blue", "μ R–B", "Lean", "Note"]}
        rows={REMAINING}
        rowTone={REMAINING.map((r) =>
          String(r[2]).includes("11118") || String(r[3]).includes("11118")
            ? ("info" as const)
            : undefined,
        )}
        striped
        stickyHeader
      />

      <H2>11118 path</H2>
      <Grid columns={2} gap={12}>
        <Card>
          <CardHeader>Two matches left</CardHeader>
          <CardBody>
            <Stack gap={8}>
              <Text>
                <Text as="span" weight="semibold">Q39</Text> Blue w/ 11019 · 11328 vs 10120 · 11256 · 9995 — win ~{US.q39}% (toss-up)
              </Text>
              <Text>
                <Text as="span" weight="semibold">Q44</Text> Blue w/ 9991 · 9992 vs 11352 · 10479 · 6940 — win ~{US.q44}% (underdog)
              </Text>
              <Text tone="secondary">
                Expected finish ~#{US.p50} (80% band {US.band}). Climbing into top 8 is unlikely (~{US.top8}%) without both wins plus help.
              </Text>
            </Stack>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>Outcome scenarios</CardHeader>
          <CardBody>
            <Table headers={["Case", "Results", "Record", "Likely qual"]} rows={US_OUTCOMES} />
          </CardBody>
        </Card>
      </Grid>

      <Divider />

      <H2>Projected final qual order</H2>
      <Text tone="secondary" size="small">
        Sorted by E[rank] · Top8% = P(finish ≤8) · * demo
      </Text>
      <Table
        headers={["E#", "Team", "Now", "E[Rk]", "10–90", "Top8%", "Now W–L", "Name"]}
        rows={FINAL_TOP}
        rowTone={FINAL_TOP.map((r) =>
          r[1] === "11118" ? ("info" as const) : String(r[1]).includes("*") ? ("neutral" as const) : undefined,
        )}
        striped
      />

      <H2>Race for 8th (captain bubble)</H2>
      <BarChart
        horizontal
        height={220}
        categories={BUBBLE.map((d) => d.t)}
        series={[{ name: "P(finish top 8) %", data: BUBBLE.map((d) => d.p), tone: "warning" }]}
      />
      <Text tone="secondary" size="small">
        8810 is the default 8-seed. 11256 / 6907 are the main chasers if 8810 slips. 11118 needs a miracle ticket.
      </Text>

      <Callout tone="success" title="Headline picks">
        #1 8214 locks unless catastrophe. Real-team podium: 8011 / 9635 / 6940 / 10479 scramble 3–6. Night swing matches: Q37 (8214 vs 9997 alliance), Q39 (11118 coin-flip), Q44 (11118 vs 10479+6940), Q48 (8810/9635 vs 6940).
      </Callout>

      <Text tone="secondary" size="small">
        Files: analysis/otsan_remaining_preds.csv · otsan_final_projection.json · re-run after night session
      </Text>
    </Stack>
  );
}
