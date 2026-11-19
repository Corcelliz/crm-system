'use strict';

const express = require('express');
const { get, all, run, now } = require('../db/database');
const { fail, v, localDate } = require('../utils/http');
const { audit } = require('../utils/audit');
const { TASK_PRIORITY, isAdmin, wantsAll, assertOwner } = require('../utils/crm');

const router = express.Router();

const LIST_SQL = `
  SELECT t.*, c.company AS client_company, d.title AS deal_title, u.name AS owner_name
    FROM tasks t
    LEFT JOIN clients c ON c.id = t.client_id
    LEFT JOIN deals d ON d.id = t.deal_id
    LEFT JOIN users u ON u.id = t.owner_id`;

const FILTERS = ['todas', 'pendentes', 'hoje', 'atrasadas', 'proximas', 'concluidas'];
const byId = (id) => get(`${LIST_SQL} WHERE t.id = ?`, [id]);

function readBody(req, body, current) {
  const data = {
    title: v.text(body.title, 'Título', { required: true, max: 160, min: 3 }),
    description: v.text(body.description, 'Descrição', { max: 2000 }),
    due_date: v.isoDate(body.due_date, 'Prazo'),
    priority: v.oneOf(body.priority, TASK_PRIORITY, 'Prioridade', { required: false, fallback: 'media' }),
    client_id: body.client_id ? v.id(body.client_id, 'Cliente') : null,
    deal_id: body.deal_id ? v.id(body.deal_id, 'Oportunidade') : null,
    owner_id: current?.owner_id ?? req.user.id,
  };
  if (isAdmin(req) && body.owner_id) {
    data.owner_id = v.id(body.owner_id, 'Responsável');
    if (!get("SELECT id FROM users WHERE id = ? AND status = 'ativo'", [data.owner_id])) fail(422, 'Escolha um responsável ativo.');
  }
  if (data.client_id) {
    const client = get('SELECT owner_id FROM clients WHERE id = ?', [data.client_id]);
    if (!client || (!isAdmin(req) && client.owner_id !== req.user.id)) fail(422, 'Escolha um cliente da sua carteira.');
  }
  if (data.deal_id) {
    const deal = get('SELECT owner_id, client_id FROM deals WHERE id = ?', [data.deal_id]);
    if (!deal || (!isAdmin(req) && deal.owner_id !== req.user.id)) fail(422, 'Escolha uma oportunidade sua.');
    data.client_id = data.client_id ?? deal.client_id;
  }
  return data;
}

router.get('/', (req, res) => {
  const filter = v.oneOf(req.query.filter, FILTERS, 'Filtro', { required: false, fallback: 'todas' });
  const today = localDate(0);
  const where = [];
  const params = [];
  if (!wantsAll(req)) {
    where.push('t.owner_id = ?');
    params.push(req.user.id);
  } else if (req.query.owner) {
    where.push('t.owner_id = ?');
    params.push(v.id(req.query.owner, 'Responsável'));
  }
  if (req.query.client_id) {
    where.push('t.client_id = ?');
    params.push(v.id(req.query.client_id, 'Cliente'));
  }
  switch (filter) {
    case 'pendentes':
      where.push("t.status = 'pendente'");
      break;
    case 'hoje':
      where.push("t.status = 'pendente' AND t.due_date = ?");
      params.push(today);
      break;
    case 'atrasadas':
      where.push("t.status = 'pendente' AND t.due_date < ?");
      params.push(today);
      break;
    case 'proximas':
      where.push("t.status = 'pendente' AND (t.due_date > ? OR t.due_date IS NULL)");
      params.push(today);
      break;
    case 'concluidas':
      where.push("t.status = 'concluida'");
      break;
    default:
      break;
  }
  const order =
    filter === 'concluidas'
      ? 't.completed_at DESC'
      : "t.status = 'concluida', t.due_date IS NULL, t.due_date ASC, CASE t.priority WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END";
  const tasks = all(`${LIST_SQL} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY ${order} LIMIT 1000`, params);

  // Contadores para as abas de filtro (sempre do mesmo escopo).
  const scopeWhere = wantsAll(req) ? (req.query.owner ? 'owner_id = ?' : '1 = 1') : 'owner_id = ?';
  const scopeParams = wantsAll(req) ? (req.query.owner ? [Number(req.query.owner)] : []) : [req.user.id];
  const counts = get(
    `SELECT
       SUM(status = 'pendente') AS pendentes,
       SUM(status = 'pendente' AND due_date = ?) AS hoje,
       SUM(status = 'pendente' AND due_date < ?) AS atrasadas,
       SUM(status = 'pendente' AND (due_date > ? OR due_date IS NULL)) AS proximas,
       SUM(status = 'concluida') AS concluidas,
       COUNT(*) AS todas
     FROM tasks WHERE ${scopeWhere}`,
    [today, today, today, ...scopeParams]
  );
  for (const k of Object.keys(counts)) counts[k] = Number(counts[k] || 0);
  res.json({ tasks, counts, today });
});

router.post('/', (req, res) => {
  const d = readBody(req, req.body ?? {});
  const ts = now();
  const { lastId } = run(
    `INSERT INTO tasks (title, description, due_date, priority, status, owner_id, client_id, deal_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'pendente', ?, ?, ?, ?, ?)`,
    [d.title, d.description, d.due_date, d.priority, d.owner_id, d.client_id, d.deal_id, ts, ts]
  );
  audit(req, 'task.create', { entity: 'task', entityId: lastId, details: { titulo: d.title } });
  res.status(201).json({ task: byId(lastId) });
});

router.put('/:id', (req, res) => {
  const id = v.id(req.params.id);
  const current = assertOwner(req, get('SELECT * FROM tasks WHERE id = ?', [id]), 'Tarefa');
  const d = readBody(req, req.body ?? {}, current);
  run(
    `UPDATE tasks SET title = ?, description = ?, due_date = ?, priority = ?, owner_id = ?, client_id = ?, deal_id = ?, updated_at = ?
      WHERE id = ?`,
    [d.title, d.description, d.due_date, d.priority, d.owner_id, d.client_id, d.deal_id, now(), id]
  );
  audit(req, 'task.update', { entity: 'task', entityId: id, details: { titulo: d.title } });
  res.json({ task: byId(id) });
});

router.patch('/:id/toggle', (req, res) => {
  const id = v.id(req.params.id);
  const current = assertOwner(req, get('SELECT * FROM tasks WHERE id = ?', [id]), 'Tarefa');
  const done = current.status !== 'concluida';
  const ts = now();
  run('UPDATE tasks SET status = ?, completed_at = ?, updated_at = ? WHERE id = ?', [done ? 'concluida' : 'pendente', done ? ts : null, ts, id]);
  audit(req, done ? 'task.complete' : 'task.reopen', { entity: 'task', entityId: id, details: { titulo: current.title } });
  res.json({ task: byId(id) });
});

router.delete('/:id', (req, res) => {
  const id = v.id(req.params.id);
  const current = assertOwner(req, get('SELECT * FROM tasks WHERE id = ?', [id]), 'Tarefa');
  run('DELETE FROM tasks WHERE id = ?', [id]);
  audit(req, 'task.delete', { entity: 'task', entityId: id, details: { titulo: current.title } });
  res.json({ ok: true });
});

module.exports = router;
