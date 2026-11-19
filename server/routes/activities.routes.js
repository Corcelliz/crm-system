'use strict';

const express = require('express');
const { get, all, run, now, transaction } = require('../db/database');
const { fail, v } = require('../utils/http');
const { audit } = require('../utils/audit');
const { ACTIVITY_TYPES, isAdmin, wantsAll } = require('../utils/crm');

const router = express.Router();

const LIST_SQL = `
  SELECT a.*, c.company AS client_company, u.name AS user_name, d.title AS deal_title
    FROM activities a
    JOIN clients c ON c.id = a.client_id
    LEFT JOIN users u ON u.id = a.user_id
    LEFT JOIN deals d ON d.id = a.deal_id`;

router.get('/', (req, res) => {
  const where = [];
  const params = [];
  if (!wantsAll(req)) {
    where.push('c.owner_id = ?');
    params.push(req.user.id);
  }
  if (req.query.client_id) {
    where.push('a.client_id = ?');
    params.push(v.id(req.query.client_id, 'Cliente'));
  }
  const limit = v.number(req.query.limit, 'Limite', { min: 1, max: 500, integer: true }) ?? 50;
  const rows = all(`${LIST_SQL} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY a.created_at DESC LIMIT ${limit}`, params);
  res.json({ activities: rows });
});

router.post('/', (req, res) => {
  const b = req.body ?? {};
  const type = v.oneOf(b.type, ACTIVITY_TYPES, 'Tipo');
  const description = v.text(b.description, 'Descrição', { required: true, max: 2000, min: 3 });
  const clientId = v.id(b.client_id, 'Cliente');
  const client = get('SELECT * FROM clients WHERE id = ?', [clientId]);
  if (!client || (!isAdmin(req) && client.owner_id !== req.user.id)) fail(422, 'Escolha um cliente da sua carteira.');
  const dealId = b.deal_id ? v.id(b.deal_id, 'Oportunidade') : null;
  if (dealId && !get('SELECT id FROM deals WHERE id = ? AND client_id = ?', [dealId, clientId])) fail(422, 'Oportunidade não pertence a este cliente.');

  const ts = now();
  const id = transaction(() => {
    const { lastId } = run(
      'INSERT INTO activities (type, description, client_id, deal_id, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [type, description, clientId, dealId, req.user.id, ts]
    );
    run('UPDATE clients SET updated_at = ? WHERE id = ?', [ts, clientId]);
    return lastId;
  });
  audit(req, 'activity.create', { entity: 'client', entityId: clientId, details: { tipo: type, empresa: client.company } });
  res.status(201).json({ activity: get(`${LIST_SQL} WHERE a.id = ?`, [id]) });
});

module.exports = router;
