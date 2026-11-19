'use strict';

const express = require('express');
const { get, all, run, now, transaction } = require('../db/database');
const { fail, v, likePattern } = require('../utils/http');
const { audit } = require('../utils/audit');
const { requireRole } = require('../middleware/auth');
const { STAGES, STAGE_PROBABILITY, STAGE_LABEL, isAdmin, wantsAll, assertOwner } = require('../utils/crm');

const router = express.Router();

const LIST_SQL = `
  SELECT d.*, c.company AS client_company, c.contact_name AS client_contact, u.name AS owner_name
    FROM deals d
    JOIN clients c ON c.id = d.client_id
    LEFT JOIN users u ON u.id = d.owner_id`;

const byId = (id) => get(`${LIST_SQL} WHERE d.id = ?`, [id]);

function accessibleClient(req, clientId) {
  const client = get('SELECT * FROM clients WHERE id = ?', [clientId]);
  if (!client || (!isAdmin(req) && client.owner_id !== req.user.id)) fail(422, 'Escolha um cliente da sua carteira.');
  return client;
}

/** Campos derivados ao mudar de estágio (probabilidade, fechamento, motivo de perda). */
function stageFields(current, stage, lostReason, probability) {
  const closed = stage === 'ganho' || stage === 'perdido';
  return {
    probability: closed ? STAGE_PROBABILITY[stage] : probability ?? (current && current.stage === stage ? current.probability : STAGE_PROBABILITY[stage]),
    closed_at: closed ? (current && current.stage === stage && current.closed_at ? current.closed_at : now()) : null,
    lost_reason: stage === 'perdido' ? lostReason || current?.lost_reason || null : null,
  };
}

/** Cliente vira "cliente" ao ganhar um negócio. */
function promoteClient(clientId) {
  run("UPDATE clients SET status = 'cliente', updated_at = ? WHERE id = ? AND status IN ('lead','prospect','inativo')", [now(), clientId]);
}

router.get('/', (req, res) => {
  const where = [];
  const params = [];
  if (!wantsAll(req)) {
    where.push('d.owner_id = ?');
    params.push(req.user.id);
  } else if (req.query.owner) {
    where.push('d.owner_id = ?');
    params.push(v.id(req.query.owner, 'Responsável'));
  }
  if (req.query.stage) {
    where.push('d.stage = ?');
    params.push(v.oneOf(req.query.stage, STAGES, 'Estágio'));
  }
  if (req.query.client_id) {
    where.push('d.client_id = ?');
    params.push(v.id(req.query.client_id, 'Cliente'));
  }
  // No quadro, negócios encerrados aparecem só se fecharam nos últimos N dias.
  if (req.query.closed_days) {
    const days = v.number(req.query.closed_days, 'Período', { min: 1, max: 3650, integer: true });
    where.push("(d.stage NOT IN ('ganho','perdido') OR d.closed_at >= ?)");
    params.push(new Date(Date.now() - days * 86400000).toISOString());
  }
  const search = String(req.query.search ?? '').trim();
  if (search) {
    where.push("(d.title LIKE ? ESCAPE '\\' OR c.company LIKE ? ESCAPE '\\')");
    const p = likePattern(search);
    params.push(p, p);
  }
  const sql = `${LIST_SQL} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY d.updated_at DESC LIMIT 2000`;
  res.json({ deals: all(sql, params), stages: STAGES.map((id) => ({ id, label: STAGE_LABEL[id], probability: STAGE_PROBABILITY[id] })) });
});

router.get('/:id', (req, res) => {
  const deal = assertOwner(req, byId(v.id(req.params.id)), 'Oportunidade');
  res.json({ deal });
});

router.post('/', (req, res) => {
  const b = req.body ?? {};
  const title = v.text(b.title, 'Título', { required: true, max: 140, min: 3 });
  const clientId = v.id(b.client_id, 'Cliente');
  const client = accessibleClient(req, clientId);
  const value = v.number(b.value, 'Valor', { min: 0, max: 100_000_000, required: true });
  const stage = v.oneOf(b.stage, STAGES, 'Estágio', { required: false, fallback: 'prospeccao' });
  const expected = v.isoDate(b.expected_close, 'Previsão de fechamento');
  const probability = v.number(b.probability, 'Probabilidade', { min: 0, max: 100, integer: true });

  let ownerId = req.user.id;
  if (isAdmin(req)) ownerId = b.owner_id ? v.id(b.owner_id, 'Responsável') : client.owner_id ?? req.user.id;
  if (!get("SELECT id FROM users WHERE id = ? AND status = 'ativo'", [ownerId])) fail(422, 'Escolha um responsável ativo.');

  const f = stageFields(null, stage, v.text(b.lost_reason, 'Motivo da perda', { max: 300 }), probability);
  const ts = now();
  const { lastId } = run(
    `INSERT INTO deals (title, client_id, owner_id, value, stage, probability, expected_close, closed_at, lost_reason, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [title, clientId, ownerId, value, stage, f.probability, expected, f.closed_at, f.lost_reason, ts, ts]
  );
  if (stage === 'ganho') promoteClient(clientId);
  else run("UPDATE clients SET status = 'prospect', updated_at = ? WHERE id = ? AND status = 'lead'", [ts, clientId]);
  audit(req, 'deal.create', { entity: 'deal', entityId: lastId, details: { titulo: title, valor: value, estagio: stage } });
  res.status(201).json({ deal: byId(lastId) });
});

router.put('/:id', (req, res) => {
  const id = v.id(req.params.id);
  const current = assertOwner(req, get('SELECT * FROM deals WHERE id = ?', [id]), 'Oportunidade');
  const b = req.body ?? {};
  const title = v.text(b.title, 'Título', { required: true, max: 140, min: 3 });
  const clientId = v.id(b.client_id ?? current.client_id, 'Cliente');
  if (clientId !== current.client_id) accessibleClient(req, clientId);
  const value = v.number(b.value, 'Valor', { min: 0, max: 100_000_000, required: true });
  const stage = v.oneOf(b.stage ?? current.stage, STAGES, 'Estágio');
  const expected = v.isoDate(b.expected_close, 'Previsão de fechamento');
  const probability = v.number(b.probability, 'Probabilidade', { min: 0, max: 100, integer: true });

  let ownerId = current.owner_id;
  if (isAdmin(req) && b.owner_id) {
    ownerId = v.id(b.owner_id, 'Responsável');
    if (!get("SELECT id FROM users WHERE id = ? AND status = 'ativo'", [ownerId])) fail(422, 'Escolha um responsável ativo.');
  }

  const f = stageFields(current, stage, v.text(b.lost_reason, 'Motivo da perda', { max: 300 }), probability);
  transaction(() => {
    run(
      `UPDATE deals SET title = ?, client_id = ?, owner_id = ?, value = ?, stage = ?, probability = ?, expected_close = ?,
              closed_at = ?, lost_reason = ?, updated_at = ? WHERE id = ?`,
      [title, clientId, ownerId, value, stage, f.probability, expected, f.closed_at, f.lost_reason, now(), id]
    );
    if (stage === 'ganho') promoteClient(clientId);
  });
  audit(req, 'deal.update', { entity: 'deal', entityId: id, details: { titulo: title, valor: value, estagio: stage } });
  res.json({ deal: byId(id) });
});

router.patch('/:id/stage', (req, res) => {
  const id = v.id(req.params.id);
  const current = assertOwner(req, get('SELECT * FROM deals WHERE id = ?', [id]), 'Oportunidade');
  const stage = v.oneOf(req.body?.stage, STAGES, 'Estágio');
  if (stage === current.stage) return res.json({ deal: byId(id) });

  const f = stageFields(current, stage, v.text(req.body?.lost_reason, 'Motivo da perda', { max: 300 }));
  transaction(() => {
    run('UPDATE deals SET stage = ?, probability = ?, closed_at = ?, lost_reason = ?, updated_at = ? WHERE id = ?', [
      stage,
      f.probability,
      f.closed_at,
      f.lost_reason,
      now(),
      id,
    ]);
    if (stage === 'ganho') promoteClient(current.client_id);
  });
  audit(req, 'deal.stage', {
    entity: 'deal',
    entityId: id,
    details: { titulo: current.title, de: STAGE_LABEL[current.stage], para: STAGE_LABEL[stage] },
  });
  res.json({ deal: byId(id) });
});

router.delete('/:id', requireRole('admin'), (req, res) => {
  const id = v.id(req.params.id);
  const deal = get('SELECT * FROM deals WHERE id = ?', [id]);
  if (!deal) fail(404, 'Oportunidade não encontrada.');
  run('DELETE FROM deals WHERE id = ?', [id]);
  audit(req, 'deal.delete', { entity: 'deal', entityId: id, details: { titulo: deal.title, valor: deal.value } });
  res.json({ ok: true });
});

module.exports = router;
