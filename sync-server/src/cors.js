/** CORS helpers for browser PWA clients. */

const DEFAULT_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

export function corsHeaders(extra = {}) {
  return { ...DEFAULT_HEADERS, ...extra };
}

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders({
      'Content-Type': 'application/json; charset=utf-8',
      ...extraHeaders,
    }),
  });
}

export function noContent() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export function error(status, message, extra = {}) {
  return json({ error: message, ...extra }, status);
}
