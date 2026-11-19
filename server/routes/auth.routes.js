'use strict';

const express = require('express');
const { get, run, now, getSettings } = require('../db/database');
const { verifyPassword, hashPassword, DUMMY_HASH, passwordPolicyError } = require('../utils/password');
const { fail, clientIp, v } = require('../utils/http');
const { audit } = require('../utils/audit');
const limiter = require('../middleware/loginLimiter');
const { HOME_BY_ROLE, publicUser, startSession, endSession, readSession, requireAuth } = require('../middleware/auth');

const router = express.Router();

const minutes = (seconds) => Math.max(1, Math.ceil(seconds / 60));

router.post('/login', limiter.ipThrottle, async (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const password = String(req.body?.password ?? '');
  const remember = req.body?.remember === true;

  if (!email || !password) fail(422, 'Informe seu e-mail e sua senha.');
  if (email.length > 160 || password.length > 128) fail(422, 'E-mail ou senha incorretos.');

  const settings = getSettings();
  const ip = clientIp(req);

  const lock = limiter.check(email, ip);
  if (lock.locked) {
    res.set('Retry-After', String(lock.retryAfter));
    return res.status(429).json({
      error: `Acesso bloqueado após várias tentativas incorretas. Tente de novo em ${minutes(lock.retryAfter)} min ou peça o desbloqueio ao administrador.`,
      code: 'LOCKED',
      retryAfter: lock.retryAfter,
    });
  }

  const user = get('SELECT * FROM users WHERE email = ?', [email]);
  // Sempre executa a verificação, mesmo sem usuário, para manter o tempo constante.
  const valid = await verifyPassword(password, user ? user.password_hash : DUMMY_HASH);

  if (!user || !valid) {
    const result = limiter.registerFailure(email, ip, settings);
    audit(req, result.locked ? 'auth.locked' : 'auth.login_failed', {
      user: user ? { id: user.id, email: user.email } : { id: null, email },
      details: { motivo: user ? 'senha incorreta' : 'e-mail não cadastrado' },
    });
    if (result.locked) {
      res.set('Retry-After', String(result.retryAfter));
      return res.status(429).json({
        error: `Acesso bloqueado por ${settings.lockout_minutes} min após ${settings.max_login_attempts} tentativas incorretas.`,
        code: 'LOCKED',
        retryAfter: result.retryAfter,
      });
    }
    return res.status(401).json({
      error: 'E-mail ou senha incorretos.',
      code: 'INVALID_CREDENTIALS',
      ...(result.remaining <= 2 ? { remaining: result.remaining } : {}),
    });
  }

  if (user.status !== 'ativo') {
    audit(req, 'auth.login_denied', { user, details: { motivo: 'conta desativada' } });
    return res.status(403).json({
      error: 'Esta conta está desativada. Fale com o administrador do sistema.',
      code: 'ACCOUNT_DISABLED',
    });
  }

  if (settings.maintenance_mode && user.role !== 'admin') {
    audit(req, 'auth.login_denied', { user, details: { motivo: 'modo manutenção' } });
    return res.status(503).json({
      error: 'O sistema está em manutenção. No momento, apenas administradores podem entrar.',
      code: 'MAINTENANCE',
    });
  }

  limiter.registerSuccess(email, ip);
  const loginAt = now();
  run('UPDATE users SET last_login_at = ? WHERE id = ?', [loginAt, user.id]);
  startSession(res, user, { remember });
  audit(req, 'auth.login', { user, details: { lembrar: remember } });

  res.json({
    user: publicUser({ ...user, last_login_at: loginAt }),
    redirect: HOME_BY_ROLE[user.role],
  });
});

router.post('/logout', (req, res) => {
  const { user } = readSession(req);
  if (user) audit(req, 'auth.logout', { user });
  endSession(res);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  const settings = getSettings();
  res.json({
    user: publicUser(req.user),
    company: settings.company_name,
    maintenance: settings.maintenance_mode,
  });
});

router.post('/change-password', requireAuth, async (req, res) => {
  const current = String(req.body?.current_password ?? '');
  const next = String(req.body?.new_password ?? '');

  if (!current) fail(422, 'Informe sua senha atual.');
  const ok = await verifyPassword(current, req.user.password_hash);
  if (!ok) fail(422, 'A senha atual não confere.');

  const policy = passwordPolicyError(next);
  if (policy) fail(422, policy);
  if (next === current) fail(422, 'A nova senha precisa ser diferente da atual.');

  const hash = await hashPassword(next);
  // Incrementar token_version derruba as outras sessões abertas deste usuário.
  run(
    'UPDATE users SET password_hash = ?, must_change_password = 0, token_version = token_version + 1, updated_at = ? WHERE id = ?',
    [hash, now(), req.user.id]
  );
  const updated = get('SELECT * FROM users WHERE id = ?', [req.user.id]);
  startSession(res, updated, { remember: req.session?.rm === 1 });
  audit(req, 'user.password_changed', { entity: 'user', entityId: req.user.id });
  res.json({ ok: true, user: publicUser(updated) });
});

router.patch('/profile', requireAuth, (req, res) => {
  const name = v.text(req.body?.name, 'Nome', { required: true, max: 120, min: 3 });
  const phone = v.text(req.body?.phone, 'Telefone', { max: 30 });
  run('UPDATE users SET name = ?, phone = ?, updated_at = ? WHERE id = ?', [name, phone, now(), req.user.id]);
  audit(req, 'user.profile_updated', { entity: 'user', entityId: req.user.id });
  res.json({ user: publicUser(get('SELECT * FROM users WHERE id = ?', [req.user.id])) });
});

module.exports = router;
