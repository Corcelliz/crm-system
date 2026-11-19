'use strict';

const express = require('express');
const { all } = require('../db/database');
const { localDate } = require('../utils/http');
const m = require('../services/metrics');

const router = express.Router();

/** Painel pessoal ("Meu dia") do usuário autenticado. */
router.get('/', (req, res) => {
  const uid = req.user.id;
  const bounds = m.monthBounds();
  const won = m.wonBetween(uid, bounds.start);
  const wonPrev = m.wonBetween(uid, bounds.prevStart, bounds.start);
  const goal = Number(req.user.monthly_goal || 0);
  const remainingDays = bounds.daysInMonth - bounds.day + 1;
  const today = localDate(0);

  const upcomingTasks = all(
    `SELECT t.*, c.company AS client_company FROM tasks t LEFT JOIN clients c ON c.id = t.client_id
      WHERE t.owner_id = ? AND t.status = 'pendente' AND (t.due_date IS NULL OR t.due_date <= ?)
      ORDER BY t.due_date IS NULL, t.due_date ASC, CASE t.priority WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END
      LIMIT 8`,
    [uid, localDate(7)]
  );

  const closingSoon = all(
    `SELECT d.*, c.company AS client_company FROM deals d JOIN clients c ON c.id = d.client_id
      WHERE d.owner_id = ? AND d.stage IN ${m.OPEN_IN} AND d.expected_close IS NOT NULL AND d.expected_close <= ?
      ORDER BY d.expected_close ASC, d.value DESC LIMIT 6`,
    [uid, localDate(21)]
  );

  const recentActivities = all(
    `SELECT a.*, c.company AS client_company FROM activities a JOIN clients c ON c.id = a.client_id
      WHERE a.user_id = ? ORDER BY a.created_at DESC LIMIT 8`,
    [uid]
  );

  res.json({
    today,
    goal: {
      target: goal,
      achieved: won.total,
      deals: won.count,
      ratio: goal ? won.total / goal : 0,
      previousMonth: wonPrev.total,
      remainingDays,
      dailyNeeded: goal > won.total ? Math.ceil((goal - won.total) / remainingDays) : 0,
    },
    pipeline: m.openPipeline(uid),
    conversion: m.conversion(uid),
    tasks: m.taskCounts(uid),
    byStage: m.pipelineByStage(uid),
    byMonth: m.wonByMonth(uid, 6),
    upcomingTasks,
    closingSoon,
    recentActivities,
  });
});

module.exports = router;
