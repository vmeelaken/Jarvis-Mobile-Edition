// Cloudflare Worker: a small proxy that keeps the Gemini API key on the server.
// The web app calls this Worker instead of Google directly, so visitors never need a key.
//
// Required secret:   GEMINI_API_KEY   (wrangler secret put GEMINI_API_KEY)
// Optional vars:     ALLOWED_ORIGINS  comma-separated list of sites allowed to call this Worker
//                    ALLOWED_MODELS   comma-separated model names (defaults below)
// Optional binding:  RATE_LIMITER     per-IP rate limit (see wrangler.toml)

const UPSTREAM = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const DEFAULT_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-flash-lite-latest', 'gemini-3-flash-preview'];
const MAX_BODY_BYTES = 8 * 1024 * 1024;

const list = value => String(value || '').split(',').map(item => item.trim()).filter(Boolean);

function corsHeaders(origin, env) {
  if (!origin || !list(env.ALLOWED_ORIGINS).includes(origin)) return null;
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
}

function errorResponse(status, code, message, cors) {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/') return new Response('Jarvis proxy is running.');

    const cors = corsHeaders(request.headers.get('Origin'), env);
    if (!cors) return errorResponse(403, 'forbidden_origin', 'This origin is not allowed.', {});
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return errorResponse(405, 'method_not_allowed', 'Use POST.', cors);
    if (!env.GEMINI_API_KEY) return errorResponse(500, 'not_configured', 'The server is missing its Gemini API key.', cors);

    if (env.RATE_LIMITER) {
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      const { success } = await env.RATE_LIMITER.limit({ key: ip });
      if (!success) return errorResponse(429, 'rate_limited', 'Too many requests. Please retry in 60s.', cors);
    }

    const declaredLength = Number(request.headers.get('Content-Length') || 0);
    if (declaredLength > MAX_BODY_BYTES) return errorResponse(413, 'too_large', 'Request is too large.', cors);
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return errorResponse(413, 'too_large', 'Request is too large.', cors);

    let body;
    try {
      body = JSON.parse(raw);
    } catch (e) {
      return errorResponse(400, 'bad_request', 'Body must be valid JSON.', cors);
    }

    const allowedModels = list(env.ALLOWED_MODELS).length ? list(env.ALLOWED_MODELS) : DEFAULT_MODELS;
    if (typeof body?.model !== 'string' || !allowedModels.includes(body.model)) {
      return errorResponse(400, 'bad_model', 'That model is not allowed.', cors);
    }
    if (!body.input || (typeof body.input !== 'string' && !Array.isArray(body.input))) {
      return errorResponse(400, 'bad_request', 'Missing input.', cors);
    }

    // Forward only the fields the app needs; nothing else (such as tools) is passed through.
    const payload = { model: body.model, input: body.input, store: false };
    if (typeof body.system_instruction === 'string' && body.system_instruction) payload.system_instruction = body.system_instruction;

    let upstream;
    try {
      upstream = await fetch(UPSTREAM, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
        body: JSON.stringify(payload)
      });
    } catch (e) {
      return errorResponse(502, 'upstream_unreachable', 'Could not reach Gemini.', cors);
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: { 'Content-Type': upstream.headers.get('Content-Type') || 'application/json', ...cors }
    });
  }
};
