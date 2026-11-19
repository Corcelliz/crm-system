'use strict';

const express = require('express');
const { get, all, run, now, transaction } = require('../db/database');
const { fail, v, likePattern } = require('../utils/http');
const { audit } = require('../utils/audit');
const { requireRole } = require('../middleware/auth');
const { CLIENT_STATUS, SEGMENTS, SOURCES, isAdmin, wantsAll, assertOwner } = require('../utils/crm');

const router = express.Router();

const LIST_SQL = `
  SELECT c.*,
         u.name AS owner_name,
         (SELECT COUNT(*) FROM deals d WHERE d.client_id = c.id AND d.stage NOT IN ('ganho','perdido')) AS open_deals,
         (SELECT COALESCE(SUM(d.value), 0) FROM deals d WHERE d.client_id = c.id AND d.stage NOT IN ('ganho','perdido')) AS open_value,
         (SELECT COALESCE(SUM(d.value), 0) FROM deals d WHERE d.client_id = c.id AND d.stage = 'ganho') AS won_value,
         (SELECT MAX(a.created_at) FROM activities a WHERE a.client_id = c.id) AS last_activity_at
    FROM clients c
    LEFT JOIN users u ON u.id = c.owner_id`;

/** Resolve o responsável: colaborador sempre é dono; admin pode escolher. */
function resolveOwner(req, value, fallback) {
  if (!isAdmin(req)) return req.user.id;
  if (value === undefined || value === null || value === '') return fallback ?? req.user.id;
  const ownerId = v.id(value, 'Responsável');
  const owner = get("SELECT id FROM users WHERE id = ? AND status = 'ativo'", [ownerId]);
  if (!owner) fail(422, 'Escolha um responsável ativo.');
  return ownerId;
}

function readBody(body) {
  return {
    company: v.text(body.company, 'Empresa', { required: true, max: 120, min: 2 }),
    contact_name: v.text(body.contact_name, 'Contato', { required: true, max: 120, min: 2 }),
    contact_role: v.text(body.contact_role, 'Cargo', { max: 80 }),
    email: v.email(body.email),
    phone: v.text(body.phone, 'Telefone', { max: 30 }),
    segment: body.segment ? v.oneOf(body.segment, SEGMENTS, 'Segmento') : null,
    city: v.text(body.city, 'Cidade', { max: 80 }),
    state: body.state ? v.text(String(body.state).toUpperCase(), 'UF', { max: 2, min: 2 }) : null,
    source: body.source ? v.oneOf(body.source, SOURCES, 'Origem') : null,
    status: v.oneOf(body.status, CLIENT_STATUS, 'Status', { required: false, fallback: 'lead' }),
    notes: v.text(body.notes, 'Observações', { max: 2000 }),
  };
}

router.get('/', (req, res) => {
  const where = [];
  const params = [];
  if (!wantsAll(req)) {
    where.push('c.owner_id = ?');
    params.push(req.user.id);
  } else if (req.query.owner) {
    where.push('c.owner_id = ?');
    params.push(v.id(req.query.owner, 'Responsável'));
  }
  if (req.query.status) {
    where.push('c.status = ?');
    params.push(v.oneOf(req.query.status, CLIENT_STATUS, 'Status'));
  }
  if (req.query.segment) {
    where.push('c.segment = ?');
    params.push(v.oneOf(req.query.segment, SEGMENTS, 'Segmento'));
  }
  const search = String(req.query.search ?? '').trim();
  if (search) {
    where.push("(c.company LIKE ? ESCAPE '\\' OR c.contact_name LIKE ? ESCAPE '\\' OR c.email LIKE ? ESCAPE '\\' OR c.city LIKE ? ESCAPE '\\')");
    const p = likePattern(search);
    params.push(p, p, p, p);
  }
  const sql = `${LIST_SQL} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY c.updated_at DESC LIMIT 1000`;
  res.json({ clients: all(sql, params), segments: SEGMENTS, sources: SOURCES });
});

router.get('/:id', (req, res) => {
  const id = v.id(req.params.id);
  const client = assertOwner(req, get(`${LIST_SQL} WHERE c.id = ?`, [id]), 'Cliente');
  const deals = all('SELECT * FROM deals WHERE client_id = ? ORDER BY created_at DESC', [id]);
  const activities = all(
    `SELECT a.*, u.name AS user_name FROM activities a LEFT JOIN users u ON u.id = a.user_id
      WHERE a.client_id = ? ORDER BY a.created_at DESC LIMIT 100`,
    [id]
  );
  const tasks = all(
    "SELECT * FROM tasks WHERE client_id = ? ORDER BY status = 'concluida', due_date IS NULL, due_date LIMIT 50",
    [id]
  );
  res.json({ client, deals, activities, tasks });
});

router.post('/', (req, res) => {
  const data = readBody(req.body ?? {});
  const ownerId = resolveOwner(req, req.body?.owner_id);
  const ts = now();
  const { lastId } = run(
    `INSERT INTO clients (company, contact_name, contact_role, email, phone, segment, city, state, source, status, owner_id, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [data.company, data.contact_name, data.contact_role, data.email, data.phone, data.segment, data.city, data.state, data.source, data.status, ownerId, data.notes, ts, ts]
  );
  audit(req, 'client.create', { entity: 'client', entityId: lastId, details: { empresa: data.company } });
  res.status(201).json({ client: get(`${LIST_SQL} WHERE c.id = ?`, [lastId]) });
});

router.put('/:id', (req, res) => {
  const id = v.id(req.params.id);
  const current = assertOwner(req, get('SELECT * FROM clients WHERE id = ?', [id]), 'Cliente');
  const data = readBody(req.body ?? {});
  const ownerId = resolveOwner(req, req.body?.owner_id, current.owner_id);

  transaction(() => {
    run(
      `UPDATE clients SET company = ?, contact_name = ?, contact_role = ?, email = ?, phone = ?, segment = ?, city = ?, state = ?,
              source = ?, status = ?, owner_id = ?, notes = ?, updated_at = ? WHERE id = ?`,
      [data.company, data.contact_name, data.contact_role, data.email, data.phone, data.segment, data.city, data.state, data.source, data.status, ownerId, data.notes, now(), id]
    );
    // Ao transferir a carteira, as oportunidades abertas acompanham o novo responsável.
    if (ownerId !== current.owner_id) {
      run("UPDATE deals SET owner_id = ?, updated_at = ? WHERE client_id = ? AND stage NOT IN ('ganho','perdido')", [ownerId, now(), id]);
    }
  });

  audit(req, ownerId !== current.owner_id ? 'client.transfer' : 'client.update', {
    entity: 'client',
    entityId: id,
    details: ownerId !== current.owner_id ? { empresa: data.company, de: current.owner_id, para: ownerId } : { empresa: data.company },
  });
  res.json({ client: get(`${LIST_SQL} WHERE c.id = ?`, [id]) });
});

router.delete('/:id', requireRole('admin'), (req, res) => {
  const id = v.id(req.params.id);
  const client = get('SELECT * FROM clients WHERE id = ?', [id]);
  if (!client) fail(404, 'Cliente não encontrado.');
  run('DELETE FROM clients WHERE id = ?', [id]);
  audit(req, 'client.delete', { entity: 'client', entityId: id, details: { empresa: client.company } });
  res.json({ ok: true });
});

module.exports = router;
