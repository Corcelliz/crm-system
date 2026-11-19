'use strict';

const jwt = require('jsonwebtoken');
const { JWT_SECRET, COOKIE_NAME, IS_PROD } = require('../config');
const { get, getSettings } = require('../db/database');

const HOME_BY_ROLE = { admin: '/admin', colaborador: '/colaborador' };

function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    title: u.title,
    team: u.team,
    phone: u.phone,
    monthly_goal: u.monthly_goal,
    status: u.status,
    must_change_password: Boolean(u.must_change_password),
    last_login_at: u.last_login_at,
    created_at: u.created_at,
  };
}

/** Emite o token de sessão e grava o cookie httpOnly. */
function startSession(res, user, { remember = false } = {}) {
  const settings = getSettings();
  const lifetimeSeconds = remember ? settings.remember_days * 86400 : settings.session_hours * 3600;
  const token = jwt.sign({ sub: String(user.id), role: user.role, tv: user.token_version, rm: remember ? 1 : 0 }, JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: lifetimeSeconds,
    issuer: 'crm-system',
  });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: IS_PROD,
    path: '/',
    // Sem "lembrar": cookie de sessão do navegador (some ao fechar).
    ...(remember ? { maxAge: lifetimeSeconds * 1000 } : {}),
  });
}

function endSession(res) {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: 'strict', secure: IS_PROD, path: '/' });
}

/**
 * Lê e valida a sessão. O usuário é recarregado do banco a cada requisição,
 * então desativar a conta, trocar a senha ou encerrar sessões vale na hora.
 * @returns {{ user?: object, payload?: object, reason?: string }}
 */
function readSession(req) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return { reason: 'NO_SESSION' };
  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'], issuer: 'crm-system' });
  } catch {
    return { reason: 'INVALID_SESSION' };
  }
  const user = get('SELECT * FROM users WHERE id = ?', [Number(payload.sub)]);
  if (!user) return { reason: 'INVALID_SESSION' };
  if (user.status !== 'ativo') return { reason: 'ACCOUNT_DISABLED' };
  if (user.token_version !== payload.tv) return { reason: 'SESSION_REVOKED' };
  if (user.role !== 'admin' && getSettings().maintenance_mode) return { reason: 'MAINTENANCE' };
  return { user, payload };
}

const API_MESSAGES = {
  NO_SESSION: [401, 'Faça login para continuar.'],
  INVALID_SESSION: [401, 'Sua sessão expirou. Entre novamente.'],
  SESSION_REVOKED: [401, 'Sua sessão foi encerrada. Entre novamente.'],
  ACCOUNT_DISABLED: [401, 'Esta conta foi desativada pelo administrador.'],
  MAINTENANCE: [503, 'O sistema está em manutenção. Tente novamente mais tarde.'],
};

/** Middleware de API: exige sessão válida. */
function requireAuth(req, res, next) {
  const { user, payload, reason } = readSession(req);
  if (!user) {
    if (reason !== 'NO_SESSION') endSession(res);
    const [status, error] = API_MESSAGES[reason];
    return res.status(status).json({ error, code: reason });
  }
  req.user = user;
  req.session = payload;
  next();
}

/** Middleware de API: exige um perfil específico (após requireAuth). */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Você não tem permissão para esta ação.', code: 'FORBIDDEN' });
    }
    next();
  };
}

const LOGIN_QUERY = {
  INVALID_SESSION: 'sessao=expirada',
  SESSION_REVOKED: 'sessao=encerrada',
  ACCOUNT_DISABLED: 'conta=desativada',
  MAINTENANCE: 'manutencao=1',
};

/** Guarda de páginas HTML: redireciona em vez de responder JSON. */
function pageGuard(...roles) {
  return (req, res, next) => {
    const { user, reason } = readSession(req);
    if (!user) {
      if (reason !== 'NO_SESSION') endSession(res);
      const qs = LOGIN_QUERY[reason] ? `?${LOGIN_QUERY[reason]}` : '';
      return res.redirect(302, `/login${qs}`);
    }
    if (roles.length && !roles.includes(user.role)) {
      return res.redirect(302, `${HOME_BY_ROLE[user.role]}?acesso=negado`);
    }
    req.user = user;
    next();
  };
}

/**
 * Proteção CSRF para métodos que alteram estado: exige o cabeçalho customizado
 * enviado pelo front-end (formulários de outros sites não conseguem enviá-lo),
 * somado ao cookie SameSite=Strict.
 */
function csrfGuard(header, expected) {
  return (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (req.get(header) !== expected) {
      return res.status(403).json({ error: 'Requisição recusada por segurança. Recarregue a página.', code: 'CSRF' });
    }
    next();
  };
}

module.exports = {
  HOME_BY_ROLE,
  publicUser,
  startSession,
  endSession,
  readSession,
  requireAuth,
  requireRole,
  pageGuard,
  csrfGuard,
};
