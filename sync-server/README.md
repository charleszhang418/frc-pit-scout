# FRC Pit Scout — Sync Server (Cloudflare Workers + D1)

Offline-first multi-device sync API for the pit scout PWA.

## Cost

- **Free** for local/dev and light use (Workers Free + D1 Free + R2 Free later).
- Before the China event, upgrade to **Workers Paid (~$5/mo)** so sync is not capped by the free-tier **10ms CPU** limit.

## Setup

```bash
cd sync-server
cp .dev.vars.example .dev.vars
npm install
npm run db:local
npm run seed:local
npm run dev
```

API defaults to `http://127.0.0.1:8787`.

### Production

```bash
npx wrangler login
npx wrangler d1 create pit-scout   # paste database_id into wrangler.jsonc
npm run db:remote
# set secret:
npx wrangler secret put SESSION_SECRET
# edit seed/china-event.json (roster + inviteCode), then:
npm run seed:remote
npm run deploy
```

Point the PWA `config.js` `SYNC_API_URL` at the deployed `*.workers.dev` URL.

## Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | no | Connectivity probe |
| POST | `/auth/join` | invite code | Device session |
| POST | `/sync/push` | Bearer | Upload outbox batch |
| GET | `/sync/pull?eventId=&cursor=` | Bearer | Incremental changes |
| GET | `/events/:eventId/snapshot` | Bearer | Bootstrap roster + records |

Default invite (example seed): event `2026-china-postseason`, code `CHINA2026` — change before real use.

## Rehearsal

See [scripts/REHEARSAL.md](scripts/REHEARSAL.md).
