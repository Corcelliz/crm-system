import { api, qs } from './api.js';
import { html, raw, on } from './dom.js';
import { icon, ACTIVITY_ICON } from './icons.js';
import { money, moneyShort, dateBR, dayMonth, relative, dueInfo, todayLocal, addDays } from './format.js';
import { formModal, drawer, toast, toastError, confirmDialog, modal, skeleton, errorState, readForm, setBusy } from './ui.js';
import { avatar, session } from './shell.js';

// ---------------------------------------------------------------------------
// Vocabulário do CRM (espelha o servidor)
// ---------------------------------------------------------------------------
export const STAGES = [
  { id: 'prospeccao', label: 'Prospecção' },
  { id: 'qualificacao', label: 'Qualificação' },
  { id: 'proposta', label: 'Proposta' },
  { id: 'negociacao', label: 'Negociação' },
  { id: 'ganho', label: 'Ganho' },
  { id: 'perdido', label: 'Perdido' },
];
export const STAGE_LABEL = Object.fromEntries(STAGES.map((s) => [s.id, s.label]));
export const OPEN_STAGES = ['prospeccao', 'qualificacao', 'proposta', 'negociacao'];

export const CLIENT_STATUS = {
  lead: { label: 'Lead', tone: 'info' },
  prospect: { label: 'Prospect', tone: 'warning' },
  cliente: { label: 'Cliente', tone: 'success' },
  inativo: { label: 'Inativo', tone: '' },
};
export const PRIORITY = {
  alta: { label: 'Alta', tone: 'danger' },
  media: { label: 'Média', tone: 'warning' },
  baixa: { label: 'Baixa', tone: '' },
};
export const ACTIVITY_LABEL = { ligacao: 'Ligação', email: 'E-mail', reuniao: 'Reunião', whatsapp: 'WhatsApp', nota: 'Nota' };
export const SEGMENTS = ['Agronegócio', 'Alimentos', 'Construção', 'Educação', 'Energia', 'Indústria', 'Logística', 'Saúde', 'Serviços', 'Tecnologia', 'Varejo'];
export const SOURCES = ['Indicação', 'Site', 'LinkedIn', 'Evento', 'Prospecção ativa', 'Parceiro'];
export const UFS = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'];

export const isAdmin = () => session.user?.role === 'admin';

export const clientBadge = (status) => {
  const s = CLIENT_STATUS[status] || { label: status, tone: '' };
  return html`<span class="badge ${s.tone ? `badge--${s.tone}` : ''}">${s.label}</span>`;
};
export const stageBadge = (stage) => html`<span class="stage-tag stage-tag--${stage}">${STAGE_LABEL[stage] || stage}</span>`;
export const priorityBadge = (p) => {
  const s = PRIORITY[p] || PRIORITY.media;
  return html`<span class="badge ${s.tone ? `badge--${s.tone}` : ''}">${s.label}</span>`;
};
export function dueTag(date, done) {
  const d = dueInfo(date, done);
  return html`<span class="due due--${d.tone}">${d.tone === 'overdue' ? icon('clock', 'icon--sm') : ''}${d.label}</span>`;
}

const options = (list, selected, { placeholder } = {}) =>
  html`${placeholder !== undefined ? html`<option value="">${placeholder}</option>` : ''}${list.map((o) => {
    const [value, label] = Array.isArray(o) ? o : typeof o === 'object' ? [o.id, o.label ?? o.name] : [o, o];
    return html`<option value="${value}" ${String(value) === String(selected ?? '') ? raw('selected') : ''}>${label}</option>`;
  })}`;

// ---------------------------------------------------------------------------
// Listas auxiliares (cache curto)
// ---------------------------------------------------------------------------
let ownersCache = null;
export async function getOwners() {
  if (!isAdmin()) return [];
  if (!ownersCache) {
    const { users } = await api.get('/api/admin/users');
    ownersCache = users.filter((u) => u.status === 'ativo');
  }
  return ownersCache;
}
export const invalidateOwners = () => (ownersCache = null);

export async function getClientOptions(scopeAll) {
  const { clients } = await api.get(`/api/clients${qs({ scope: scopeAll ? 'all' : '' })}`);
  return clients.sort((a, b) => a.company.localeCompare(b.company, 'pt-BR'));
}

const ownerField = (owners, selected, id = 'owner') =>
  owners.length
    ? html`<div class="field"><label class="field__label" for="${id}">Responsável</label>
        <select class="select" id="${id}" name="owner_id">${options(owners.map((u) => [u.id, `${u.name}${u.role === 'admin' ? ' (admin)' : ''}`]), selected ?? session.user.id)}</select></div>`
    : '';

// ---------------------------------------------------------------------------
// Formulário de cliente
// ---------------------------------------------------------------------------
export async function openClientForm({ client = null, scopeAll = false, onSaved } = {}) {
  const owners = scopeAll ? await getOwners() : [];
  const c = client || { status: 'lead' };
  formModal({
    title: client ? 'Editar cliente' : 'Novo cliente',
    description: client ? client.company : 'Cadastre a empresa e a pessoa de contato principal.',
    size: 'lg',
    submitLabel: client ? 'Salvar alterações' : 'Cadastrar cliente',
    fields: html`
      <div class="form__grid">
        <div class="field field--full"><label class="field__label" for="cf-company">Empresa</label>
          <input class="input" id="cf-company" name="company" required minlength="2" maxlength="120" value="${c.company || ''}" placeholder="Razão social ou nome fantasia"></div>
        <div class="field"><label class="field__label" for="cf-contact">Contato principal</label>
          <input class="input" id="cf-contact" name="contact_name" required minlength="2" maxlength="120" value="${c.contact_name || ''}"></div>
        <div class="field"><label class="field__label" for="cf-role">Cargo <small>(opcional)</small></label>
          <input class="input" id="cf-role" name="contact_role" maxlength="80" value="${c.contact_role || ''}" placeholder="Ex.: Gerente de compras"></div>
        <div class="field"><label class="field__label" for="cf-email">E-mail</label>
          <input class="input" id="cf-email" name="email" type="email" maxlength="160" value="${c.email || ''}" placeholder="contato@empresa.com.br"></div>
        <div class="field"><label class="field__label" for="cf-phone">Telefone</label>
          <input class="input" id="cf-phone" name="phone" maxlength="30" value="${c.phone || ''}" placeholder="(11) 99999-0000"></div>
        <div class="field"><label class="field__label" for="cf-segment">Segmento</label>
          <select class="select" id="cf-segment" name="segment">${options(SEGMENTS, c.segment, { placeholder: 'Selecione' })}</select></div>
        <div class="field"><label class="field__label" for="cf-source">Origem</label>
          <select class="select" id="cf-source" name="source">${options(SOURCES, c.source, { placeholder: 'Selecione' })}</select></div>
        <div class="field"><label class="field__label" for="cf-city">Cidade</label>
          <input class="input" id="cf-city" name="city" maxlength="80" value="${c.city || ''}"></div>
        <div class="field"><label class="field__label" for="cf-state">UF</label>
          <select class="select" id="cf-state" name="state">${options(UFS, c.state, { placeholder: '—' })}</select></div>
        <div class="field"><label class="field__label" for="cf-status">Status</label>
          <select class="select" id="cf-status" name="status">${options(Object.entries(CLIENT_STATUS).map(([k, v]) => [k, v.label]), c.status)}</select></div>
        ${ownerField(owners, c.owner_id, 'cf-owner')}
        <div class="field field--full"><label class="field__label" for="cf-notes">Observações</label>
          <textarea class="textarea" id="cf-notes" name="notes" maxlength="2000" placeholder="Preferências de contato, contexto da conta…">${c.notes || ''}</textarea></div>
      </div>
      ${client && owners.length ? html`<p class="field__hint">Ao trocar o responsável, as oportunidades abertas deste cliente passam para a nova pessoa.</p>` : ''}`,
    onSubmit: async (data) => {
      const res = client ? await api.put(`/api/clients/${client.id}`, data) : await api.post('/api/clients', data);
      toast(client ? 'Cliente atualizado.' : `${res.client.company} cadastrado.`);
      onSaved?.(res.client);
    },
  });
}

// ---------------------------------------------------------------------------
// Formulário de oportunidade
// ---------------------------------------------------------------------------
export async function openDealForm({ deal = null, clientId = null, scopeAll = false, onSaved } = {}) {
  const [clients, owners] = await Promise.all([getClientOptions(scopeAll), scopeAll ? getOwners() : []]);
  if (!clients.length) {
    toast('Cadastre um cliente antes de criar uma oportunidade.', { tone: 'info' });
    return;
  }
  const d = deal || { stage: 'prospeccao', client_id: clientId, expected_close: addDays(todayLocal(), 30) };
  formModal({
    title: deal ? 'Editar oportunidade' : 'Nova oportunidade',
    description: deal ? `${deal.client_company}` : 'Registre um negócio em andamento com um cliente da carteira.',
    size: 'lg',
    submitLabel: deal ? 'Salvar alterações' : 'Criar oportunidade',
    fields: html`
      <div class="form__grid">
        <div class="field field--full"><label class="field__label" for="df-title">Título</label>
          <input class="input" id="df-title" name="title" required minlength="3" maxlength="140" value="${d.title || ''}" placeholder="Ex.: Licenças anuais para 50 usuários"></div>
        <div class="field field--full"><label class="field__label" for="df-client">Cliente</label>
          <select class="select" id="df-client" name="client_id" required>${options(
            clients.map((c) => [c.id, scopeAll && c.owner_name ? `${c.company} (${c.owner_name})` : c.company]),
            d.client_id,
            { placeholder: 'Selecione o cliente' }
          )}</select></div>
        <div class="field"><label class="field__label" for="df-value">Valor (R$)</label>
          <input class="input num" id="df-value" name="value" type="number" min="0" step="100" required value="${d.value ?? ''}" placeholder="0"></div>
        <div class="field"><label class="field__label" for="df-close">Previsão de fechamento</label>
          <input class="input" id="df-close" name="expected_close" type="date" value="${d.expected_close || ''}"></div>
        <div class="field"><label class="field__label" for="df-stage">Estágio</label>
          <select class="select" id="df-stage" name="stage">${options(STAGES, d.stage)}</select></div>
        <div class="field"><label class="field__label" for="df-prob">Probabilidade (%)</label>
          <input class="input num" id="df-prob" name="probability" type="number" min="0" max="100" step="5" value="${d.probability ?? ''}" placeholder="Automática pelo estágio"></div>
        ${ownerField(owners, d.owner_id, 'df-owner')}
        <div class="field field--full" data-lost ${d.stage === 'perdido' ? '' : raw('hidden')}><label class="field__label" for="df-lost">Motivo da perda</label>
          <input class="input" id="df-lost" name="lost_reason" maxlength="300" value="${d.lost_reason || ''}" placeholder="Ex.: preço acima do orçamento"></div>
      </div>`,
    onOpen: ({ form }) => {
      const stage = form.querySelector('[name=stage]');
      const prob = form.querySelector('[name=probability]');
      stage.addEventListener('change', () => {
        form.querySelector('[data-lost]').hidden = stage.value !== 'perdido';
        prob.value = '';
      });
    },
    onSubmit: async (data) => {
      const payload = { ...data, value: Number(data.value), probability: data.probability === '' ? null : Number(data.probability) };
      const res = deal ? await api.put(`/api/deals/${deal.id}`, payload) : await api.post('/api/deals', payload);
      toast(deal ? 'Oportunidade atualizada.' : 'Oportunidade criada.');
      onSaved?.(res.deal);
    },
  });
}

/** Pede o motivo ao mover para "Perdido". Retorna string ('' se pulado) ou null se cancelado. */
export function askLostReason(deal) {
  return new Promise((resolve) => {
    let done = false;
    formModal({
      title: 'Marcar como perdida',
      description: deal.title,
      size: 'sm',
      submitLabel: 'Marcar como perdida',
      tone: 'danger',
      fields: html`<div class="field"><label class="field__label" for="lr">Motivo da perda <small>(opcional)</small></label>
        <select class="select" id="lr" name="lost_reason">${options(
          ['Preço acima do orçamento', 'Escolheu um concorrente', 'Projeto adiado', 'Sem retorno do decisor', 'Prioridade interna mudou', 'Outro'],
          '',
          { placeholder: 'Selecione' }
        )}</select></div>`,
      onSubmit: (data) => {
        done = true;
        resolve(data.lost_reason || '');
      },
    }).dialog.addEventListener('close', () => !done && resolve(null));
  });
}

/** Move uma oportunidade de estágio, pedindo o motivo quando for perda. */
export async function moveDeal(deal, stage) {
  let lost_reason;
  if (stage === 'perdido') {
    lost_reason = await askLostReason(deal);
    if (lost_reason === null) return null;
  }
  const res = await api.patch(`/api/deals/${deal.id}/stage`, { stage, lost_reason });
  if (stage === 'ganho') toast(`${money(deal.value)} somados aos seus ganhos do mês.`, { title: 'Negócio ganho', tone: 'success' });
  else toast(`Movida para ${STAGE_LABEL[stage]}.`, { tone: 'info', duration: 2500 });
  return res.deal;
}

// ---------------------------------------------------------------------------
// Formulário de tarefa
// ---------------------------------------------------------------------------
export async function openTaskForm({ task = null, clientId = null, scopeAll = false, onSaved } = {}) {
  const [clients, owners] = await Promise.all([getClientOptions(scopeAll), scopeAll ? getOwners() : []]);
  const t = task || { priority: 'media', due_date: todayLocal(), client_id: clientId };
  formModal({
    title: task ? 'Editar tarefa' : 'Nova tarefa',
    size: 'md',
    submitLabel: task ? 'Salvar alterações' : 'Criar tarefa',
    fields: html`
      <div class="field"><label class="field__label" for="tf-title">O que precisa ser feito</label>
        <input class="input" id="tf-title" name="title" required minlength="3" maxlength="160" value="${t.title || ''}" placeholder="Ex.: Ligar para confirmar a reunião"></div>
      <div class="form__grid">
        <div class="field"><label class="field__label" for="tf-due">Prazo</label>
          <input class="input" id="tf-due" name="due_date" type="date" value="${t.due_date || ''}"></div>
        <div class="field"><label class="field__label" for="tf-priority">Prioridade</label>
          <select class="select" id="tf-priority" name="priority">${options(Object.entries(PRIORITY).map(([k, v]) => [k, v.label]), t.priority)}</select></div>
        <div class="field field--full"><label class="field__label" for="tf-client">Cliente <small>(opcional)</small></label>
          <select class="select" id="tf-client" name="client_id">${options(clients.map((c) => [c.id, c.company]), t.client_id, { placeholder: 'Sem cliente vinculado' })}</select></div>
        ${owners.length ? html`<div class="field field--full">${ownerField(owners, t.owner_id, 'tf-owner')}</div>` : ''}
      </div>
      <div class="field"><label class="field__label" for="tf-desc">Detalhes <small>(opcional)</small></label>
        <textarea class="textarea" id="tf-desc" name="description" maxlength="2000">${t.description || ''}</textarea></div>`,
    onSubmit: async (data) => {
      const res = task ? await api.put(`/api/tasks/${task.id}`, data) : await api.post('/api/tasks', data);
      toast(task ? 'Tarefa atualizada.' : 'Tarefa criada.');
      onSaved?.(res.task);
    },
  });
}

export async function toggleTask(id) {
  const { task } = await api.patch(`/api/tasks/${id}/toggle`);
  toast(task.status === 'concluida' ? 'Tarefa concluída.' : 'Tarefa reaberta.', { tone: task.status === 'concluida' ? 'success' : 'info', duration: 2200 });
  return task;
}

/** Linha de tarefa reutilizável (Meu dia, Tarefas, ficha do cliente). */
export function taskRow(t, { showOwner = false, showClient = true, actions = true } = {}) {
  const done = t.status === 'concluida';
  return html`<li class="task ${done ? 'is-done' : ''}" data-task-id="${t.id}">
    <button type="button" class="task__check" data-action="toggle-task" aria-pressed="${done}" aria-label="${done ? 'Reabrir' : 'Concluir'} tarefa: ${t.title}">${icon('check', 'icon--sm')}</button>
    <div class="task__main">
      <span class="task__title">${t.title}</span>
      <span class="task__meta">
        ${dueTag(t.due_date, done)}
        ${showClient && t.client_company ? html`<span class="task__client">${icon('building', 'icon--sm')}${t.client_company}</span>` : ''}
        ${showOwner && t.owner_name ? html`<span class="task__client">${icon('user', 'icon--sm')}${t.owner_name}</span>` : ''}
      </span>
    </div>
    ${t.priority === 'alta' && !done ? priorityBadge('alta') : ''}
    ${actions ? html`<button type="button" class="btn btn--ghost btn--icon btn--sm" data-action="task-menu" aria-label="Ações da tarefa" aria-haspopup="menu">${icon('more')}</button>` : ''}
  </li>`;
}

// ---------------------------------------------------------------------------
// Ficha do cliente (gaveta lateral)
// ---------------------------------------------------------------------------
export async function openClientDrawer(clientId, { scopeAll = false, onChange } = {}) {
  const ctx = drawer({ title: 'Cliente', body: skeleton(10), size: 'lg' });
  let changed = false;
  ctx.dialog.addEventListener('close', () => changed && onChange?.());

  async function load() {
    try {
      const data = await api.get(`/api/clients/${clientId}`);
      paint(data);
    } catch (err) {
      ctx.setBody(errorState(err));
    }
  }

  function paint({ client: c, deals, activities, tasks }) {
    ctx.$('.drawer__title').textContent = c.company;
    const open = deals.filter((d) => OPEN_STAGES.includes(d.stage));
    const won = deals.filter((d) => d.stage === 'ganho');
    ctx.setBody(html`
      <div class="sheet">
        <div class="sheet__top">
          ${clientBadge(c.status)}
          ${c.segment ? html`<span class="badge badge--plain">${c.segment}</span>` : ''}
          <span class="sheet__owner">${avatar(c.owner_name || '?', 'sm')} ${c.owner_name || 'Sem responsável'}</span>
          <span class="spacer"></span>
          <button type="button" class="btn btn--sm" data-action="edit-client">${icon('edit', 'icon--sm')} Editar</button>
        </div>

        <dl class="sheet__facts">
          <div><dt>Contato</dt><dd>${c.contact_name}${c.contact_role ? html`<small>${c.contact_role}</small>` : ''}</dd></div>
          <div><dt>E-mail</dt><dd>${c.email ? html`<a href="mailto:${c.email}">${c.email}</a>` : '—'}</dd></div>
          <div><dt>Telefone</dt><dd>${c.phone ? html`<a href="tel:${c.phone.replace(/[^\d+]/g, '')}">${c.phone}</a>` : '—'}</dd></div>
          <div><dt>Local</dt><dd>${[c.city, c.state].filter(Boolean).join(', ') || '—'}</dd></div>
          <div><dt>Origem</dt><dd>${c.source || '—'}</dd></div>
          <div><dt>Cliente desde</dt><dd>${dateBR(c.created_at)}</dd></div>
        </dl>
        ${c.notes ? html`<p class="sheet__notes">${c.notes}</p>` : ''}

        <div class="sheet__numbers">
          <div><span>Em aberto</span><strong class="num">${money(open.reduce((s, d) => s + d.value, 0))}</strong><small>${open.length} oportunidade${open.length === 1 ? '' : 's'}</small></div>
          <div><span>Já faturado</span><strong class="num">${money(won.reduce((s, d) => s + d.value, 0))}</strong><small>${won.length} negócio${won.length === 1 ? '' : 's'} ganho${won.length === 1 ? '' : 's'}</small></div>
        </div>

        <section class="sheet__section">
          <header><h3>Oportunidades</h3><button type="button" class="btn btn--ghost btn--sm" data-action="new-deal">${icon('plus', 'icon--sm')} Nova</button></header>
          ${deals.length
            ? html`<ul class="mini-list">${deals.map(
                (d) => html`<li><div><strong>${d.title}</strong><small>${OPEN_STAGES.includes(d.stage) ? `Previsão ${dayMonth(d.expected_close)}` : `Fechada em ${dateBR(d.closed_at)}`}${d.lost_reason ? `, ${d.lost_reason}` : ''}</small></div>
                  ${stageBadge(d.stage)}<span class="num mini-list__value">${moneyShort(d.value)}</span></li>`
              )}</ul>`
            : html`<p class="muted">Nenhuma oportunidade com este cliente ainda.</p>`}
        </section>

        <section class="sheet__section">
          <header><h3>Tarefas</h3><button type="button" class="btn btn--ghost btn--sm" data-action="new-task">${icon('plus', 'icon--sm')} Nova</button></header>
          ${tasks.length ? html`<ul class="tasks tasks--compact">${tasks.map((t) => taskRow(t, { showClient: false, actions: false }))}</ul>` : html`<p class="muted">Nenhuma tarefa vinculada.</p>`}
        </section>

        <section class="sheet__section">
          <header><h3>Histórico de interações</h3></header>
          <form class="composer" data-composer>
            <div class="composer__types" role="radiogroup" aria-label="Tipo de interação">
              ${Object.entries(ACTIVITY_LABEL).map(
                ([k, label], i) => html`<label class="chip-radio"><input type="radio" name="type" value="${k}" ${i === 0 ? raw('checked') : ''}><span>${icon(ACTIVITY_ICON[k], 'icon--sm')}${label}</span></label>`
              )}
            </div>
            <label class="sr-only" for="composer-text">Descrição da interação</label>
            <textarea class="textarea" id="composer-text" name="description" required minlength="3" maxlength="2000" placeholder="O que foi conversado? Próximos passos?"></textarea>
            <div class="composer__foot"><button type="submit" class="btn btn--primary btn--sm">Registrar interação</button></div>
          </form>
          ${activities.length
            ? html`<ol class="timeline">${activities.map(
                (a) => html`<li class="timeline__item timeline__item--${a.type}">
                  <span class="timeline__icon">${icon(ACTIVITY_ICON[a.type], 'icon--sm')}</span>
                  <div><p>${a.description}</p><small>${ACTIVITY_LABEL[a.type]}, ${relative(a.created_at)}${a.user_name ? ` por ${a.user_name}` : ''}</small></div>
                </li>`
              )}</ol>`
            : html`<p class="muted">Nenhuma interação registrada.</p>`}
        </section>
      </div>`);

    ctx.$('[data-action=edit-client]').addEventListener('click', () =>
      openClientForm({ client: c, scopeAll, onSaved: () => ((changed = true), load()) })
    );
    ctx.$('[data-action=new-deal]').addEventListener('click', () =>
      openDealForm({ clientId: c.id, scopeAll, onSaved: () => ((changed = true), load()) })
    );
    ctx.$('[data-action=new-task]').addEventListener('click', () =>
      openTaskForm({ clientId: c.id, scopeAll, onSaved: () => ((changed = true), load()) })
    );
    const body = ctx.$('.drawer__body');
    if (!body.dataset.wired) {
      body.dataset.wired = '1';
      on(body, 'click', '[data-action=toggle-task]', async (e, btn) => {
        try {
          await toggleTask(btn.closest('[data-task-id]').dataset.taskId);
          changed = true;
          load();
        } catch (err) {
          toastError(err);
        }
      });
      on(body, 'submit', '[data-composer]', async (e, form) => {
        e.preventDefault();
        const submit = form.querySelector('[type=submit]');
        setBusy(submit, true);
        try {
          await api.post('/api/activities', { ...readForm(form), client_id: c.id });
          toast('Interação registrada.');
          changed = true;
          load();
        } catch (err) {
          toastError(err);
        } finally {
          setBusy(submit, false);
        }
      });
    }
  }

  load();
  return ctx;
}

// ---------------------------------------------------------------------------
// Utilitário: modal de senha temporária (admin)
// ---------------------------------------------------------------------------
export function showTempPassword(name, password) {
  const ctx = modal({
    title: 'Senha temporária gerada',
    size: 'sm',
    body: html`<p class="modal__text">Envie esta senha para <strong>${name}</strong> por um canal seguro. No primeiro acesso, o sistema pede que a pessoa crie uma senha pessoal.</p>
      <div class="secret"><code class="num">${password}</code><button type="button" class="btn btn--sm" data-copy>${icon('note', 'icon--sm')} Copiar</button></div>
      <p class="field__hint">Ela não será exibida de novo.</p>`,
    footer: html`<span class="spacer"></span><button type="button" class="btn btn--primary" data-close>Concluir</button>`,
  });
  ctx.$('[data-copy]').addEventListener('click', async (e) => {
    try {
      await navigator.clipboard.writeText(password);
      e.currentTarget.textContent = 'Copiada';
    } catch {
      toast('Não foi possível copiar. Selecione e copie manualmente.', { tone: 'warning' });
    }
  });
}

export { confirmDialog };
