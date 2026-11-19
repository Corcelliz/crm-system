'use strict';

/**
 * Proteção contra força bruta no login, em memória.
 *
 * - Bloqueio por conta+IP: após N falhas consecutivas (configurável), a combinação
 *   e-mail/IP fica bloqueada por X minutos.
 * - Limite por IP: no máximo 40 tentativas a cada 10 minutos, para conter
 *   ataques que testam muitos e-mails diferentes.
 */

const accountAttempts = new Map(); // `${email}|${ip}` -> { email, ip, failures, lastAt, lockedUntil }
const ipHits = new Map(); // ip -> number[] (timestamps)

const IP_WINDOW_MS = 10 * 60 * 1000;
const IP_MAX_HITS = 40;

const keyOf = (email, ip) => `${email.toLowerCase()}|${ip}`;

function check(email, ip) {
  const entry = accountAttempts.get(keyOf(email, ip));
  if (entry?.lockedUntil && entry.lockedUntil > Date.now()) {
    return { locked: true, retryAfter: Math.ceil((entry.lockedUntil - Date.now()) / 1000) };
  }
  return { locked: false };
}

function registerFailure(email, ip, { max_login_attempts, lockout_minutes }) {
  const key = keyOf(email, ip);
  const entry = accountAttempts.get(key) || { email: email.toLowerCase(), ip, failures: 0, lockedUntil: null };
  if (entry.lockedUntil && entry.lockedUntil <= Date.now()) {
    entry.failures = 0;
    entry.lockedUntil = null;
  }
  entry.failures += 1;
  entry.lastAt = Date.now();
  if (entry.failures >= max_login_attempts) {
    entry.lockedUntil = Date.now() + lockout_minutes * 60 * 1000;
  }
  accountAttempts.set(key, entry);
  return {
    locked: Boolean(entry.lockedUntil),
    remaining: Math.max(0, max_login_attempts - entry.failures),
    retryAfter: entry.lockedUntil ? Math.ceil((entry.lockedUntil - Date.now()) / 1000) : 0,
  };
}

function registerSuccess(email, ip) {
  accountAttempts.delete(keyOf(email, ip));
}

/** Bloqueios ativos e contas com falhas recentes (para o painel de segurança). */
function snapshot() {
  const nowMs = Date.now();
  const list = [];
  for (const entry of accountAttempts.values()) {
    const locked = entry.lockedUntil && entry.lockedUntil > nowMs;
    if (!locked && nowMs - entry.lastAt > 60 * 60 * 1000) continue;
    list.push({
      email: entry.email,
      ip: entry.ip,
      failures: entry.failures,
      locked: Boolean(locked),
      lockedUntil: locked ? new Date(entry.lockedUntil).toISOString() : null,
      lastAttemptAt: new Date(entry.lastAt).toISOString(),
    });
  }
  return list.sort((a, b) => Number(b.locked) - Number(a.locked) || b.lastAttemptAt.localeCompare(a.lastAttemptAt));
}

function unlock(email, ip) {
  if (ip) return accountAttempts.delete(keyOf(email, ip));
  let removed = false;
  for (const [key, entry] of accountAttempts) {
    if (entry.email === email.toLowerCase()) {
      accountAttempts.delete(key);
      removed = true;
    }
  }
  return removed;
}

/** Middleware Express: limita o volume de tentativas por IP. */
function ipThrottle(req, res, next) {
  const ip = req.ip || 'desconhecido';
  const nowMs = Date.now();
  const hits = (ipHits.get(ip) || []).filter((t) => nowMs - t < IP_WINDOW_MS);
  if (hits.length >= IP_MAX_HITS) {
    const retryAfter = Math.ceil((IP_WINDOW_MS - (nowMs - hits[0])) / 1000);
    res.set('Retry-After', String(retryAfter));
    return res.status(429).json({
      error: 'Muitas tentativas de acesso a partir desta rede. Aguarde alguns minutos e tente de novo.',
      code: 'RATE_LIMITED',
      retryAfter,
    });
  }
  hits.push(nowMs);
  ipHits.set(ip, hits);
  next();
}

// Limpeza periódica para não acumular memória.
setInterval(() => {
  const nowMs = Date.now();
  for (const [key, entry] of accountAttempts) {
    const expired = !entry.lockedUntil || entry.lockedUntil < nowMs;
    if (expired && nowMs - entry.lastAt > 6 * 60 * 60 * 1000) accountAttempts.delete(key);
  }
  for (const [ip, hits] of ipHits) {
    const fresh = hits.filter((t) => nowMs - t < IP_WINDOW_MS);
    if (fresh.length) ipHits.set(ip, fresh);
    else ipHits.delete(ip);
  }
}, 5 * 60 * 1000).unref();

module.exports = { check, registerFailure, registerSuccess, snapshot, unlock, ipThrottle };
