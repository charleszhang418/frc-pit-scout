/* Sync API URL and default event for the PWA.
 * Local: http://127.0.0.1:8787
 * Production: Cloudflare Worker below.
 */
window.PIT_SCOUT_CONFIG = {
  SYNC_API_URL: 'https://frc-pit-scout-sync.charleszhang418.workers.dev',
  DEFAULT_EVENT_ID: '2026-china-postseason',
  SYNC_INTERVAL_MS: 15000,
};
