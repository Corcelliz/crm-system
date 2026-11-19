'use strict';

const express = require('express');
const { get, all, run, now, transaction, getSettings, saveSettings } = require('../db/database');
const { fail, v, localDate, likePattern } = require('../utils/http');
const { audit } = require('../utils/audit');
const { hashPassword, passwordPolicyError, generateTempPassword } = require('../utils/password');
const { publicUser, startSession, endSession } = require('../middleware/auth');
const limiter = require('../middleware/loginLimiter');
const m = require('../services/metrics');
const { STAGE_LABEL } = require('../utils/crm');

const router = express.Router();
const ROLES = ['admin', 'colaborador'];

// ---------------------------------------------------------------------------
// Visão geral
// ---------------------------------------------------------------------------
router.get('/overview', (req, res) => {
  const bounds = m.monthBounds();
  const today = localDate(0);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const dayAgo = new Date(Date.now() - 86400000).toISOString();

  const clientsByStatus = all('SELECT status, COUNT(*) AS count FROM clients GROUP BY status');
  const users = get(
    "SELECT COUNT(*) AS total, SUM(status = 'ativo') AS active, SUM(role = 'admin' AND status = 'ativo') AS admins FROM users"
  );

  const team = all(
    `SELECT u.id, u.name, u.title, u.team, u.monthly_goal, u.last_login_at,
            (SELECT COALESCE(SUM(d.value), 0) FROM deals d WHERE d.owner_id = u.id AND d.stage = 'ganho' AND d.closed_at >= ?) AS won_month,
            (SELECT COUNT(*) FROM deals d WHERE d.owner_id = u.id AND d.stage = 'ganho' AND d.closed_at >= ?) AS won_count,
            (SELECT COALESCE(SUM(d.value), 0) FROM deals d WHERE d.owner_id = u.id AND d.stage IN ${m.OPEN_IN}) AS open_value,
            (SELECT COUNT(*) FROM tasks t WHERE t.owner_id = u.id AND t.status = 'pendente' AND t.due_date < ?) AS overdue,
            (SELECT COUNT(*) FROM activities a WHERE a.user_id = u.id AND a.created_at >= ?) AS activities_week,
            (SELECT COUNT(*) FROM clients c WHERE c.owner_id = u.id) AS clients
       FROM users u
      WHERE u.role = 'colaborador' AND u.status = 'ativo'
      ORDER BY won_month DESC`,
    [bounds.start, bounds.start, today, weekAgo]
  );

  const bySegment = all(
    `SELECT COALESCE(c.segment, 'Sem segmento') AS segment, COALESCE(SUM(d.value), 0) AS total, COUNT(*) AS count
       FROM deals d JOIN clients c ON c.id = d.client_id
      WHERE d.stage = 'ganho' AND d.closed_at >= ?
      GROUP BY c.segment ORDER BY total DESC`,
    [new Date(new Date().getFullYear(), new Date().getMonth() - 11, 1).toISOString()]
  );

  const recentAudit = all(
    `SELECT l.*, u.name AS user_name FROM audit_logs l LEFT JOIN users u ON u.id = l.user_id
      ORDER BY l.created_at DESC LIMIT 8`
  );

  const failed24h = get(
    "SELECT COUNT(*) AS n FROM audit_logs WHERE action IN ('auth.login_failed','auth.locked') AND created_at >= ?",
    [dayAgo]
  ).n;
  const logins24h = get("SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'auth.login' AND created_at >= ?", [dayAgo]).n;
  const teamGoal = team.reduce((s, u) => s + Number(u.monthly_goal || 0), 0);

  res.json({
    kpis: {
      wonMonth: m.wonBetween(null, bounds.start),
      wonPrev: m.wonBetween(null, bounds.prevStart, bounds.start),
      teamGoal,
      pipeline: m.openPipeline(null),
      conversion: m.conversion(null),
      clients: Object.fromEntries(clientsByStatus.map((r) => [r.status, Number(r.count)])),
      users: { total: Number(users.total), active: Number(users.active || 0), admins: Number(users.admins || 0) },
      tasks: m.taskCounts(null),
    },
    byMonth: m.wonByMonth(null, 12),
    byStage: m.pipelineByStage(null),
    bySegment,
    team,
    recentAudit,
    security: { failed24h: Number(failed24h), logins24h: Number(logins24h), locks: limiter.snapshot().filter((l) => l.locked).length },
    month: { day: bounds.day, daysInMonth: bounds.daysInMonth },
  });
});

// ---------------------------------------------------------------------------
// Usuários
// ---------------------------------------------------------------------------
const USER_LIST_SQL = `
  SELECT u.*,
         (SELECT COUNT(*) FROM clients c WHERE c.owner_id = u.id) AS clients,
         (SELECT COUNT(*) FROM deals d WHERE d.owner_id = u.id AND d.stage IN ${m.OPEN_IN}) AS open_deals,
         (SELECT COUNT(*) FROM tasks t WHERE t.owner_id = u.id AND t.status = 'pendente') AS pending_tasks
    FROM users u`;

const userRow = (row) => ({
  ...publicUser(row),
  clients: Number(row.clients || 0),
  open_deals: Number(row.open_deals || 0),
  pending_tasks: Number(row.pending_tasks || 0),
});

function activeAdminsExcept(id) {
  return get("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND status = 'ativo' AND id <> ?", [id]).n;
}

function readUser(body) {
  return {
    name: v.text(body.name, 'Nome', { required: true, max: 120, min: 3 }),
    email: v.email(body.email, 'E-mail', { required: true }),
    role: v.oneOf(body.role, ROLES, 'Perfil'),
    title: v.text(body.title, 'Cargo', { max: 80 }),
    team: v.text(body.team, 'Equipe', { max: 80 }),
    phone: v.text(body.phone, 'Telefone', { max: 30 }),
    monthly_goal: v.number(body.monthly_goal, 'Meta mensal', { min: 0, max: 100_000_000 }) ?? 0,
  };
}

router.get('/users', (req, res) => {
  const rows = all(`${USER_LIST_SQL} ORDER BY u.status = 'inativo', u.role = 'colaborador', u.name COLLATE NOCASE`);
  res.json({ users: rows.map(userRow) });
});

router.post('/users', async (req, res) => {
  const data = readUser(req.body ?? {});
  if (get('SELECT id FROM users WHERE email = ?', [data.email])) fail(409, 'Já existe um usuário com este e-mail.');

  let password = String(req.body?.password ?? '');
  let generated = false;
  if (!password) {
    password = generateTempPassword();
    generated = true;
  } else {
    const policy = passwordPolicyError(password);
    if (policy) fail(422, policy);
  }
  const mustChange = generated || req.body?.must_change_password === true;
  const ts = now();
  const { lastId } = run(
    `INSERT INTO users (name, email, password_hash, role, title, team, phone, monthly_goal, status, must_change_password, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ativo', ?, ?, ?)`,
    [data.name, data.email, await hashPassword(password), data.role, data.title, data.team, data.phone, data.monthly_goal, mustChange ? 1 : 0, ts, ts]
  );
  audit(req, 'user.create', { entity: 'user', entityId: lastId, details: { nome: data.name, email: data.email, perfil: data.role } });
  res.status(201).json({ user: userRow(get(`${USER_LIST_SQL} WHERE u.id = ?`, [lastId])), tempPassword: generated ? password : undefined });
});

router.put('/users/:id', (req, res) => {
  const id = v.id(req.params.id);
  const current = get('SELECT * FROM users WHERE id = ?', [id]);
  if (!current) fail(404, 'Usuário não encontrado.');
  const data = readUser(req.body ?? {});
  const dup = get('SELECT id FROM users WHERE email = ? AND id <> ?', [data.email, id]);
  if (dup) fail(409, 'Já existe um usuário com este e-mail.');
  if (current.role === 'admin' && data.role !== 'admin') {
    if (id === req.user.id) fail(422, 'Você não pode remover o seu próprio perfil de administrador.');
    if (activeAdminsExcept(id) === 0) fail(422, 'O sistema precisa de pelo menos um administrador ativo.');
  }
  const roleChanged = current.role !== data.role;
  run(
    `UPDATE users SET name = ?, email = ?, role = ?, title = ?, team = ?, phone = ?, monthly_goal = ?, updated_at = ?,
            token_version = token_version + ? WHERE id = ?`,
    [data.name, data.email, data.role, data.title, data.team, data.phone, data.monthly_goal, now(), roleChanged ? 1 : 0, id]
  );
  audit(req, roleChanged ? 'user.role_changed' : 'user.update', {
    entity: 'user',
    entityId: id,
    details: roleChanged ? { nome: data.name, de: current.role, para: data.role } : { nome: data.name },
  });
  res.json({ user: userRow(get(`${USER_LIST_SQL} WHERE u.id = ?`, [id])) });
});

router.patch('/users/:id/status', (req, res) => {
  const id = v.id(req.params.id);
  const status = v.oneOf(req.body?.status, ['ativo', 'inativo'], 'Status');
  const current = get('SELECT * FROM users WHERE id = ?', [id]);
  if (!current) fail(404, 'Usuário não encontrado.');
  if (status === 'inativo') {
    if (id === req.user.id) fail(422, 'Você não pode desativar a sua própria conta.');
    if (current.role === 'admin' && activeAdminsExcept(id) === 0) fail(422, 'O sistema precisa de pelo menos um administrador ativo.');
  }
  run('UPDATE users SET status = ?, token_version = token_version + ?, updated_at = ? WHERE id = ?', [status, status === 'inativo' ? 1 : 0, now(), id]);
  audit(req, status === 'ativo' ? 'user.activate' : 'user.deactivate', { entity: 'user', entityId: id, details: { nome: current.name } });
  res.json({ user: userRow(get(`${USER_LIST_SQL} WHERE u.id = ?`, [id])) });
});

router.post('/users/:id/reset-password', async (req, res) => {
  const id = v.id(req.params.id);
  const current = get('SELECT * FROM users WHERE id = ?', [id]);
  if (!current) fail(404, 'Usuário não encontrado.');
  const temp = generateTempPassword();
  run('UPDATE users SET password_hash = ?, must_change_password = 1, token_version = token_version + 1, updated_at = ? WHERE id = ?', [
    await hashPassword(temp),
    now(),
    id,
  ]);
  limiter.unlock(current.email);
  audit(req, 'user.reset_password', { entity: 'user', entityId: id, details: { nome: current.name } });
  if (id === req.user.id) startSession(res, get('SELECT * FROM users WHERE id = ?', [id]));
  res.json({ tempPassword: temp });
});

router.post('/users/:id/revoke-sessions', (req, res) => {
  const id = v.id(req.params.id);
  const current = get('SELECT * FROM users WHERE id = ?', [id]);
  if (!current) fail(404, 'Usuário não encontrado.');
  run('UPDATE users SET token_version = token_version + 1, updated_at = ? WHERE id = ?', [now(), id]);
  audit(req, 'user.revoke_sessions', { entity: 'user', entityId: id, details: { nome: current.name } });
  // Mantém a sessão atual do próprio administrador, se ele encerrou as próprias sessões.
  if (id === req.user.id) startSession(res, get('SELECT * FROM users WHERE id = ?', [id]), { remember: req.session?.rm === 1 });
  res.json({ ok: true });
});

router.delete('/users/:id', (req, res) => {
  const id = v.id(req.params.id);
  if (id === req.user.id) fail(422, 'Você não pode excluir a sua própria conta.');
  const current = get('SELECT * FROM users WHERE id = ?', [id]);
  if (!current) fail(404, 'Usuário não encontrado.');
  if (current.role === 'admin' && activeAdminsExcept(id) === 0) fail(422, 'O sistema precisa de pelo menos um administrador ativo.');

  const transferTo = v.id(req.body?.transfer_to, 'Usuário de destino');
  if (transferTo === id) fail(422, 'Escolha outra pessoa para receber a carteira.');
  const target = get("SELECT * FROM users WHERE id = ? AND status = 'ativo'", [transferTo]);
  if (!target) fail(422, 'Escolha um usuário ativo para receber a carteira.');

  const moved = transaction(() => {
    const c = run('UPDATE clients SET owner_id = ?, updated_at = ? WHERE owner_id = ?', [transferTo, now(), id]).changes;
    const d = run('UPDATE deals SET owner_id = ?, updated_at = ? WHERE owner_id = ?', [transferTo, now(), id]).changes;
    const t = run('UPDATE tasks SET owner_id = ?, updated_at = ? WHERE owner_id = ?', [transferTo, now(), id]).changes;
    run('DELETE FROM users WHERE id = ?', [id]);
    return { clientes: c, oportunidades: d, tarefas: t };
  });
  audit(req, 'user.delete', { entity: 'user', entityId: id, details: { nome: current.name, transferido_para: target.name, ...moved } });
  res.json({ ok: true, moved });
});

// ---------------------------------------------------------------------------
// Auditoria
// ---------------------------------------------------------------------------
function auditQuery(q) {
  const where = [];
  const params = [];
  if (q.action) {
    const prefix = String(q.action);
    if (!/^[a-z_.]+$/.test(prefix)) fail(400, 'Filtro de ação inválido.');
    where.push("l.action LIKE ? ESCAPE '\\'");
    params.push(`${prefix.replace(/_/g, '\\_')}%`);
  }
  if (q.user_id) {
    where.push('l.user_id = ?');
    params.push(v.id(q.user_id, 'Usuário'));
  }
  if (q.from) {
    where.push('l.created_at >= ?');
    const [y, mo, d] = v.isoDate(q.from, 'Data inicial').split('-').map(Number);
    params.push(new Date(y, mo - 1, d).toISOString());
  }
  if (q.to) {
    where.push('l.created_at < ?');
    const [y, mo, d] = v.isoDate(q.to, 'Data final').split('-').map(Number);
    params.push(new Date(y, mo - 1, d + 1).toISOString());
  }
  const search = String(q.search ?? '').trim();
  if (search) {
    where.push("(l.user_email LIKE ? ESCAPE '\\' OR l.details LIKE ? ESCAPE '\\' OR l.ip LIKE ? ESCAPE '\\')");
    const p = likePattern(search);
    params.push(p, p, p);
  }
  return { clause: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

router.get('/audit', (req, res) => {
  const { clause, params } = auditQuery(req.query);
  const pageSize = v.number(req.query.page_size, 'Itens por página', { min: 10, max: 200, integer: true }) ?? 25;
  const total = get(`SELECT COUNT(*) AS n FROM audit_logs l ${clause}`, params).n;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(pages, v.number(req.query.page, 'Página', { min: 1, integer: true }) ?? 1);
  const items = all(
    `SELECT l.*, u.name AS user_name FROM audit_logs l LEFT JOIN users u ON u.id = l.user_id ${clause}
      ORDER BY l.created_at DESC, l.id DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, (page - 1) * pageSize]
  );
  res.json({ items, total: Number(total), page, pages, pageSize });
});

// ---------------------------------------------------------------------------
// Segurança
// ---------------------------------------------------------------------------
router.get('/security', (req, res) => {
  const dayAgo = new Date(Date.now() - 86400000).toISOString();
  const failures = all(
    `SELECT l.*, u.name AS user_name FROM audit_logs l LEFT JOIN users u ON u.id = l.user_id
      WHERE l.action IN ('auth.login_failed','auth.locked','auth.login_denied')
      ORDER BY l.created_at DESC LIMIT 25`
  );
  const recentLogins = all(
    `SELECT u.id, u.name, u.email, u.role, u.last_login_at FROM users u
      WHERE u.last_login_at IS NOT NULL ORDER BY u.last_login_at DESC LIMIT 10`
  );
  const stats = get(
    `SELECT SUM(action = 'auth.login') AS logins, SUM(action IN ('auth.login_failed','auth.locked')) AS failed,
            SUM(action = 'auth.locked') AS locks
       FROM audit_logs WHERE created_at >= ?`,
    [dayAgo]
  );
  const settings = getSettings();
  res.json({
    attempts: limiter.snapshot(),
    failures,
    recentLogins,
    stats: { logins: Number(stats.logins || 0), failed: Number(stats.failed || 0), locks: Number(stats.locks || 0) },
    policy: {
      max_login_attempts: settings.max_login_attempts,
      lockout_minutes: settings.lockout_minutes,
      session_hours: settings.session_hours,
      remember_days: settings.remember_days,
      maintenance_mode: settings.maintenance_mode,
    },
  });
});

router.post('/security/unlock', (req, res) => {
  const email = v.email(req.body?.email, 'E-mail', { required: true });
  const ip = v.text(req.body?.ip, 'IP', { max: 64 });
  const removed = limiter.unlock(email, ip);
  if (!removed) fail(404, 'Não há bloqueio ativo para este acesso.');
  audit(req, 'security.unlock', { details: { email, ip } });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Configurações
// ---------------------------------------------------------------------------
router.get('/settings', (req, res) => res.json({ settings: getSettings() }));

router.put('/settings', (req, res) => {
  const b = req.body ?? {};
  const before = getSettings();
  const next = {
    company_name: v.text(b.company_name, 'Nome da empresa', { required: true, max: 80, min: 2 }),
    session_hours: v.number(b.session_hours, 'Duração da sessão', { min: 1, max: 24, integer: true, required: true }),
    remember_days: v.number(b.remember_days, 'Manter conectado', { min: 1, max: 90, integer: true, required: true }),
    max_login_attempts: v.number(b.max_login_attempts, 'Tentativas de login', { min: 3, max: 20, integer: true, required: true }),
    lockout_minutes: v.number(b.lockout_minutes, 'Tempo de bloqueio', { min: 1, max: 1440, integer: true, required: true }),
    default_monthly_goal: v.number(b.default_monthly_goal, 'Meta padrão', { min: 0, max: 100_000_000, required: true }),
    maintenance_mode: b.maintenance_mode === true,
  };
  const saved = saveSettings(next);
  const changed = Object.keys(next).filter((k) => String(before[k]) !== String(saved[k]));
  if (changed.length) {
    audit(req, before.maintenance_mode !== saved.maintenance_mode ? 'settings.maintenance' : 'settings.update', {
      details: Object.fromEntries(changed.map((k) => [k, saved[k]])),
    });
  }
  res.json({ settings: saved });
});

// ---------------------------------------------------------------------------
// Exportação CSV
// ---------------------------------------------------------------------------
function toCsv(columns, rows) {
  const cell = (value) => {
    if (value === null || value === undefined) return '';
    let s = String(value);
    // Evita injeção de fórmulas ao abrir no Excel/Sheets.
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = columns.map((c) => cell(c.label)).join(';');
  const body = rows.map((r) => columns.map((c) => cell(typeof c.value === 'function' ? c.value(r) : r[c.key])).join(';'));
  return `﻿${[head, ...body].join('\r\n')}`;
}

const brDate = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR') : '');
const brMoney = (n) => Number(n || 0).toFixed(2).replace('.', ',');

const EXPORTS = {
  clientes: () => ({
    rows: all('SELECT c.*, u.name AS owner_name FROM clients c LEFT JOIN users u ON u.id = c.owner_id ORDER BY c.company'),
    columns: [
      { label: 'ID', key: 'id' },
      { label: 'Empresa', key: 'company' },
      { label: 'Contato', key: 'contact_name' },
      { label: 'Cargo', key: 'contact_role' },
      { label: 'E-mail', key: 'email' },
      { label: 'Telefone', key: 'phone' },
      { label: 'Segmento', key: 'segment' },
      { label: 'Cidade', key: 'city' },
      { label: 'UF', key: 'state' },
      { label: 'Origem', key: 'source' },
      { label: 'Status', key: 'status' },
      { label: 'Responsável', key: 'owner_name' },
      { label: 'Criado em', value: (r) => brDate(r.created_at) },
    ],
  }),
  oportunidades: () => ({
    rows: all(
      `SELECT d.*, c.company, u.name AS owner_name FROM deals d JOIN clients c ON c.id = d.client_id
         LEFT JOIN users u ON u.id = d.owner_id ORDER BY d.created_at DESC`
    ),
    columns: [
      { label: 'ID', key: 'id' },
      { label: 'Título', key: 'title' },
      { label: 'Cliente', key: 'company' },
      { label: 'Responsável', key: 'owner_name' },
      { label: 'Valor (R$)', value: (r) => brMoney(r.value) },
      { label: 'Estágio', value: (r) => STAGE_LABEL[r.stage] },
      { label: 'Probabilidade (%)', key: 'probability' },
      { label: 'Previsão de fechamento', key: 'expected_close' },
      { label: 'Fechado em', value: (r) => brDate(r.closed_at) },
      { label: 'Motivo da perda', key: 'lost_reason' },
      { label: 'Criado em', value: (r) => brDate(r.created_at) },
    ],
  }),
  tarefas: () => ({
    rows: all(
      `SELECT t.*, c.company, u.name AS owner_name FROM tasks t LEFT JOIN clients c ON c.id = t.client_id
         LEFT JOIN users u ON u.id = t.owner_id ORDER BY t.due_date`
    ),
    columns: [
      { label: 'ID', key: 'id' },
      { label: 'Título', key: 'title' },
      { label: 'Cliente', key: 'company' },
      { label: 'Responsável', key: 'owner_name' },
      { label: 'Prazo', key: 'due_date' },
      { label: 'Prioridade', key: 'priority' },
      { label: 'Status', key: 'status' },
      { label: 'Concluída em', value: (r) => brDate(r.completed_at) },
    ],
  }),
  usuarios: () => ({
    rows: all('SELECT * FROM users ORDER BY name'),
    columns: [
      { label: 'ID', key: 'id' },
      { label: 'Nome', key: 'name' },
      { label: 'E-mail', key: 'email' },
      { label: 'Perfil', key: 'role' },
      { label: 'Cargo', key: 'title' },
      { label: 'Equipe', key: 'team' },
      { label: 'Meta mensal (R$)', value: (r) => brMoney(r.monthly_goal) },
      { label: 'Status', key: 'status' },
      { label: 'Último acesso', value: (r) => brDate(r.last_login_at) },
    ],
  }),
  auditoria: (q) => {
    const { clause, params } = auditQuery(q);
    return {
      rows: all(`SELECT l.* FROM audit_logs l ${clause} ORDER BY l.created_at DESC LIMIT 20000`, params),
      columns: [
        { label: 'Data', value: (r) => brDate(r.created_at) },
        { label: 'Usuário', key: 'user_email' },
        { label: 'Ação', key: 'action' },
        { label: 'Entidade', key: 'entity' },
        { label: 'ID', key: 'entity_id' },
        { label: 'Detalhes', key: 'details' },
        { label: 'IP', key: 'ip' },
      ],
    };
  },
};

router.get('/export/:entity', (req, res) => {
  const builder = EXPORTS[req.params.entity];
  if (!builder) fail(404, 'Exportação não disponível.');
  const { rows, columns } = builder(req.query);
  audit(req, 'export.csv', { details: { tipo: req.params.entity, linhas: rows.length } });
  const filename = `crm-system-${req.params.entity}-${localDate(0)}.csv`;
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(toCsv(columns, rows));
});

// ---------------------------------------------------------------------------
// Restaurar dados de demonstração
// ---------------------------------------------------------------------------
router.post('/reset-demo', (req, res) => {
  if (req.body?.confirm !== 'RESTAURAR') fail(422, 'Digite RESTAURAR para confirmar.');
  const email = req.user.email;
  require('../db/seed').seed({ reset: true });
  limiter.unlock(email);
  const me = get("SELECT * FROM users WHERE email = ? AND role = 'admin' AND status = 'ativo'", [email]);
  if (me) {
    startSession(res, me);
    audit(req, 'system.reset_demo', { user: me });
  } else {
    endSession(res);
  }
  res.json({ ok: true, relogin: !me });
});

module.exports = router;
