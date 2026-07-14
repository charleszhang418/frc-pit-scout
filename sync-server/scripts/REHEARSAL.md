# Multi-device sync rehearsal checklist

Run this before the China event (and once after deploying to Cloudflare).

## 0. Upgrade Workers (event day)

1. Cloudflare dashboard → Workers & Pages → Plans → **Workers Paid** (~$5/mo).
2. Reason: free tier caps CPU at **10ms/request**, which is too tight for real push/pull batches.

## 1. Local API

```bash
cd sync-server
cp -n .dev.vars.example .dev.vars
npm install
npm run db:local
# edit seed/china-event.json with full roster + private inviteCode
npm run seed:local
npm run dev
```

In another terminal:

```bash
npm run test:api
```

## 2. Two-browser rehearsal

1. Serve the PWA: `python3 -m http.server 8765` from the repo root.
2. Open two browsers (or normal + private window) at `http://127.0.0.1:8765/`.
3. Set different scout names.
4. **Data → Join event** with the invite code on both.
5. On device A: edit a pit form for a team → confirm chip shows pending then synced.
6. On device B: **Sync now** or wait ~15s → confirm the same team data appears.
7. Airplane mode on A → edit again → chip shows offline pending → reconnect → sync.
8. Both devices edit the **same** team quickly → one should get a conflict or last accepted revision; confirm no silent wipe of the other device's unrelated teams.
9. Kill a tab mid-save → reopen → pending outbox should still sync.
10. **Download recovery JSON** on one device and confirm it still works as disaster recovery.

## 3. Deployed rehearsal

```bash
npx wrangler login
npx wrangler d1 create pit-scout   # update database_id in wrangler.jsonc
npm run db:remote
npx wrangler secret put SESSION_SECRET
npm run seed:remote
npm run deploy
```

Set `SYNC_API_URL` in `config.js` to the `*.workers.dev` URL, redeploy GitHub Pages / static host, repeat the two-phone test on real phones over hotspot.

## Pass criteria

- Offline entry never blocks on network.
- Reconnect syncs without duplicate rows (idempotent `operationId`).
- Second device receives data without JSON file transfer.
- Recovery JSON export still works.
