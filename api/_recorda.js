const crypto = require('crypto');

const CONSENT_VERSION = 'monitor-privacy-ja-2026-06-29-v1';

function cleanEnv(name) {
  return String(process.env[name] || '').replace(/[\r\n\u2028\u2029]/g, '').trim();
}

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8').json(body);
}

function readBody(req) {
  if (typeof req.body === 'object' && req.body !== null) return req.body;
  try { return JSON.parse(req.body || '{}'); } catch { return {}; }
}

function signRegistrationToken(userId) {
  const secret = cleanEnv('REGISTRATION_TOKEN_SECRET');
  if (!secret) throw new Error('REGISTRATION_TOKEN_SECRET is not configured');
  const payload = Buffer.from(JSON.stringify({ userId, exp: Date.now() + 24 * 60 * 60 * 1000 })).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function verifyRegistrationToken(token) {
  if (!token) return null;
  const secret = cleanEnv('REGISTRATION_TOKEN_SECRET');
  if (!secret) throw new Error('REGISTRATION_TOKEN_SECRET is not configured');
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString());
  return decoded.exp > Date.now() ? decoded.userId : null;
}

async function linePush(userId, messages) {
  const accessToken = cleanEnv('LINE_CHANNEL_ACCESS_TOKEN');
  if (!userId || !accessToken) return;
  const response = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ to: userId, messages })
  });
  if (!response.ok) throw new Error(`LINE push failed: ${response.status}`);
}

async function supabaseRpc(name, payload) {
  const url = cleanEnv('SUPABASE_URL').replace(/\/+$/, '');
  const key = cleanEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Supabase is not configured');
  const headers = { apikey: key, 'content-type': 'application/json' };
  // Legacy service_role keys are JWTs and require Authorization.
  // New sb_secret_ keys authenticate through the apikey header alone.
  if (!key.startsWith('sb_secret_')) headers.authorization = `Bearer ${key}`;
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Supabase RPC failed: ${response.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

module.exports = {
  CONSENT_VERSION, json, linePush, readBody, signRegistrationToken, supabaseRpc, verifyRegistrationToken
};
