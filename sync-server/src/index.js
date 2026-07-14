import { corsHeaders, error, json, noContent } from './cors.js';
import { handleJoin, handlePull, handlePush, handleSnapshot, requireSession } from './sync.js';

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return noContent();

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    try {
      if (path === '/health' && request.method === 'GET') {
        return json({
          ok: true,
          service: 'frc-pit-scout-sync',
          defaultEventId: env.DEFAULT_EVENT_ID || null,
          time: new Date().toISOString(),
        });
      }

      if (path === '/auth/join' && request.method === 'POST') {
        return await handleJoin(request, env);
      }

      if (path === '/sync/push' && request.method === 'POST') {
        const { session, errorResponse } = await requireSession(request, env);
        if (errorResponse) return errorResponse;
        return await handlePush(request, env, session);
      }

      if (path === '/sync/pull' && request.method === 'GET') {
        const { session, errorResponse } = await requireSession(request, env);
        if (errorResponse) return errorResponse;
        return await handlePull(request, env, session);
      }

      const snapMatch = path.match(/^\/events\/([^/]+)\/snapshot$/);
      if (snapMatch && request.method === 'GET') {
        const { session, errorResponse } = await requireSession(request, env);
        if (errorResponse) return errorResponse;
        return await handleSnapshot(request, env, session, decodeURIComponent(snapMatch[1]));
      }

      return error(404, 'Not found');
    } catch (e) {
      console.error(e);
      return error(500, 'Internal error', { detail: String(e.message || e) });
    }
  },
};
