import { api, qs } from './lib/api.js';
import { $, html, debounce } from './lib/dom.js';
import { icon, ACTIVITY_ICON } from './lib/icons.js';
import { money, moneyShort, pct, int, dayMonth, relative, monthLong, monthShort, longToday, greeting, firstName, todayLocal, dueInfo } from './lib/format.js';
import { toast, toastError, openMenu, emptyState, confirmDialog } from './lib/ui.js';
import { columnChart, barList, progressBar } from './lib/charts.js';
import { bootShell, session, navigate, refresh, bindActions, avatar } from './lib/shell.js';
import {
  STAGES,
  STAGE_LABEL,
  OPEN_STAGES,
  ACTIVITY_LABEL,
  clientBadge,
  stageBadge,
  taskRow,
  openClientForm,
  openDealForm,
  openTaskForm,
  openClientDrawer,
  toggleTask,
  moveDeal,
} from './lib/crm.js';

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const plural = (n, one, many) => `${int(n)} ${n === 1 ? one : many}`;

function updateTaskBadge(count) {
  const badge = $('#navTaskCount');
  if (!badge) return;
  badge.hidden = !count;
  badge.textContent = count;
  badge.title = `${count} tarefas para hoje ou atrasadas`;
}

/** Menu de ações de uma tarefa (editar, excluir). */
function taskMenu(anchor, taskId, reload) {
  openMenu(anchor, [
    {
      label: 'Editar',
      icon: 'edit',
      onSelect: async () => {
        const { tasks } = await api.get('/api/tasks?filter=todas');
        const task = tasks.find((t) => String(t.id) === String(taskId));
        if (task) openTaskForm({ task, onSaved: reload });
      },
    },
    {
      label: 'Excluir',
      icon: 'trash',
      tone: 'danger',
      onSelect: async () => {
        const ok = await confirmDialog({ title: 'Excluir tarefa?', message: 'A tarefa será removida da sua lista. Essa ação não pode ser desfeita.', confirmLabel: 'Excluir tarefa' });
        if (!ok) return;
        try {
          await api.del(`/api/tasks/${taskId}`);
          toast('Tarefa excluída.');
          reload();
        } catch (err) {
          toastError(err);
        }
      },
    },
  ]);
}

const taskHandlers = (reload) => ({
  'toggle-task': async (e, el) => {
    const row = el.closest('[data-task-id]');
    row.classList.toggle('is-done');
    try {
      await toggleTask(row.dataset.taskId);
      reload();
    } catch (err) {
      row.classList.toggle('is-done');
      toastError(err);
    }
  },
  'task-menu': (e, el) => taskMenu(el, el.closest('[data-task-id]').dataset.taskId, reload),
});

// ===========================================================================
// Meu dia
// ===========================================================================
async function renderHome(view, ctx) {
  const d = await api.get('/api/dashboard');
  if (!ctx.isCurrent()) return;
  const user = session.user;
  const g = d.goal;
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const pace = now.getDate() / daysInMonth;
  const month = monthLong(now.getMonth() + 1);
  updateTaskBadge(d.tasks.today + d.tasks.overdue);

  const dueToday = d.tasks.today;
  const overdue = d.tasks.overdue;
  let agendaLine = 'Nenhuma tarefa pendente para hoje.';
  if (dueToday || overdue) {
    agendaLine = dueToday ? `Você tem ${plural(dueToday, 'tarefa', 'tarefas')} para hoje` : 'Nada vence hoje';
    agendaLine += overdue ? ` e ${plural(overdue, 'atrasada', 'atrasadas')}.` : '.';
  }

  const goalBand = g.target
    ? html`<section class="goal" aria-labelledby="goal-title">
        <div>
          <h2 class="goal__label" id="goal-title">Meta de ${month}</h2>
          <div class="goal__amount"><strong>${money(g.achieved)}</strong><span>de ${money(g.target)} (<b>${pct(g.ratio)}</b>)</span></div>
        </div>
        <dl class="goal__facts">
          ${g.ratio >= 1
            ? html`<div><dt>Acima da meta</dt><dd>${money(g.achieved - g.target)}</dd></div>`
            : html`<div><dt>Falta</dt><dd>${money(g.target - g.achieved)}</dd></div>`}
          <div><dt>Dias restantes</dt><dd>${g.remainingDays}</dd></div>
          ${g.ratio >= 1
            ? html`<div><dt>Negócios ganhos</dt><dd>${g.deals}</dd></div>`
            : html`<div><dt>Ritmo necessário</dt><dd>${moneyShort(g.dailyNeeded)}/dia</dd></div>`}
        </dl>
        <div class="goal__bar">
          ${progressBar(g.ratio, { pace, label: `Meta de ${month}`, tone: 'ok' })}
          <div class="goal__legend"><span>${plural(g.deals, 'negócio ganho', 'negócios ganhos')} no mês</span><span>Traço branco: onde você deveria estar hoje (${pct(pace)} do mês)</span></div>
        </div>
      </section>`
    : html`<section class="goal"><div><h2 class="goal__label">Ganhos de ${month}</h2><div class="goal__amount"><strong>${money(g.achieved)}</strong><span>${plural(g.deals, 'negócio', 'negócios')}. Nenhuma meta individual definida.</span></div></div></section>`;

  const byMonth = d.byMonth.map((m, i, arr) => ({
    label: monthShort(m.month),
    fullLabel: `${capitalize(monthLong(m.month))} de ${m.year}`,
    value: m.total,
    detail: plural(m.count, 'negócio ganho', 'negócios ganhos'),
    accent: i === arr.length - 1,
  }));

  view.innerHTML = String(html`
    <div class="page-head">
      <div>
        <h2 class="page-head__title">${greeting()}, ${firstName(user.name)}</h2>
        <p class="page-head__sub">${capitalize(longToday())}. ${agendaLine}</p>
      </div>
      <div class="page-head__actions">
        <button type="button" class="btn" data-action="new-task">${icon('plus')} Nova tarefa</button>
        <button type="button" class="btn btn--primary" data-action="new-deal">${icon('plus')} Nova oportunidade</button>
      </div>
    </div>

    <div class="stack">
      ${goalBand}

      <div class="kpis" style="--kpi-cols:4">
        <div class="kpi"><span class="kpi__label">${icon('board', 'icon--sm')}Pipeline aberto</span><span class="kpi__value">${moneyShort(d.pipeline.total)}</span><span class="kpi__note">${plural(d.pipeline.count, 'oportunidade', 'oportunidades')}</span></div>
        <div class="kpi"><span class="kpi__label">${icon('target', 'icon--sm')}Previsão ponderada</span><span class="kpi__value">${moneyShort(d.pipeline.weighted)}</span><span class="kpi__note">Valor × probabilidade do estágio</span></div>
        <div class="kpi"><span class="kpi__label">${icon('trophy', 'icon--sm')}Conversão em 90 dias</span><span class="kpi__value">${pct(d.conversion.rate)}</span><span class="kpi__note">${d.conversion.won} ganhas, ${d.conversion.lost} perdidas</span></div>
        <div class="kpi"><span class="kpi__label">${icon('tasks', 'icon--sm')}Concluídas na semana</span><span class="kpi__value">${int(d.tasks.doneWeek)}</span><span class="kpi__note">${plural(d.tasks.pending, 'tarefa pendente', 'tarefas pendentes')}</span></div>
      </div>

      <div class="grid grid--3-2">
        <section class="panel" aria-labelledby="agenda-title">
          <header class="panel__head"><h2 class="panel__title" id="agenda-title">Agenda</h2><span class="panel__hint">Atrasadas, hoje e próximos 7 dias</span><a class="panel__link" href="#/tarefas">Ver todas</a></header>
          <div class="panel__body--flush">
            ${d.upcomingTasks.length
              ? html`<ul class="tasks">${d.upcomingTasks.map((t) => taskRow(t))}</ul>`
              : emptyState({ icon: 'check', title: 'Agenda livre', text: 'Nenhuma tarefa pendente para os próximos dias.', action: html`<button type="button" class="btn" data-action="new-task">${icon('plus')} Criar tarefa</button>` })}
          </div>
        </section>

        <section class="panel" aria-labelledby="closing-title">
          <header class="panel__head"><h2 class="panel__title" id="closing-title">Fechamentos previstos</h2><span class="panel__hint">Próximas 3 semanas</span></header>
          <div class="panel__body--flush">
            ${d.closingSoon.length
              ? html`<ul class="mini-list">${d.closingSoon.map((deal) => {
                  const late = deal.expected_close < todayLocal();
                  return html`<li>
                    <div><strong>${deal.title}</strong><small>${deal.client_company}</small></div>
                    <div class="t-right" style="flex:none"><span class="num mini-list__value">${moneyShort(deal.value)}</span><small class="${late ? 'due due--overdue' : 'due'}">${late ? 'Previsão vencida' : dayMonth(deal.expected_close)}</small></div>
                  </li>`;
                })}</ul>`
              : emptyState({ icon: 'calendar', title: 'Nada previsto', text: 'Nenhuma oportunidade com fechamento nas próximas semanas.' })}
          </div>
        </section>
      </div>

      <div class="grid grid--2">
        <section class="panel" aria-labelledby="stage-title">
          <header class="panel__head"><h2 class="panel__title" id="stage-title">Pipeline por estágio</h2><a class="panel__link" href="#/funil">Abrir funil</a></header>
          <div class="panel__body">${barList(d.byStage.map((s) => ({ label: s.label, value: s.total, count: s.count })), { title: 'Valor em aberto por estágio' })}</div>
        </section>
        <section class="panel" aria-labelledby="months-title">
          <header class="panel__head"><h2 class="panel__title" id="months-title">Ganhos por mês</h2><span class="panel__hint">Últimos 6 meses</span></header>
          <div class="panel__body">${columnChart(byMonth, { title: 'Valor ganho por mês', height: 168 })}</div>
        </section>
      </div>

      <section class="panel" aria-labelledby="recent-title">
        <header class="panel__head"><h2 class="panel__title" id="recent-title">Suas interações recentes</h2><a class="panel__link" href="#/clientes">Ir para clientes</a></header>
        <div class="panel__body">
          ${d.recentActivities.length
            ? html`<ol class="timeline">${d.recentActivities.map(
                (a) => html`<li class="timeline__item timeline__item--${a.type}">
                  <span class="timeline__icon">${icon(ACTIVITY_ICON[a.type], 'icon--sm')}</span>
                  <div><small><button type="button" class="row-link" data-action="open-client" data-id="${a.client_id}">${a.client_company}</button>, ${ACTIVITY_LABEL[a.type].toLowerCase()}, ${relative(a.created_at)}</small><p>${a.description}</p></div>
                </li>`
              )}</ol>`
            : emptyState({ icon: 'chat', title: 'Sem interações ainda', text: 'Registre ligações, reuniões e e-mails na ficha de cada cliente.' })}
        </div>
      </section>
    </div>`);

  bindActions(view, {
    ...taskHandlers(refresh),
    'new-task': () => openTaskForm({ onSaved: refresh }),
    'new-deal': () => openDealForm({ onSaved: refresh }),
    'open-client': (e, el) => openClientDrawer(el.dataset.id, { onChange: refresh }),
  });
}

// ===========================================================================
// Funil de vendas (kanban com arrastar e soltar)
// ===========================================================================
async function renderBoard(view, ctx) {
  const { deals } = await api.get('/api/deals?closed_days=30');
  if (!ctx.isCurrent()) return;
  let filter = '';

  view.innerHTML = String(html`
    <div class="page-head">
      <div>
        <p class="page-head__sub"><span id="boardSummary"></span>
        Arraste os cartões entre as colunas para atualizar o estágio. Ganhos e perdas aparecem por 30 dias.</p>
      </div>
      <div class="page-head__actions">
        <div class="input-search"><span>${icon('search')}</span><label class="sr-only" for="boardFilter">Filtrar oportunidades</label>
          <input class="input" id="boardFilter" type="search" placeholder="Filtrar por título ou cliente" autocomplete="off" data-action="filter"></div>
        <button type="button" class="btn btn--primary" data-action="new-deal">${icon('plus')} Nova oportunidade</button>
      </div>
    </div>
    <div class="board" id="board" aria-label="Quadro do funil de vendas"></div>`);

  const board = $('#board', view);
  const byId = new Map(deals.map((d) => [String(d.id), d]));

  const cardHtml = (d) => {
    const isOpen = OPEN_STAGES.includes(d.stage);
    const late = isOpen && d.expected_close && d.expected_close < todayLocal();
    return html`<article class="deal deal--${d.stage}" draggable="true" tabindex="0" data-deal-id="${d.id}"
        aria-label="${d.title}, ${d.client_company}, ${money(d.value)}, estágio ${STAGE_LABEL[d.stage]}">
      <div class="deal__top"><span class="deal__title">${d.title}</span>
        <button type="button" class="btn btn--ghost btn--icon btn--sm" data-action="deal-menu" aria-label="Ações da oportunidade" aria-haspopup="menu">${icon('more')}</button></div>
      <span class="deal__company">${icon('building', 'icon--sm')}${d.client_company}</span>
      <div class="deal__foot">
        <span class="deal__value">${moneyShort(d.value)}</span>
        ${isOpen
          ? html`<span class="due ${late ? 'due--overdue' : ''}">${icon('calendar', 'icon--sm')}${d.expected_close ? (late ? 'Previsão vencida' : dayMonth(d.expected_close)) : 'Sem previsão'}</span>`
          : html`<span class="due">${d.stage === 'ganho' ? 'Ganha' : 'Perdida'} em ${dayMonth(d.closed_at)}</span>`}
      </div>
    </article>`;
  };

  function paint() {
    const open = deals.filter((d) => OPEN_STAGES.includes(d.stage));
    $('#boardSummary', view).innerHTML = String(
      html`<strong class="num">${money(open.reduce((s, d) => s + d.value, 0))}</strong> em ${plural(open.length, 'oportunidade aberta', 'oportunidades abertas')}.`
    );
    const term = filter.toLowerCase();
    const visible = deals.filter((d) => !term || d.title.toLowerCase().includes(term) || d.client_company.toLowerCase().includes(term));
    board.innerHTML = String(html`${STAGES.map((s) => {
      const items = visible.filter((d) => d.stage === s.id);
      const total = items.reduce((sum, d) => sum + d.value, 0);
      return html`<section class="column" data-stage="${s.id}" style="--stage-color:var(--stage-${s.id})" aria-label="${s.label}">
        <header class="column__head">
          <div class="column__name">${s.label}<span class="count num">${items.length}</span></div>
          <div class="column__total">${money(total)}</div>
        </header>
        <div class="column__list">
          ${items.length ? items.map(cardHtml) : html`<div class="column__empty">${term ? 'Nada encontrado' : 'Solte um cartão aqui'}</div>`}
        </div>
      </section>`;
    })}`);
  }
  paint();

  async function changeStage(deal, stage) {
    if (!deal || deal.stage === stage) return;
    const previous = deal.stage;
    deal.stage = stage; // otimista
    paint();
    try {
      const updated = await moveDeal({ ...deal, stage: previous }, stage);
      if (!updated) {
        deal.stage = previous;
        paint();
        return;
      }
      Object.assign(deal, updated);
      paint();
      board.querySelector(`[data-deal-id="${deal.id}"]`)?.focus();
    } catch (err) {
      deal.stage = previous;
      paint();
      toastError(err);
    }
  }

  // Arrastar e soltar (HTML5)
  let draggingId = null;
  board.addEventListener('dragstart', (e) => {
    const card = e.target.closest('.deal');
    if (!card) return;
    draggingId = card.dataset.dealId;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', draggingId);
    requestAnimationFrame(() => card.classList.add('is-dragging'));
  });
  board.addEventListener('dragend', (e) => {
    e.target.closest('.deal')?.classList.remove('is-dragging');
    board.querySelectorAll('.column.is-over').forEach((c) => c.classList.remove('is-over'));
    draggingId = null;
  });
  board.addEventListener('dragover', (e) => {
    const column = e.target.closest('.column');
    if (!column || !draggingId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    board.querySelectorAll('.column.is-over').forEach((c) => c !== column && c.classList.remove('is-over'));
    column.classList.add('is-over');
  });
  board.addEventListener('dragleave', (e) => {
    const column = e.target.closest('.column');
    if (column && !column.contains(e.relatedTarget)) column.classList.remove('is-over');
  });
  board.addEventListener('drop', (e) => {
    const column = e.target.closest('.column');
    if (!column) return;
    e.preventDefault();
    column.classList.remove('is-over');
    const id = e.dataTransfer.getData('text/plain') || draggingId;
    changeStage(byId.get(String(id)), column.dataset.stage);
  });
  board.addEventListener('keydown', (e) => {
    const card = e.target.closest('.deal');
    if (!card || e.target !== card) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      dealMenu(card.querySelector('[data-action=deal-menu]'), byId.get(card.dataset.dealId));
    }
  });

  function dealMenu(anchor, deal) {
    openMenu(anchor, [
      { label: 'Editar oportunidade', icon: 'edit', onSelect: () => openDealForm({ deal, onSaved: refresh }) },
      { label: 'Abrir ficha do cliente', icon: 'building', onSelect: () => openClientDrawer(deal.client_id, { onChange: refresh }) },
      'divider',
      ...STAGES.filter((s) => s.id !== deal.stage).map((s) => ({
        label: `Mover para ${s.label}`,
        icon: s.id === 'ganho' ? 'trophy' : s.id === 'perdido' ? 'x' : 'arrowRight',
        tone: s.id === 'perdido' ? 'danger' : undefined,
        onSelect: () => changeStage(deal, s.id),
      })),
    ]);
  }

  bindActions(
    view,
    {
      'new-deal': () => openDealForm({ onSaved: refresh }),
      'deal-menu': (e, el) => dealMenu(el, byId.get(el.closest('.deal').dataset.dealId)),
      filter: debounce((e, el) => {
        filter = el.value.trim();
        paint();
      }, 120),
    },
    { events: ['click', 'input'] }
  );
}

// ===========================================================================
// Clientes
// ===========================================================================
const STATUS_FILTERS = [
  ['', 'Todos'],
  ['lead', 'Leads'],
  ['prospect', 'Prospects'],
  ['cliente', 'Clientes'],
  ['inativo', 'Inativos'],
];

async function renderClients(view, ctx) {
  const state = { search: ctx.params.get('q') || '', status: ctx.params.get('status') || '' };

  view.innerHTML = String(html`
    <div class="page-head">
      <p class="page-head__sub" id="clientsSummary">Sua carteira de clientes.</p>
      <div class="page-head__actions"><button type="button" class="btn btn--primary" data-action="new-client">${icon('plus')} Novo cliente</button></div>
    </div>
    <section class="panel">
      <div class="toolbar">
        <div class="input-search"><span>${icon('search')}</span><label class="sr-only" for="clientSearch">Buscar clientes</label>
          <input class="input" id="clientSearch" type="search" placeholder="Empresa, contato, e-mail ou cidade" value="${state.search}" data-action="search" autocomplete="off"></div>
        <div class="segmented" role="group" aria-label="Filtrar por status">
          ${STATUS_FILTERS.map(([v, l]) => html`<button type="button" data-action="status" data-value="${v}" aria-pressed="${state.status === v}">${l}</button>`)}
        </div>
      </div>
      <div class="table-wrap" id="clientsTable"></div>
    </section>`);

  async function load() {
    const { clients } = await api.get(`/api/clients${qs({ search: state.search, status: state.status })}`);
    if (!ctx.isCurrent()) return;
    $('#clientsSummary', view).textContent =
      state.search || state.status ? `${plural(clients.length, 'cliente encontrado', 'clientes encontrados')} com os filtros atuais.` : `${plural(clients.length, 'cliente', 'clientes')} na sua carteira.`;
    $('#clientsTable', view).innerHTML = String(
      clients.length
        ? html`<table class="table">
            <thead><tr><th scope="col">Empresa</th><th scope="col">Status</th><th scope="col" class="hide-sm">Segmento</th><th scope="col" class="t-right">Em aberto</th><th scope="col" class="hide-sm">Última interação</th></tr></thead>
            <tbody>${clients.map(
              (c) => html`<tr class="is-clickable" data-action="open-client" data-id="${c.id}">
                <td><div class="cell-main">${avatar(c.company)}<div class="cell-main__text"><button type="button" class="row-link" data-action="open-client" data-id="${c.id}">${c.company}</button><small>${c.contact_name}${c.city ? `, ${c.city}/${c.state}` : ''}</small></div></div></td>
                <td>${clientBadge(c.status)}</td>
                <td class="hide-sm">${c.segment || '—'}</td>
                <td class="t-right num">${c.open_value ? html`<strong>${moneyShort(c.open_value)}</strong><div class="cell-sub">${plural(c.open_deals, 'oportunidade', 'oportunidades')}</div>` : html`<span class="cell-sub">—</span>`}</td>
                <td class="hide-sm cell-sub">${c.last_activity_at ? relative(c.last_activity_at) : 'Nunca'}</td>
              </tr>`
            )}</tbody>
          </table>`
        : emptyState({
            icon: 'building',
            title: state.search || state.status ? 'Nenhum cliente encontrado' : 'Sua carteira está vazia',
            text: state.search || state.status ? 'Tente outro termo ou limpe os filtros.' : 'Cadastre o primeiro cliente para começar a registrar oportunidades.',
            action: html`<button type="button" class="btn btn--primary" data-action="new-client">${icon('plus')} Novo cliente</button>`,
          })
    );
  }

  bindActions(
    view,
    {
      'new-client': () => openClientForm({ onSaved: (c) => (load(), openClientDrawer(c.id, { onChange: load })) }),
      'open-client': (e, el) => openClientDrawer(el.dataset.id, { onChange: load }),
      search: debounce((e, el) => {
        state.search = el.value.trim();
        load().catch(toastError);
      }, 250),
      status: (e, el) => {
        state.status = el.dataset.value;
        view.querySelectorAll('[data-action=status]').forEach((b) => b.setAttribute('aria-pressed', String(b === el)));
        load().catch(toastError);
      },
    },
    { events: ['click', 'input'] }
  );

  await load();
}

// ===========================================================================
// Tarefas
// ===========================================================================
const TASK_FILTERS = [
  ['pendentes', 'Pendentes'],
  ['hoje', 'Hoje'],
  ['atrasadas', 'Atrasadas'],
  ['proximas', 'Próximas'],
  ['concluidas', 'Concluídas'],
];

function groupTasks(tasks) {
  const groups = [
    ['overdue', 'Atrasadas', []],
    ['today', 'Hoje', []],
    ['soon', 'Próximos dias', []],
    ['later', 'Mais adiante', []],
    ['none', 'Sem prazo', []],
  ];
  for (const t of tasks) groups.find((g) => g[0] === dueInfo(t.due_date).tone)[2].push(t);
  return groups.filter((g) => g[2].length);
}

async function renderTasks(view, ctx) {
  const filter = TASK_FILTERS.some(([v]) => v === ctx.params.get('f')) ? ctx.params.get('f') : 'pendentes';
  const { tasks, counts } = await api.get(`/api/tasks?filter=${filter}`);
  if (!ctx.isCurrent()) return;
  updateTaskBadge(counts.hoje + counts.atrasadas);

  const list =
    filter === 'concluidas'
      ? html`<ul class="tasks">${tasks.map((t) => taskRow(t))}</ul>`
      : groupTasks(tasks).map(([tone, label, items]) => html`<h3 class="task-group__title">${label} <span class="num">(${items.length})</span></h3><ul class="tasks">${items.map((t) => taskRow(t))}</ul>`);

  view.innerHTML = String(html`
    <div class="page-head">
      <p class="page-head__sub">${counts.atrasadas ? html`<strong class="due due--overdue">${plural(counts.atrasadas, 'tarefa atrasada', 'tarefas atrasadas')}</strong>. ` : ''}${plural(counts.hoje, 'tarefa', 'tarefas')} para hoje e ${plural(counts.concluidas, 'concluída', 'concluídas')} no total.</p>
      <div class="page-head__actions"><button type="button" class="btn btn--primary" data-action="new-task">${icon('plus')} Nova tarefa</button></div>
    </div>
    <section class="panel">
      <div class="toolbar">
        <div class="segmented" role="group" aria-label="Filtrar tarefas">
          ${TASK_FILTERS.map(
            ([v, l]) => html`<button type="button" data-action="filter" data-value="${v}" aria-pressed="${filter === v}">${l}
              <span class="count num ${v === 'atrasadas' && counts.atrasadas ? 'count--alert' : ''}">${counts[v]}</span></button>`
          )}
        </div>
      </div>
      <div class="panel__body--flush">
        ${tasks.length
          ? list
          : emptyState({
              icon: 'check',
              title: filter === 'atrasadas' ? 'Nada atrasado' : filter === 'concluidas' ? 'Nenhuma tarefa concluída ainda' : 'Nenhuma tarefa aqui',
              text: filter === 'atrasadas' ? 'Todas as tarefas estão em dia.' : 'Crie tarefas para organizar seus próximos contatos.',
              action: filter === 'concluidas' ? '' : html`<button type="button" class="btn" data-action="new-task">${icon('plus')} Nova tarefa</button>`,
            })}
      </div>
    </section>`);

  bindActions(view, {
    ...taskHandlers(refresh),
    'new-task': () => openTaskForm({ onSaved: refresh }),
    filter: (e, el) => navigate('tarefas', { f: el.dataset.value }),
  });
}

// ===========================================================================
// Inicialização
// ===========================================================================
$('#quickSearch').addEventListener('submit', (e) => {
  e.preventDefault();
  const q = $('#quickSearchInput').value.trim();
  navigate('clientes', q ? { q } : undefined);
});

bootShell({
  area: 'colaborador',
  defaultRoute: 'inicio',
  routes: {
    inicio: { title: 'Meu dia', render: renderHome },
    funil: { title: 'Funil de vendas', render: renderBoard },
    clientes: { title: 'Clientes', render: renderClients },
    tarefas: { title: 'Tarefas', render: renderTasks },
  },
});
