import { api, qs } from './lib/api.js';
import { $, html, raw, debounce } from './lib/dom.js';
import { icon } from './lib/icons.js';
import { money, moneyShort, pct, int, dateBR, dateTimeBR, dayMonth, relative, monthLong, monthShort, timeHM, todayLocal } from './lib/format.js';
import { toast, toastError, openMenu, emptyState, confirmDialog, formModal } from './lib/ui.js';
import { columnChart, barList, progressBar } from './lib/charts.js';
import { bootShell, session, navigate, refresh, bindActions, avatar } from './lib/shell.js';
import {
  STAGES,
  STAGE_LABEL,
  OPEN_STAGES,
  CLIENT_STATUS,
  SEGMENTS,
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
  getOwners,
  invalidateOwners,
  showTempPassword,
} from './lib/crm.js';

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const plural = (n, one, many) => `${int(n)} ${n === 1 ? one : many}`;
const exportCsv = (entity, params = {}) => {
  window.location.href = `/api/admin/export/${entity}${qs(params)}`;
  toast('O download do arquivo CSV vai começar em instantes.', { tone: 'info', duration: 3000 });
};
const ownerOptions = (owners, selected, placeholder = 'Todos os responsáveis') =>
  html`<option value="">${placeholder}</option>${owners.map((u) => html`<option value="${u.id}" ${String(u.id) === String(selected) ? raw('selected') : ''}>${u.name}</option>`)}`;

function setLockBadge(n) {
  const badge = $('#navLockCount');
  badge.hidden = !n;
  badge.textContent = n;
  badge.title = `${n} acessos bloqueados agora`;
}

// ===========================================================================
// Visão geral
// ===========================================================================
async function renderOverview(view, ctx) {
  const d = await api.get('/api/admin/overview');
  if (!ctx.isCurrent()) return;
  const k = d.kpis;
  const now = new Date();
  const month = monthLong(now.getMonth() + 1);
  const prevMonth = monthLong(((now.getMonth() + 11) % 12) + 1);
  const pace = d.month.day / d.month.daysInMonth;
  const teamRatio = k.teamGoal ? k.wonMonth.total / k.teamGoal : 0;
  const delta = k.wonPrev.total ? (k.wonMonth.total - k.wonPrev.total) / k.wonPrev.total : null;
  setLockBadge(d.security.locks);

  const months = d.byMonth.map((m, i, arr) => ({
    label: monthShort(m.month),
    fullLabel: `${capitalize(monthLong(m.month))} de ${m.year}`,
    value: m.total,
    detail: plural(m.count, 'negócio ganho', 'negócios ganhos'),
    accent: i === arr.length - 1,
  }));

  view.innerHTML = String(html`
    <div class="page-head">
      <div>
        <h2 class="page-head__title">Operação comercial de ${month}</h2>
        <p class="page-head__sub">Números de toda a equipe, atualizados às ${timeHM(new Date())}. Dia ${d.month.day} de ${d.month.daysInMonth}.</p>
      </div>
      <div class="page-head__actions">
        <button type="button" class="btn" data-action="export" aria-haspopup="menu">${icon('download')} Exportar dados</button>
        <button type="button" class="btn" data-action="reload">${icon('refresh')} Atualizar</button>
      </div>
    </div>

    <div class="stack">
      <div class="kpis" style="--kpi-cols:3">
        <div class="kpi"><span class="kpi__label">${icon('trophy', 'icon--sm')}Receita ganha no mês</span>
          <span class="kpi__value">${moneyShort(k.wonMonth.total)}</span>
          <span class="kpi__note">${plural(k.wonMonth.count, 'negócio', 'negócios')}${delta !== null ? html`, <span class="delta ${delta >= 0 ? 'delta--up' : 'delta--down'}">${icon(delta >= 0 ? 'trendUp' : 'trendDown', 'icon--sm')}${pct(Math.abs(delta))}</span> vs. ${prevMonth} inteiro` : ''}</span></div>
        <div class="kpi"><span class="kpi__label">${icon('target', 'icon--sm')}Meta da equipe</span>
          <span class="kpi__value">${pct(teamRatio)}</span>
          <span class="kpi__note">${moneyShort(k.wonMonth.total)} de ${moneyShort(k.teamGoal)}</span>
          ${progressBar(teamRatio, { pace, label: 'Meta da equipe' })}</div>
        <div class="kpi"><span class="kpi__label">${icon('board', 'icon--sm')}Pipeline aberto</span>
          <span class="kpi__value">${moneyShort(k.pipeline.total)}</span>
          <span class="kpi__note">${plural(k.pipeline.count, 'oportunidade', 'oportunidades')}, ${moneyShort(k.pipeline.weighted)} ponderado</span></div>
        <div class="kpi"><span class="kpi__label">${icon('activity', 'icon--sm')}Conversão em 90 dias</span>
          <span class="kpi__value">${pct(k.conversion.rate)}</span>
          <span class="kpi__note">${k.conversion.won} ganhas, ${k.conversion.lost} perdidas</span></div>
        <div class="kpi"><span class="kpi__label">${icon('building', 'icon--sm')}Clientes ativos</span>
          <span class="kpi__value">${int(k.clients.cliente || 0)}</span>
          <span class="kpi__note">${int(k.clients.prospect || 0)} prospects, ${int(k.clients.lead || 0)} leads</span></div>
        <div class="kpi"><span class="kpi__label">${icon('users', 'icon--sm')}Usuários ativos</span>
          <span class="kpi__value">${k.users.active}<small class="kpi__note"> de ${k.users.total}</small></span>
          <span class="kpi__note">${plural(k.users.admins, 'administrador', 'administradores')}, ${plural(k.tasks.overdue, 'tarefa atrasada', 'tarefas atrasadas')} na equipe</span></div>
      </div>

      <div class="grid grid--3-2">
        <section class="panel" aria-labelledby="rev-title">
          <header class="panel__head"><h2 class="panel__title" id="rev-title">Receita ganha por mês</h2><span class="panel__hint">Últimos 12 meses, mês atual em destaque</span></header>
          <div class="panel__body">${columnChart(months, { title: 'Receita ganha por mês', height: 210 })}</div>
        </section>
        <section class="panel" aria-labelledby="funnel-title">
          <header class="panel__head"><h2 class="panel__title" id="funnel-title">Pipeline por estágio</h2><a class="panel__link" href="#/oportunidades">Ver oportunidades</a></header>
          <div class="panel__body">${barList(d.byStage.map((s) => ({ label: s.label, value: s.total, count: s.count })), { title: 'Valor em aberto por estágio' })}</div>
        </section>
      </div>

      <section class="panel" aria-labelledby="team-title">
        <header class="panel__head"><h2 class="panel__title" id="team-title">Desempenho da equipe</h2><span class="panel__hint">Traço vertical: ritmo esperado para hoje (${pct(pace)} do mês)</span></header>
        <div class="panel__body--flush table-wrap">
          ${d.team.length
            ? html`<table class="table">
              <thead><tr><th scope="col">Colaborador</th><th scope="col" class="t-right">Ganho no mês</th><th scope="col" style="min-width:180px">Meta</th>
                <th scope="col" class="t-right hide-sm">Pipeline aberto</th><th scope="col" class="t-right hide-sm">Interações (7 dias)</th><th scope="col" class="t-right">Atrasadas</th></tr></thead>
              <tbody>${d.team.map((u) => {
                const ratio = u.monthly_goal ? u.won_month / u.monthly_goal : 0;
                return html`<tr>
                  <td><div class="cell-main">${avatar(u.name)}<div class="cell-main__text"><strong>${u.name}</strong><small>${u.title || ''}${u.team ? `, ${u.team}` : ''}</small></div></div></td>
                  <td class="t-right num"><strong>${money(u.won_month)}</strong><div class="cell-sub">${plural(u.won_count, 'negócio', 'negócios')}</div></td>
                  <td>${u.monthly_goal
                    ? html`<div style="display:grid;gap:6px">${progressBar(ratio, { pace, label: `Meta de ${u.name}` })}<span class="cell-sub num">${pct(ratio)} de ${moneyShort(u.monthly_goal)}</span></div>`
                    : html`<span class="cell-sub">Sem meta</span>`}</td>
                  <td class="t-right num hide-sm">${moneyShort(u.open_value)}</td>
                  <td class="t-right num hide-sm">${u.activities_week}</td>
                  <td class="t-right num">${u.overdue ? html`<span class="due due--overdue">${u.overdue}</span>` : html`<span class="cell-sub">0</span>`}</td>
                </tr>`;
              })}</tbody></table>`
            : emptyState({ icon: 'users', title: 'Nenhum colaborador ativo', text: 'Cadastre colaboradores em Usuários.' })}
        </div>
      </section>

      <div class="grid grid--2">
        <section class="panel" aria-labelledby="seg-title">
          <header class="panel__head"><h2 class="panel__title" id="seg-title">Receita por segmento</h2><span class="panel__hint">Últimos 12 meses</span></header>
          <div class="panel__body">${d.bySegment.length
            ? barList(d.bySegment.map((s) => ({ label: s.segment, value: s.total, count: s.count })), { title: 'Receita ganha por segmento', countLabel: 'negócios' })
            : html`<p class="muted">Sem negócios ganhos no período.</p>`}</div>
        </section>
        <section class="panel" aria-labelledby="audit-title">
          <header class="panel__head"><h2 class="panel__title" id="audit-title">Atividade no sistema</h2><a class="panel__link" href="#/auditoria">Ver auditoria</a></header>
          <div class="panel__body">
            <div class="stat-strip" style="margin-bottom:12px">
              <div><span>Logins (24 h)</span><strong>${d.security.logins24h}</strong></div>
              <div><span>Falhas de login (24 h)</span><strong>${d.security.failed24h}</strong></div>
              <div><span>Bloqueios ativos</span><strong>${d.security.locks}</strong></div>
            </div>
            <ul class="mini-list">${d.recentAudit.map(
              (l) => html`<li><span class="audit-dot ${auditTone(l.action)}"></span><div><strong>${actionLabel(l.action)}</strong><small>${l.user_name || l.user_email || 'Sistema'}${l.details ? `, ${detailsText(l.details)}` : ''}</small></div><small class="cell-sub">${relative(l.created_at)}</small></li>`
            )}</ul>
          </div>
        </section>
      </div>
    </div>`);

  bindActions(view, {
    reload: refresh,
    export: (e, el) =>
      openMenu(el, [
        { label: 'Clientes (CSV)', icon: 'building', onSelect: () => exportCsv('clientes') },
        { label: 'Oportunidades (CSV)', icon: 'briefcase', onSelect: () => exportCsv('oportunidades') },
        { label: 'Tarefas (CSV)', icon: 'tasks', onSelect: () => exportCsv('tarefas') },
        { label: 'Usuários (CSV)', icon: 'users', onSelect: () => exportCsv('usuarios') },
      ]),
  });
}

// ===========================================================================
// Usuários
// ===========================================================================
const ROLE_LABEL = { admin: 'Administrador', colaborador: 'Colaborador' };

function userForm(user, onSaved) {
  const u = user || { role: 'colaborador' };
  formModal({
    title: user ? 'Editar usuário' : 'Novo usuário',
    description: user ? user.email : 'A pessoa recebe acesso imediato com o perfil escolhido.',
    size: 'lg',
    submitLabel: user ? 'Salvar alterações' : 'Criar usuário',
    fields: html`
      <div class="form__grid">
        <div class="field"><label class="field__label" for="uf-name">Nome completo</label><input class="input" id="uf-name" name="name" required minlength="3" maxlength="120" value="${u.name || ''}"></div>
        <div class="field"><label class="field__label" for="uf-email">E-mail de acesso</label><input class="input" id="uf-email" name="email" type="email" required maxlength="160" value="${u.email || ''}" placeholder="nome@crmsystem.com.br"></div>
        <div class="field"><label class="field__label" for="uf-role">Perfil de acesso</label>
          <select class="select" id="uf-role" name="role">${Object.entries(ROLE_LABEL).map(([v, l]) => html`<option value="${v}" ${u.role === v ? raw('selected') : ''}>${l}</option>`)}</select>
          <p class="field__hint">Administradores veem e alteram tudo; colaboradores, só a própria carteira.</p></div>
        <div class="field"><label class="field__label" for="uf-goal">Meta mensal (R$)</label><input class="input num" id="uf-goal" name="monthly_goal" type="number" min="0" step="1000" value="${u.monthly_goal ?? ''}" placeholder="0"></div>
        <div class="field"><label class="field__label" for="uf-title">Cargo</label><input class="input" id="uf-title" name="title" maxlength="80" value="${u.title || ''}"></div>
        <div class="field"><label class="field__label" for="uf-team">Equipe</label><input class="input" id="uf-team" name="team" maxlength="80" value="${u.team || ''}" placeholder="Ex.: Vendas PME"></div>
        <div class="field"><label class="field__label" for="uf-phone">Telefone</label><input class="input" id="uf-phone" name="phone" maxlength="30" value="${u.phone || ''}"></div>
        ${user
          ? ''
          : html`<div class="field"><label class="field__label" for="uf-pass">Senha inicial <small>(opcional)</small></label><input class="input" id="uf-pass" name="password" type="password" autocomplete="new-password" minlength="8" maxlength="128">
              <p class="field__hint">Em branco, o sistema gera uma senha temporária.</p></div>
            <div class="field field--full"><label class="check"><input type="checkbox" name="must_change_password" checked> Exigir troca de senha no primeiro acesso</label></div>`}
      </div>`,
    onSubmit: async (data) => {
      const payload = { ...data, monthly_goal: data.monthly_goal === '' ? 0 : Number(data.monthly_goal) };
      const res = user ? await api.put(`/api/admin/users/${user.id}`, payload) : await api.post('/api/admin/users', payload);
      invalidateOwners();
      toast(user ? 'Usuário atualizado.' : `${res.user.name} agora tem acesso ao sistema.`);
      if (res.tempPassword) showTempPassword(res.user.name, res.tempPassword);
      onSaved?.();
    },
  });
}

async function deleteUser(user, users, onDone) {
  const targets = users.filter((u) => u.id !== user.id && u.status === 'ativo');
  formModal({
    title: `Excluir ${user.name}?`,
    description: 'A exclusão é permanente. A carteira da pessoa é transferida antes.',
    size: 'sm',
    tone: 'danger',
    submitLabel: 'Transferir e excluir',
    fields: html`
      <p class="modal__text">${plural(user.clients, 'cliente', 'clientes')}, ${plural(user.open_deals, 'oportunidade aberta', 'oportunidades abertas')} e ${plural(user.pending_tasks, 'tarefa pendente', 'tarefas pendentes')} serão transferidos.</p>
      <div class="field"><label class="field__label" for="del-to">Transferir carteira para</label>
        <select class="select" id="del-to" name="transfer_to" required><option value="">Selecione</option>${targets.map((u) => html`<option value="${u.id}">${u.name} (${ROLE_LABEL[u.role]})</option>`)}</select></div>`,
    onSubmit: async (data) => {
      await api.del(`/api/admin/users/${user.id}`, data);
      invalidateOwners();
      toast(`${user.name} foi excluído e a carteira transferida.`);
      onDone();
    },
  });
}

async function renderUsers(view, ctx) {
  const { users } = await api.get('/api/admin/users');
  if (!ctx.isCurrent()) return;
  const state = { search: '', filter: 'todos' };
  const active = users.filter((u) => u.status === 'ativo').length;

  view.innerHTML = String(html`
    <div class="page-head">
      <p class="page-head__sub">${plural(users.length, 'usuário', 'usuários')}, ${active} ativos. Administradores têm acesso total; colaboradores veem apenas a própria carteira.</p>
      <div class="page-head__actions">
        <button type="button" class="btn" data-action="export">${icon('download')} Exportar CSV</button>
        <button type="button" class="btn btn--primary" data-action="new-user">${icon('plus')} Novo usuário</button>
      </div>
    </div>
    <section class="panel">
      <div class="toolbar">
        <div class="input-search"><span>${icon('search')}</span><label class="sr-only" for="userSearch">Buscar usuários</label>
          <input class="input" id="userSearch" type="search" placeholder="Nome, e-mail ou equipe" data-action="search" autocomplete="off"></div>
        <div class="segmented" role="group" aria-label="Filtrar usuários">
          ${[['todos', 'Todos'], ['admin', 'Administradores'], ['colaborador', 'Colaboradores'], ['inativo', 'Inativos']].map(
            ([v, l]) => html`<button type="button" data-action="filter" data-value="${v}" aria-pressed="${v === 'todos'}">${l}</button>`
          )}
        </div>
      </div>
      <div class="table-wrap" id="usersTable"></div>
    </section>`);

  function paint() {
    const term = state.search.toLowerCase();
    const list = users.filter((u) => {
      if (state.filter === 'inativo' && u.status !== 'inativo') return false;
      if ((state.filter === 'admin' || state.filter === 'colaborador') && (u.role !== state.filter || u.status !== 'ativo')) return false;
      return !term || [u.name, u.email, u.team, u.title].some((x) => (x || '').toLowerCase().includes(term));
    });
    $('#usersTable', view).innerHTML = String(
      list.length
        ? html`<table class="table">
          <thead><tr><th scope="col">Usuário</th><th scope="col">Perfil</th><th scope="col" class="hide-sm">Equipe</th><th scope="col" class="t-right hide-sm">Meta mensal</th>
            <th scope="col" class="t-right hide-sm">Carteira</th><th scope="col" class="hide-sm">Último acesso</th><th scope="col">Status</th><th scope="col"><span class="sr-only">Ações</span></th></tr></thead>
          <tbody>${list.map(
            (u) => html`<tr data-user-id="${u.id}">
              <td><div class="cell-main">${avatar(u.name)}<div class="cell-main__text"><strong>${u.name}${u.id === session.user.id ? html` <span class="cell-sub">(você)</span>` : ''}</strong><small>${u.email}</small></div></div></td>
              <td><span class="badge badge--plain ${u.role === 'admin' ? 'badge--brass' : 'badge--brand'}">${ROLE_LABEL[u.role]}</span>${u.must_change_password ? html`<div class="cell-sub">Senha temporária</div>` : ''}</td>
              <td class="hide-sm">${u.team || '—'}<div class="cell-sub">${u.title || ''}</div></td>
              <td class="t-right num hide-sm">${u.monthly_goal ? money(u.monthly_goal) : '—'}</td>
              <td class="t-right num hide-sm">${plural(u.clients, 'cliente', 'clientes')}<div class="cell-sub">${plural(u.open_deals, 'oport. aberta', 'oport. abertas')}</div></td>
              <td class="hide-sm cell-sub">${u.last_login_at ? relative(u.last_login_at) : 'Nunca'}</td>
              <td>${u.status === 'ativo' ? html`<span class="badge badge--success">Ativo</span>` : html`<span class="badge">Inativo</span>`}</td>
              <td><div class="row-actions"><button type="button" class="btn btn--ghost btn--icon btn--sm" data-action="user-menu" aria-label="Ações para ${u.name}" aria-haspopup="menu">${icon('more')}</button></div></td>
            </tr>`
          )}</tbody></table>`
        : emptyState({ icon: 'users', title: 'Nenhum usuário encontrado', text: 'Ajuste a busca ou o filtro.' })
    );
  }
  paint();

  const act = async (fn, okMessage) => {
    try {
      await fn();
      if (okMessage) toast(okMessage);
      invalidateOwners();
      refresh();
    } catch (err) {
      toastError(err);
    }
  };

  function userMenu(anchor, u) {
    const self = u.id === session.user.id;
    openMenu(anchor, [
      { label: 'Editar dados e perfil', icon: 'edit', onSelect: () => userForm(u, refresh) },
      {
        label: 'Redefinir senha',
        icon: 'key',
        onSelect: async () => {
          const ok = await confirmDialog({
            title: `Redefinir a senha de ${u.name}?`,
            message: 'Uma senha temporária será gerada e todas as sessões abertas dessa pessoa serão encerradas.',
            confirmLabel: 'Gerar senha temporária',
            tone: 'primary',
          });
          if (!ok) return;
          try {
            const res = await api.post(`/api/admin/users/${u.id}/reset-password`);
            showTempPassword(u.name, res.tempPassword);
            refresh();
          } catch (err) {
            toastError(err);
          }
        },
      },
      {
        label: 'Encerrar sessões abertas',
        icon: 'logout',
        onSelect: () => act(() => api.post(`/api/admin/users/${u.id}/revoke-sessions`), `Sessões de ${u.name} encerradas.`),
      },
      'divider',
      u.status === 'ativo'
        ? {
            label: 'Desativar acesso',
            icon: 'lock',
            tone: 'danger',
            disabled: self,
            onSelect: async () => {
              const ok = await confirmDialog({
                title: `Desativar ${u.name}?`,
                message: 'A pessoa perde o acesso na hora, mas a carteira e o histórico continuam no sistema. Você pode reativar depois.',
                confirmLabel: 'Desativar acesso',
              });
              if (ok) act(() => api.patch(`/api/admin/users/${u.id}/status`, { status: 'inativo' }), `${u.name} foi desativado.`);
            },
          }
        : { label: 'Reativar acesso', icon: 'unlock', onSelect: () => act(() => api.patch(`/api/admin/users/${u.id}/status`, { status: 'ativo' }), `${u.name} foi reativado.`) },
      { label: 'Excluir usuário', icon: 'trash', tone: 'danger', disabled: self, onSelect: () => deleteUser(u, users, refresh) },
    ]);
  }

  bindActions(
    view,
    {
      'new-user': () => userForm(null, refresh),
      export: () => exportCsv('usuarios'),
      'user-menu': (e, el) => userMenu(el, users.find((u) => String(u.id) === el.closest('[data-user-id]').dataset.userId)),
      search: (e, el) => {
        state.search = el.value.trim();
        paint();
      },
      filter: (e, el) => {
        state.filter = el.dataset.value;
        view.querySelectorAll('[data-action=filter]').forEach((b) => b.setAttribute('aria-pressed', String(b === el)));
        paint();
      },
    },
    { events: ['click', 'input'] }
  );
}

// ===========================================================================
// Clientes (todos)
// ===========================================================================
async function renderClients(view, ctx) {
  const owners = await getOwners();
  if (!ctx.isCurrent()) return;
  const state = { search: '', status: '', owner: ctx.params.get('owner') || '', segment: '' };

  view.innerHTML = String(html`
    <div class="page-head">
      <p class="page-head__sub" id="clientsSummary">Todos os clientes da empresa.</p>
      <div class="page-head__actions">
        <button type="button" class="btn" data-action="export">${icon('download')} Exportar CSV</button>
        <button type="button" class="btn btn--primary" data-action="new-client">${icon('plus')} Novo cliente</button>
      </div>
    </div>
    <section class="panel">
      <div class="toolbar">
        <div class="input-search"><span>${icon('search')}</span><label class="sr-only" for="cSearch">Buscar clientes</label>
          <input class="input" id="cSearch" type="search" placeholder="Empresa, contato, e-mail ou cidade" data-action="search" autocomplete="off"></div>
        <label class="sr-only" for="cStatus">Status</label>
        <select class="select" id="cStatus" data-action="status"><option value="">Todos os status</option>${Object.entries(CLIENT_STATUS).map(([v, s]) => html`<option value="${v}">${s.label}</option>`)}</select>
        <label class="sr-only" for="cOwner">Responsável</label>
        <select class="select" id="cOwner" data-action="owner">${ownerOptions(owners, state.owner)}</select>
        <label class="sr-only" for="cSegment">Segmento</label>
        <select class="select" id="cSegment" data-action="segment"><option value="">Todos os segmentos</option>${SEGMENTS.map((s) => html`<option>${s}</option>`)}</select>
      </div>
      <div class="table-wrap" id="clientsTable"></div>
    </section>`);

  async function load() {
    const { clients } = await api.get(`/api/clients${qs({ scope: 'all', search: state.search, status: state.status, owner: state.owner, segment: state.segment })}`);
    if (!ctx.isCurrent()) return;
    const open = clients.reduce((s, c) => s + c.open_value, 0);
    $('#clientsSummary', view).textContent = `${plural(clients.length, 'cliente', 'clientes')} no filtro atual, com ${moneyShort(open)} em oportunidades abertas.`;
    $('#clientsTable', view).innerHTML = String(
      clients.length
        ? html`<table class="table">
          <thead><tr><th scope="col">Empresa</th><th scope="col">Responsável</th><th scope="col">Status</th><th scope="col" class="hide-sm">Segmento</th>
            <th scope="col" class="t-right">Em aberto</th><th scope="col" class="t-right hide-sm">Faturado</th><th scope="col" class="hide-sm">Última interação</th><th scope="col"><span class="sr-only">Ações</span></th></tr></thead>
          <tbody>${clients.map(
            (c) => html`<tr data-client-id="${c.id}">
              <td><div class="cell-main">${avatar(c.company)}<div class="cell-main__text"><button type="button" class="row-link" data-action="open">${c.company}</button><small>${c.contact_name}${c.city ? `, ${c.city}/${c.state}` : ''}</small></div></div></td>
              <td>${c.owner_name || html`<span class="cell-sub">Sem responsável</span>`}</td>
              <td>${clientBadge(c.status)}</td>
              <td class="hide-sm">${c.segment || '—'}</td>
              <td class="t-right num">${c.open_value ? moneyShort(c.open_value) : html`<span class="cell-sub">—</span>`}</td>
              <td class="t-right num hide-sm">${c.won_value ? moneyShort(c.won_value) : html`<span class="cell-sub">—</span>`}</td>
              <td class="hide-sm cell-sub">${c.last_activity_at ? relative(c.last_activity_at) : 'Nunca'}</td>
              <td><div class="row-actions"><button type="button" class="btn btn--ghost btn--icon btn--sm" data-action="menu" aria-label="Ações para ${c.company}" aria-haspopup="menu">${icon('more')}</button></div></td>
            </tr>`
          )}</tbody></table>`
        : emptyState({ icon: 'building', title: 'Nenhum cliente encontrado', text: 'Ajuste a busca ou os filtros.' })
    );
    view._clients = clients;
  }

  const clientOf = (el) => view._clients.find((c) => String(c.id) === el.closest('[data-client-id]').dataset.clientId);
  const reload = () => load().catch(toastError);

  bindActions(
    view,
    {
      'new-client': () => openClientForm({ scopeAll: true, onSaved: reload }),
      export: () => exportCsv('clientes'),
      open: (e, el) => openClientDrawer(clientOf(el).id, { scopeAll: true, onChange: reload }),
      menu: (e, el) => {
        const c = clientOf(el);
        openMenu(el, [
          { label: 'Abrir ficha', icon: 'building', onSelect: () => openClientDrawer(c.id, { scopeAll: true, onChange: reload }) },
          { label: 'Editar ou transferir', icon: 'edit', onSelect: () => openClientForm({ client: c, scopeAll: true, onSaved: reload }) },
          'divider',
          {
            label: 'Excluir cliente',
            icon: 'trash',
            tone: 'danger',
            onSelect: async () => {
              const ok = await confirmDialog({
                title: `Excluir ${c.company}?`,
                message: 'As oportunidades e o histórico de interações deste cliente também serão excluídos. Essa ação não pode ser desfeita.',
                confirmLabel: 'Excluir cliente',
              });
              if (!ok) return;
              try {
                await api.del(`/api/clients/${c.id}`);
                toast(`${c.company} foi excluído.`);
                reload();
              } catch (err) {
                toastError(err);
              }
            },
          },
        ]);
      },
      search: debounce((e, el) => ((state.search = el.value.trim()), reload()), 250),
      status: (e, el) => ((state.status = el.value), reload()),
      owner: (e, el) => ((state.owner = el.value), reload()),
      segment: (e, el) => ((state.segment = el.value), reload()),
    },
    { events: ['click', 'input'] }
  );
  await load();
}

// ===========================================================================
// Oportunidades (todas)
// ===========================================================================
async function renderDeals(view, ctx) {
  const owners = await getOwners();
  if (!ctx.isCurrent()) return;
  const state = { search: '', stage: ctx.params.get('stage') || 'abertas', owner: '' };

  view.innerHTML = String(html`
    <div class="page-head">
      <p class="page-head__sub" id="dealsSummary">Todas as oportunidades da empresa.</p>
      <div class="page-head__actions">
        <button type="button" class="btn" data-action="export">${icon('download')} Exportar CSV</button>
        <button type="button" class="btn btn--primary" data-action="new-deal">${icon('plus')} Nova oportunidade</button>
      </div>
    </div>
    <section class="panel">
      <div class="toolbar">
        <div class="input-search"><span>${icon('search')}</span><label class="sr-only" for="dSearch">Buscar oportunidades</label>
          <input class="input" id="dSearch" type="search" placeholder="Título ou cliente" data-action="search" autocomplete="off"></div>
        <label class="sr-only" for="dStage">Estágio</label>
        <select class="select" id="dStage" data-action="stage">
          <option value="abertas" ${state.stage === 'abertas' ? raw('selected') : ''}>Em aberto (todos os estágios)</option>
          <option value="" ${state.stage === '' ? raw('selected') : ''}>Todas, inclusive encerradas</option>
          ${STAGES.map((s) => html`<option value="${s.id}" ${state.stage === s.id ? raw('selected') : ''}>${s.label}</option>`)}
        </select>
        <label class="sr-only" for="dOwner">Responsável</label>
        <select class="select" id="dOwner" data-action="owner">${ownerOptions(owners, state.owner)}</select>
      </div>
      <div class="table-wrap" id="dealsTable"></div>
    </section>`);

  let deals = [];
  async function load() {
    const stageParam = state.stage === 'abertas' ? '' : state.stage;
    const res = await api.get(`/api/deals${qs({ scope: 'all', search: state.search, stage: stageParam, owner: state.owner })}`);
    if (!ctx.isCurrent()) return;
    deals = state.stage === 'abertas' ? res.deals.filter((d) => OPEN_STAGES.includes(d.stage)) : res.deals;
    const total = deals.reduce((s, d) => s + d.value, 0);
    const weighted = deals.reduce((s, d) => s + (d.value * d.probability) / 100, 0);
    $('#dealsSummary', view).textContent = `${plural(deals.length, 'oportunidade', 'oportunidades')} somando ${money(total)} (${moneyShort(weighted)} ponderado).`;
    const today = todayLocal();
    $('#dealsTable', view).innerHTML = String(
      deals.length
        ? html`<table class="table">
          <thead><tr><th scope="col">Oportunidade</th><th scope="col">Responsável</th><th scope="col">Estágio</th><th scope="col" class="t-right">Valor</th>
            <th scope="col" class="t-right hide-sm">Prob.</th><th scope="col" class="hide-sm">Previsão / fechamento</th><th scope="col"><span class="sr-only">Ações</span></th></tr></thead>
          <tbody>${deals.map((d) => {
            const isOpen = OPEN_STAGES.includes(d.stage);
            const late = isOpen && d.expected_close && d.expected_close < today;
            return html`<tr data-deal-id="${d.id}">
              <td><div class="cell-main__text"><button type="button" class="row-link" data-action="edit">${d.title}</button><small>${d.client_company}</small></div></td>
              <td>${d.owner_name || '—'}</td>
              <td>${stageBadge(d.stage)}</td>
              <td class="t-right num"><strong>${money(d.value)}</strong></td>
              <td class="t-right num hide-sm">${d.probability}%</td>
              <td class="hide-sm">${isOpen
                ? html`<span class="due ${late ? 'due--overdue' : ''}">${d.expected_close ? (late ? `Vencida em ${dayMonth(d.expected_close)}` : dateBR(d.expected_close)) : 'Sem previsão'}</span>`
                : html`<span class="cell-sub">${dateBR(d.closed_at)}${d.lost_reason ? `, ${d.lost_reason}` : ''}</span>`}</td>
              <td><div class="row-actions"><button type="button" class="btn btn--ghost btn--icon btn--sm" data-action="menu" aria-label="Ações para ${d.title}" aria-haspopup="menu">${icon('more')}</button></div></td>
            </tr>`;
          })}</tbody></table>`
        : emptyState({ icon: 'briefcase', title: 'Nenhuma oportunidade encontrada', text: 'Ajuste a busca ou os filtros.' })
    );
  }
  const reload = () => load().catch(toastError);
  const dealOf = (el) => deals.find((d) => String(d.id) === el.closest('[data-deal-id]').dataset.dealId);

  bindActions(
    view,
    {
      'new-deal': () => openDealForm({ scopeAll: true, onSaved: reload }),
      export: () => exportCsv('oportunidades'),
      edit: (e, el) => openDealForm({ deal: dealOf(el), scopeAll: true, onSaved: reload }),
      menu: (e, el) => {
        const d = dealOf(el);
        openMenu(el, [
          { label: 'Editar ou reatribuir', icon: 'edit', onSelect: () => openDealForm({ deal: d, scopeAll: true, onSaved: reload }) },
          { label: 'Abrir ficha do cliente', icon: 'building', onSelect: () => openClientDrawer(d.client_id, { scopeAll: true, onChange: reload }) },
          'divider',
          ...STAGES.filter((s) => s.id !== d.stage).map((s) => ({
            label: `Mover para ${s.label}`,
            icon: s.id === 'ganho' ? 'trophy' : s.id === 'perdido' ? 'x' : 'arrowRight',
            onSelect: async () => {
              try {
                if (await moveDeal(d, s.id)) reload();
              } catch (err) {
                toastError(err);
              }
            },
          })),
          'divider',
          {
            label: 'Excluir oportunidade',
            icon: 'trash',
            tone: 'danger',
            onSelect: async () => {
              const ok = await confirmDialog({ title: 'Excluir oportunidade?', message: `"${d.title}" (${money(d.value)}) será removida permanentemente.`, confirmLabel: 'Excluir' });
              if (!ok) return;
              try {
                await api.del(`/api/deals/${d.id}`);
                toast('Oportunidade excluída.');
                reload();
              } catch (err) {
                toastError(err);
              }
            },
          },
        ]);
      },
      search: debounce((e, el) => ((state.search = el.value.trim()), reload()), 250),
      stage: (e, el) => ((state.stage = el.value), reload()),
      owner: (e, el) => ((state.owner = el.value), reload()),
    },
    { events: ['click', 'input'] }
  );
  await load();
}

// ===========================================================================
// Tarefas (todas)
// ===========================================================================
async function renderTasks(view, ctx) {
  const owners = await getOwners();
  const filter = ctx.params.get('f') || 'pendentes';
  const owner = ctx.params.get('owner') || '';
  const { tasks, counts } = await api.get(`/api/tasks${qs({ scope: 'all', filter, owner })}`);
  if (!ctx.isCurrent()) return;

  view.innerHTML = String(html`
    <div class="page-head">
      <p class="page-head__sub">${counts.atrasadas ? html`<strong class="due due--overdue">${plural(counts.atrasadas, 'tarefa atrasada', 'tarefas atrasadas')}</strong> na equipe. ` : ''}${plural(counts.hoje, 'tarefa vence', 'tarefas vencem')} hoje.</p>
      <div class="page-head__actions">
        <button type="button" class="btn" data-action="export">${icon('download')} Exportar CSV</button>
        <button type="button" class="btn btn--primary" data-action="new-task">${icon('plus')} Nova tarefa</button>
      </div>
    </div>
    <section class="panel">
      <div class="toolbar">
        <div class="segmented" role="group" aria-label="Filtrar tarefas">
          ${[['pendentes', 'Pendentes'], ['hoje', 'Hoje'], ['atrasadas', 'Atrasadas'], ['proximas', 'Próximas'], ['concluidas', 'Concluídas']].map(
            ([v, l]) => html`<button type="button" data-action="filter" data-value="${v}" aria-pressed="${filter === v}">${l} <span class="count num ${v === 'atrasadas' && counts.atrasadas ? 'count--alert' : ''}">${counts[v]}</span></button>`
          )}
        </div>
        <label class="sr-only" for="tOwner">Responsável</label>
        <select class="select" id="tOwner" data-action="owner">${ownerOptions(owners, owner)}</select>
      </div>
      <div class="panel__body--flush">
        ${tasks.length ? html`<ul class="tasks">${tasks.map((t) => taskRow(t, { showOwner: true }))}</ul>` : emptyState({ icon: 'check', title: 'Nenhuma tarefa neste filtro', text: 'Tente outro filtro ou responsável.' })}
      </div>
    </section>`);

  const go = (params) => navigate('tarefas', Object.fromEntries(Object.entries({ f: filter, owner, ...params }).filter(([, v]) => v)));
  bindActions(
    view,
    {
      'new-task': () => openTaskForm({ scopeAll: true, onSaved: refresh }),
      export: () => exportCsv('tarefas'),
      filter: (e, el) => go({ f: el.dataset.value }),
      owner: (e, el) => go({ owner: el.value }),
      'toggle-task': async (e, el) => {
        try {
          await toggleTask(el.closest('[data-task-id]').dataset.taskId);
          refresh();
        } catch (err) {
          toastError(err);
        }
      },
      'task-menu': (e, el) => {
        const task = tasks.find((t) => String(t.id) === el.closest('[data-task-id]').dataset.taskId);
        openMenu(el, [
          { label: 'Editar ou reatribuir', icon: 'edit', onSelect: () => openTaskForm({ task, scopeAll: true, onSaved: refresh }) },
          {
            label: 'Excluir',
            icon: 'trash',
            tone: 'danger',
            onSelect: async () => {
              if (!(await confirmDialog({ title: 'Excluir tarefa?', message: `"${task.title}" será removida.`, confirmLabel: 'Excluir tarefa' }))) return;
              try {
                await api.del(`/api/tasks/${task.id}`);
                toast('Tarefa excluída.');
                refresh();
              } catch (err) {
                toastError(err);
              }
            },
          },
        ]);
      },
    },
    { events: ['click', 'input'] }
  );
}

// ===========================================================================
// Auditoria
// ===========================================================================
const ACTION_LABEL = {
  'auth.login': 'Entrou no sistema',
  'auth.logout': 'Saiu do sistema',
  'auth.login_failed': 'Login recusado: credenciais inválidas',
  'auth.locked': 'Acesso bloqueado após tentativas',
  'auth.login_denied': 'Login recusado',
  'user.create': 'Criou usuário',
  'user.update': 'Editou usuário',
  'user.role_changed': 'Alterou perfil de acesso',
  'user.activate': 'Reativou usuário',
  'user.deactivate': 'Desativou usuário',
  'user.reset_password': 'Redefiniu senha de usuário',
  'user.revoke_sessions': 'Encerrou sessões de usuário',
  'user.delete': 'Excluiu usuário',
  'user.password_changed': 'Alterou a própria senha',
  'user.profile_updated': 'Atualizou o próprio perfil',
  'client.create': 'Cadastrou cliente',
  'client.update': 'Editou cliente',
  'client.transfer': 'Transferiu cliente',
  'client.delete': 'Excluiu cliente',
  'deal.create': 'Criou oportunidade',
  'deal.update': 'Editou oportunidade',
  'deal.stage': 'Moveu oportunidade',
  'deal.delete': 'Excluiu oportunidade',
  'task.create': 'Criou tarefa',
  'task.update': 'Editou tarefa',
  'task.complete': 'Concluiu tarefa',
  'task.reopen': 'Reabriu tarefa',
  'task.delete': 'Excluiu tarefa',
  'activity.create': 'Registrou interação',
  'settings.update': 'Alterou configurações',
  'settings.maintenance': 'Alterou o modo manutenção',
  'security.unlock': 'Desbloqueou acesso',
  'export.csv': 'Exportou dados',
  'system.reset_demo': 'Restaurou dados de demonstração',
};
const actionLabel = (a) => ACTION_LABEL[a] || a;
function auditTone(action) {
  if (/failed|locked|denied|delete|deactivate/.test(action)) return 'audit-dot--danger';
  if (/^auth\./.test(action)) return 'audit-dot--auth';
  if (/^(settings|security|system|export)\./.test(action)) return 'audit-dot--brass';
  return '';
}
const DETAIL_KEYS = { email: 'e-mail', titulo: 'título', estagio: 'estágio', transferido_para: 'transferido para', motivo: 'motivo', lembrar: 'lembrar' };
function detailsText(raw) {
  try {
    const obj = JSON.parse(raw);
    return Object.entries(obj)
      .map(([k, v]) => {
        let val = v;
        if (typeof v === 'boolean') val = v ? 'sim' : 'não';
        else if (k === 'valor') val = money(v);
        else if (k === 'tipo') val = ACTIVITY_LABEL[v] || v;
        else if (k === 'perfil' || ((k === 'de' || k === 'para') && ROLE_LABEL[v])) val = ROLE_LABEL[v] || v;
        else if (k === 'estagio') val = STAGE_LABEL[v] || v;
        return `${DETAIL_KEYS[k] || k.replace(/_/g, ' ')}: ${val}`;
      })
      .join('; ');
  } catch {
    return String(raw);
  }
}
const AUDIT_GROUPS = [
  ['', 'Todas as ações'],
  ['auth.', 'Acessos e logins'],
  ['auth.login_failed', 'Falhas de login'],
  ['user.', 'Usuários'],
  ['client.', 'Clientes'],
  ['deal.', 'Oportunidades'],
  ['task.', 'Tarefas'],
  ['activity.', 'Interações'],
  ['settings.', 'Configurações'],
  ['security.', 'Segurança'],
  ['export.', 'Exportações'],
  ['system.', 'Sistema'],
];

async function renderAudit(view, ctx) {
  const { users } = await api.get('/api/admin/users');
  if (!ctx.isCurrent()) return;
  const state = { action: ctx.params.get('action') || '', user_id: '', from: '', to: '', search: '', page: 1 };

  view.innerHTML = String(html`
    <div class="page-head">
      <p class="page-head__sub">Registro de tudo o que acontece no sistema: acessos, alterações de dados, permissões e exportações.</p>
      <div class="page-head__actions"><button type="button" class="btn" data-action="export">${icon('download')} Exportar filtro em CSV</button></div>
    </div>
    <section class="panel">
      <div class="toolbar">
        <div class="input-search"><span>${icon('search')}</span><label class="sr-only" for="aSearch">Buscar na auditoria</label>
          <input class="input" id="aSearch" type="search" placeholder="E-mail, IP ou detalhe" data-action="search" autocomplete="off"></div>
        <label class="sr-only" for="aAction">Tipo de ação</label>
        <select class="select" id="aAction" data-action="action">${AUDIT_GROUPS.map(([v, l]) => html`<option value="${v}" ${v === state.action ? raw('selected') : ''}>${l}</option>`)}</select>
        <label class="sr-only" for="aUser">Usuário</label>
        <select class="select" id="aUser" data-action="user">${ownerOptions(users, '', 'Todos os usuários')}</select>
        <label class="sr-only" for="aFrom">De</label><input class="input" style="width:auto" id="aFrom" type="date" data-action="from" title="Data inicial">
        <label class="sr-only" for="aTo">Até</label><input class="input" style="width:auto" id="aTo" type="date" data-action="to" title="Data final">
      </div>
      <div class="table-wrap" id="auditTable"></div>
      <div class="table-foot" id="auditFoot"></div>
    </section>`);

  async function load() {
    const params = { action: state.action, user_id: state.user_id, from: state.from, to: state.to, search: state.search, page: state.page, page_size: 25 };
    const res = await api.get(`/api/admin/audit${qs(params)}`);
    if (!ctx.isCurrent()) return;
    state.page = res.page;
    $('#auditTable', view).innerHTML = String(
      res.items.length
        ? html`<table class="table">
          <thead><tr><th scope="col">Quando</th><th scope="col">Quem</th><th scope="col">Ação</th><th scope="col" class="hide-sm">Detalhes</th><th scope="col" class="hide-sm">IP</th></tr></thead>
          <tbody>${res.items.map(
            (l) => html`<tr>
              <td class="num" style="white-space:nowrap">${dateTimeBR(l.created_at)}</td>
              <td>${l.user_name ? html`<strong>${l.user_name}</strong>` : ''}<div class="cell-sub">${l.user_email || 'Sistema'}</div></td>
              <td><span class="audit-action"><span class="audit-dot ${auditTone(l.action)}"></span>${actionLabel(l.action)}</span></td>
              <td class="hide-sm"><div class="audit-details" title="${l.details ? detailsText(l.details) : ''}">${l.details ? detailsText(l.details) : '—'}</div></td>
              <td class="hide-sm cell-sub num">${l.ip || '—'}</td>
            </tr>`
          )}</tbody></table>`
        : emptyState({ icon: 'list', title: 'Nenhum registro encontrado', text: 'Ajuste os filtros de período, usuário ou tipo de ação.' })
    );
    $('#auditFoot', view).innerHTML = String(html`<span>${plural(res.total, 'registro', 'registros')}, página ${res.page} de ${res.pages}</span>
      <div class="pager">
        <button type="button" class="btn btn--sm" data-action="page" data-page="${res.page - 1}" ${res.page <= 1 ? raw('disabled') : ''}>${icon('chevronLeft', 'icon--sm')} Anterior</button>
        <button type="button" class="btn btn--sm" data-action="page" data-page="${res.page + 1}" ${res.page >= res.pages ? raw('disabled') : ''}>Próxima ${icon('chevronRight', 'icon--sm')}</button>
      </div>`);
  }
  const reload = (resetPage = true) => {
    if (resetPage) state.page = 1;
    load().catch(toastError);
  };

  bindActions(
    view,
    {
      export: () => exportCsv('auditoria', { action: state.action, user_id: state.user_id, from: state.from, to: state.to, search: state.search }),
      page: (e, el) => {
        state.page = Number(el.dataset.page);
        reload(false);
        view.scrollIntoView({ block: 'start' });
      },
      search: debounce((e, el) => ((state.search = el.value.trim()), reload()), 300),
      action: (e, el) => ((state.action = el.value), reload()),
      user: (e, el) => ((state.user_id = el.value), reload()),
      from: (e, el) => ((state.from = el.value), reload()),
      to: (e, el) => ((state.to = el.value), reload()),
    },
    { events: ['click', 'input'] }
  );
  await load();
}

// ===========================================================================
// Segurança
// ===========================================================================
async function renderSecurity(view, ctx) {
  const s = await api.get('/api/admin/security');
  if (!ctx.isCurrent()) return;
  const locked = s.attempts.filter((a) => a.locked);
  setLockBadge(locked.length);

  view.innerHTML = String(html`
    <div class="page-head">
      <p class="page-head__sub">Proteção contra força bruta: após ${s.policy.max_login_attempts} senhas erradas seguidas, o acesso daquele e-mail e rede fica bloqueado por ${s.policy.lockout_minutes} min.</p>
      <div class="page-head__actions"><a class="btn" href="#/configuracoes">${icon('sliders')} Ajustar política</a><button type="button" class="btn" data-action="reload">${icon('refresh')} Atualizar</button></div>
    </div>
    <div class="stack">
      ${s.policy.maintenance_mode ? html`<div class="inline-alert">${icon('power')}<span>Modo manutenção ativo: apenas administradores conseguem entrar.</span></div>` : ''}
      <div class="kpis" style="--kpi-cols:4">
        <div class="kpi"><span class="kpi__label">${icon('check', 'icon--sm')}Logins nas últimas 24 h</span><span class="kpi__value">${s.stats.logins}</span></div>
        <div class="kpi"><span class="kpi__label">${icon('alert', 'icon--sm')}Falhas nas últimas 24 h</span><span class="kpi__value">${s.stats.failed}</span></div>
        <div class="kpi"><span class="kpi__label">${icon('lock', 'icon--sm')}Bloqueios nas últimas 24 h</span><span class="kpi__value">${s.stats.locks}</span></div>
        <div class="kpi"><span class="kpi__label">${icon('shield', 'icon--sm')}Bloqueados agora</span><span class="kpi__value">${locked.length}</span><span class="kpi__note">Sessões duram ${s.policy.session_hours} h (ou ${s.policy.remember_days} dias com "manter conectado")</span></div>
      </div>

      <section class="panel" aria-labelledby="att-title">
        <header class="panel__head"><h2 class="panel__title" id="att-title">Tentativas monitoradas</h2><span class="panel__hint">Bloqueios ativos e falhas da última hora</span></header>
        <div class="panel__body--flush table-wrap">
          ${s.attempts.length
            ? html`<table class="table"><thead><tr><th scope="col">E-mail</th><th scope="col">Rede (IP)</th><th scope="col" class="t-right">Falhas seguidas</th><th scope="col">Situação</th><th scope="col"><span class="sr-only">Ações</span></th></tr></thead>
              <tbody>${s.attempts.map(
                (a) => html`<tr data-email="${a.email}" data-ip="${a.ip}">
                  <td><strong>${a.email}</strong></td><td class="num cell-sub">${a.ip}</td><td class="t-right num">${a.failures}</td>
                  <td>${a.locked ? html`<span class="badge badge--danger">Bloqueado até ${timeHM(a.lockedUntil)}</span>` : html`<span class="badge badge--warning">Em observação</span>`}</td>
                  <td><div class="row-actions"><button type="button" class="btn btn--sm" data-action="unlock">${icon('unlock', 'icon--sm')} ${a.locked ? 'Desbloquear' : 'Zerar falhas'}</button></div></td>
                </tr>`
              )}</tbody></table>`
            : emptyState({ icon: 'shield', title: 'Nenhuma tentativa suspeita agora', text: 'Contas com senhas erradas recentes ou bloqueadas aparecem aqui, com a opção de desbloquear.' })}
        </div>
      </section>

      <div class="grid grid--3-2">
        <section class="panel" aria-labelledby="fail-title">
          <header class="panel__head"><h2 class="panel__title" id="fail-title">Falhas e recusas recentes</h2><a class="panel__link" href="#/auditoria?action=auth.">Ver na auditoria</a></header>
          <div class="panel__body--flush table-wrap">
            ${s.failures.length
              ? html`<table class="table"><thead><tr><th scope="col">Quando</th><th scope="col">E-mail usado</th><th scope="col">Motivo</th><th scope="col" class="hide-sm">IP</th></tr></thead>
                <tbody>${s.failures.map((f) => {
                  let reason = actionLabel(f.action);
                  try {
                    reason = JSON.parse(f.details).motivo || reason;
                  } catch {
                    /* sem detalhes */
                  }
                  return html`<tr><td class="num" style="white-space:nowrap">${dateTimeBR(f.created_at)}</td><td>${f.user_email}</td>
                    <td><span class="audit-action"><span class="audit-dot audit-dot--danger"></span>${capitalize(reason)}</span></td><td class="hide-sm num cell-sub">${f.ip}</td></tr>`;
                })}</tbody></table>`
              : html`<p class="muted" style="padding:0 20px 20px">Nenhuma falha registrada.</p>`}
          </div>
        </section>
        <section class="panel" aria-labelledby="log-title">
          <header class="panel__head"><h2 class="panel__title" id="log-title">Últimos acessos</h2></header>
          <div class="panel__body--flush">
            <ul class="mini-list">${s.recentLogins.map(
              (u) => html`<li>${avatar(u.name, 'sm')}<div><strong>${u.name}</strong><small>${ROLE_LABEL[u.role]}</small></div><small class="cell-sub">${relative(u.last_login_at)}</small></li>`
            )}</ul>
          </div>
        </section>
      </div>
    </div>`);

  bindActions(view, {
    reload: refresh,
    unlock: async (e, el) => {
      const row = el.closest('tr');
      try {
        await api.post('/api/admin/security/unlock', { email: row.dataset.email, ip: row.dataset.ip });
        toast(`Acesso de ${row.dataset.email} liberado.`);
        refresh();
      } catch (err) {
        toastError(err);
      }
    },
  });
}

// ===========================================================================
// Configurações
// ===========================================================================
async function renderSettings(view, ctx) {
  const { settings: s } = await api.get('/api/admin/settings');
  if (!ctx.isCurrent()) return;

  const numberField = (name, label, hint, value, { min, max, suffix, step = 1 }) => html`<div class="setting">
      <div class="setting__text"><strong><label for="st-${name}">${label}</label></strong><p>${hint}</p></div>
      <div class="input-suffix"><input class="input num" id="st-${name}" name="${name}" type="number" min="${min}" max="${max}" step="${step}" value="${value}" required><span>${suffix}</span></div>
    </div>`;

  view.innerHTML = String(html`
    <form class="stack" id="settingsForm">
      <section class="panel" aria-labelledby="st-company">
        <header class="panel__head"><h2 class="panel__title" id="st-company">Empresa</h2></header>
        <div class="settings">
          <div class="setting">
            <div class="setting__text"><strong><label for="st-company_name">Nome exibido no sistema</label></strong><p>Aparece no menu lateral de todos os usuários.</p></div>
            <input class="input" id="st-company_name" name="company_name" required minlength="2" maxlength="80" value="${s.company_name}">
          </div>
          ${numberField('default_monthly_goal', 'Meta mensal padrão', 'Sugestão ao cadastrar novos colaboradores.', s.default_monthly_goal, { min: 0, max: 100000000, suffix: 'reais', step: 1000 })}
        </div>
      </section>

      <section class="panel" aria-labelledby="st-access">
        <header class="panel__head"><h2 class="panel__title" id="st-access">Sessão e proteção de acesso</h2></header>
        <div class="settings">
          ${numberField('session_hours', 'Duração da sessão', 'Tempo até pedir login de novo, sem "manter conectado".', s.session_hours, { min: 1, max: 24, suffix: 'horas' })}
          ${numberField('remember_days', 'Manter conectado', 'Validade da sessão quando a pessoa marca "manter conectado".', s.remember_days, { min: 1, max: 90, suffix: 'dias' })}
          ${numberField('max_login_attempts', 'Tentativas antes do bloqueio', 'Senhas erradas seguidas para bloquear o acesso temporariamente.', s.max_login_attempts, { min: 3, max: 20, suffix: 'tentativas' })}
          ${numberField('lockout_minutes', 'Tempo de bloqueio', 'Quanto tempo o acesso fica bloqueado após exceder as tentativas.', s.lockout_minutes, { min: 1, max: 1440, suffix: 'min' })}
          <div class="setting">
            <div class="setting__text"><strong><label for="st-maintenance">Modo manutenção</label></strong><p>Impede o login de colaboradores e encerra as sessões deles. Administradores continuam com acesso.</p></div>
            <label class="switch"><input type="checkbox" id="st-maintenance" name="maintenance_mode" ${s.maintenance_mode ? raw('checked') : ''}><span>${s.maintenance_mode ? 'Ativado' : 'Desativado'}</span></label>
          </div>
        </div>
      </section>

      <div class="page-head__actions" style="justify-content:flex-end">
        <div class="form-error" id="settingsError" role="alert" hidden></div>
        <button type="submit" class="btn btn--primary" id="settingsSave">Salvar configurações</button>
      </div>
    </form>

    <section class="panel" style="margin-top:28px" aria-labelledby="st-danger">
      <header class="panel__head"><h2 class="panel__title" id="st-danger">Dados de demonstração</h2></header>
      <div class="settings">
        <div class="setting setting--danger">
          <div class="setting__text"><strong>Restaurar dados de demonstração</strong><p>Apaga todos os clientes, oportunidades, tarefas, usuários criados e registros de auditoria, e recria a base fictícia original.</p></div>
          <button type="button" class="btn btn--danger" data-action="reset">${icon('database')} Restaurar dados</button>
        </div>
      </div>
    </section>`);

  const form = $('#settingsForm', view);
  form.querySelector('[name=maintenance_mode]').addEventListener('change', (e) => (e.target.nextElementSibling.textContent = e.target.checked ? 'Ativado' : 'Desativado'));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#settingsSave', view);
    const errorBox = $('#settingsError', view);
    errorBox.hidden = true;
    btn.disabled = true;
    btn.classList.add('is-busy');
    const fd = new FormData(form);
    const payload = Object.fromEntries([...fd.entries()].filter(([k]) => k !== 'maintenance_mode'));
    for (const k of ['default_monthly_goal', 'session_hours', 'remember_days', 'max_login_attempts', 'lockout_minutes']) payload[k] = Number(payload[k]);
    payload.maintenance_mode = form.querySelector('[name=maintenance_mode]').checked;
    try {
      const res = await api.put('/api/admin/settings', payload);
      session.company = res.settings.company_name;
      $('#companyName').textContent = res.settings.company_name;
      $('#maintenanceBanner').hidden = !res.settings.maintenance_mode;
      toast('Configurações salvas.');
    } catch (err) {
      errorBox.innerHTML = String(html`${icon('alert')}<span>${err.message}</span>`);
      errorBox.hidden = false;
    } finally {
      btn.disabled = false;
      btn.classList.remove('is-busy');
    }
  });

  bindActions(view, {
    reset: async () => {
      const ok = await confirmDialog({
        title: 'Restaurar dados de demonstração?',
        message: 'Tudo o que foi criado ou alterado será perdido e a base fictícia original será recriada. Essa ação não pode ser desfeita.',
        confirmLabel: 'Apagar e restaurar',
        requireText: 'RESTAURAR',
      });
      if (!ok) return;
      try {
        const res = await api.post('/api/admin/reset-demo', { confirm: 'RESTAURAR' });
        if (res.relogin) window.location.assign('/login');
        else {
          toast('Dados de demonstração restaurados.');
          setTimeout(() => window.location.assign('/admin#/visao'), 600);
        }
      } catch (err) {
        toastError(err);
      }
    },
  });
}

// ===========================================================================
// Inicialização
// ===========================================================================
bootShell({
  area: 'admin',
  defaultRoute: 'visao',
  routes: {
    visao: { title: 'Visão geral', render: renderOverview },
    oportunidades: { title: 'Oportunidades', render: renderDeals },
    clientes: { title: 'Clientes', render: renderClients },
    tarefas: { title: 'Tarefas da equipe', render: renderTasks },
    usuarios: { title: 'Usuários e permissões', render: renderUsers },
    auditoria: { title: 'Auditoria', render: renderAudit },
    seguranca: { title: 'Segurança', render: renderSecurity },
    configuracoes: { title: 'Configurações', render: renderSettings },
  },
});
