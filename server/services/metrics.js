'use strict';

const { get, all } = require('../db/database');
const { localDate } = require('../utils/http');
const { OPEN_STAGES, STAGE_LABEL } = require('../utils/crm');

const OPEN_IN = `('${OPEN_STAGES.join("','")}')`;

function monthBounds(base = new Date()) {
  const start = new Date(base.getFullYear(), base.getMonth(), 1);
  const prevStart = new Date(base.getFullYear(), base.getMonth() - 1, 1);
  const next = new Date(base.getFullYear(), base.getMonth() + 1, 1);
  const daysInMonth = Math.round((next - start) / 86400000);
  return { start: start.toISOString(), prevStart: prevStart.toISOString(), daysInMonth, day: base.getDate() };
}

/** Filtro opcional por responsável: retorna [sqlFragment, params]. */
const ownerFilter = (ownerId, column = 'owner_id') => (ownerId ? [`AND ${column} = ?`, [ownerId]] : ['', []]);

function wonBetween(ownerId, fromIso, toIso) {
  const [f, p] = ownerFilter(ownerId);
  const row = get(
    `SELECT COALESCE(SUM(value), 0) AS total, COUNT(*) AS count FROM deals
      WHERE stage = 'ganho' AND closed_at >= ? ${toIso ? 'AND closed_at < ?' : ''} ${f}`,
    [fromIso, ...(toIso ? [toIso] : []), ...p]
  );
  return { total: Number(row.total), count: Number(row.count) };
}

function openPipeline(ownerId) {
  const [f, p] = ownerFilter(ownerId);
  const row = get(
    `SELECT COUNT(*) AS count, COALESCE(SUM(value), 0) AS total, COALESCE(SUM(value * probability / 100.0), 0) AS weighted
       FROM deals WHERE stage IN ${OPEN_IN} ${f}`,
    p
  );
  return { count: Number(row.count), total: Number(row.total), weighted: Math.round(Number(row.weighted)) };
}

function conversion(ownerId, days = 90) {
  const [f, p] = ownerFilter(ownerId);
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const row = get(
    `SELECT SUM(stage = 'ganho') AS won, SUM(stage = 'perdido') AS lost FROM deals
      WHERE stage IN ('ganho','perdido') AND closed_at >= ? ${f}`,
    [since, ...p]
  );
  const won = Number(row.won || 0);
  const lost = Number(row.lost || 0);
  return { won, lost, rate: won + lost ? won / (won + lost) : 0 };
}

function pipelineByStage(ownerId) {
  const [f, p] = ownerFilter(ownerId);
  const rows = all(
    `SELECT stage, COUNT(*) AS count, COALESCE(SUM(value), 0) AS total FROM deals WHERE stage IN ${OPEN_IN} ${f} GROUP BY stage`,
    p
  );
  return OPEN_STAGES.map((stage) => {
    const r = rows.find((x) => x.stage === stage);
    return { stage, label: STAGE_LABEL[stage], count: Number(r?.count || 0), total: Number(r?.total || 0) };
  });
}

/** Receita ganha por mês (mês local), dos últimos `months` meses incluindo o atual. */
function wonByMonth(ownerId, months = 12) {
  const base = new Date();
  const from = new Date(base.getFullYear(), base.getMonth() - (months - 1), 1);
  const [f, p] = ownerFilter(ownerId);
  const rows = all(`SELECT value, closed_at FROM deals WHERE stage = 'ganho' AND closed_at >= ? ${f}`, [from.toISOString(), ...p]);
  const buckets = [];
  for (let i = 0; i < months; i++) {
    const d = new Date(from.getFullYear(), from.getMonth() + i, 1);
    buckets.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, year: d.getFullYear(), month: d.getMonth() + 1, total: 0, count: 0 });
  }
  for (const r of rows) {
    const d = new Date(r.closed_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const b = buckets.find((x) => x.key === key);
    if (b) {
      b.total += Number(r.value);
      b.count += 1;
    }
  }
  return buckets;
}

function taskCounts(ownerId) {
  const today = localDate(0);
  const [f, p] = ownerFilter(ownerId);
  const row = get(
    `SELECT SUM(status = 'pendente' AND due_date = ?) AS today,
            SUM(status = 'pendente' AND due_date < ?) AS overdue,
            SUM(status = 'pendente') AS pending,
            SUM(status = 'concluida' AND completed_at >= ?) AS done_week
       FROM tasks WHERE 1 = 1 ${f}`,
    [today, today, new Date(Date.now() - 7 * 86400000).toISOString(), ...p]
  );
  return {
    today: Number(row.today || 0),
    overdue: Number(row.overdue || 0),
    pending: Number(row.pending || 0),
    doneWeek: Number(row.done_week || 0),
  };
}

module.exports = { OPEN_IN, monthBounds, wonBetween, openPipeline, conversion, pipelineByStage, wonByMonth, taskCounts };
