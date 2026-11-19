import { api } from './api.js';
import { $, $$, html } from './dom.js';
import { icon } from './icons.js';
import { initials, avatarColor } from './format.js';
import { bindThemeToggle } from './theme.js';
import { toast, toastError, openMenu, formModal, skeleton, errorState } from './ui.js';

/** Estado compartilhado da sessão no navegador. */
export const session = { user: null, company: '' };

let routes = {};
let defaultRoute = '';
let renderToken = 0;

export function avatar(name, size = '') {
  return html`<span class="avatar ${size ? `avatar--${size}` : ''}" style="--av:${avatarColor(name)}" aria-hidden="true">${initials(name)}</span>`;
}

/** Inicializa a casca da aplicação (menu, usuário, roteador por hash). */
export async function bootShell({ routes: routeMap, defaultRoute: fallback, area }) {
  routes = routeMap;
  defaultRoute = fallback;

  $$('[data-icon]').forEach((el) => (el.outerHTML = String(icon(el.dataset.icon))));
  bindThemeToggle($('#themeToggle'));
  wireMobileNav();

  let me;
  try {
    me = await api.get('/api/auth/me');
  } catch (err) {
    $('#view').innerHTML = String(errorState(err));
    return;
  }
  session.user = me.user;
  session.company = me.company;
  paintUser();

  if (area === 'colaborador' && session.user.role === 'admin') $('#switchArea')?.removeAttribute('hidden');
  if (me.maintenance && area === 'admin') $('#maintenanceBanner')?.removeAttribute('hidden');

  $('#userMenuBtn').addEventListener('click', (e) => openUserMenu(e.currentTarget));

  const params = new URLSearchParams(location.search);
  if (params.get('acesso') === 'negado') {
    toast('Essa área é exclusiva de administradores.', { tone: 'warning', title: 'Acesso restrito' });
    history.replaceState(null, '', location.pathname + location.hash);
  }

  window.addEventListener('hashchange', renderRoute);
  await renderRoute();

  if (session.user.must_change_password) openPasswordModal({ forced: true });
}

function paintUser() {
  const u = session.user;
  $('#userMenuBtn').innerHTML = String(html`${avatar(u.name)}
    <span class="userchip__text"><strong>${u.name}</strong><small>${u.title || (u.role === 'admin' ? 'Administrador' : 'Colaborador')}</small></span>
    ${icon('chevronDown', 'icon--sm userchip__chev')}`);
  const company = $('#companyName');
  if (company) company.textContent = session.company;
}

function openUserMenu(anchor) {
  openMenu(
    anchor,
    [
      { label: 'Meu perfil', icon: 'user', onSelect: openProfileModal },
      { label: 'Alterar senha', icon: 'key', onSelect: () => openPasswordModal() },
      'divider',
      { label: 'Sair', icon: 'logout', tone: 'danger', onSelect: logout },
    ],
    { align: 'start' }
  );
}

export async function logout() {
  try {
    await api.post('/api/auth/logout');
  } finally {
    window.location.assign('/login?saiu=1');
  }
}

// ---------------------------------------------------------------------------
// Roteador por hash: #/rota?param=valor
// ---------------------------------------------------------------------------
function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, query] = raw.split('?');
  return { path: path && routes[path] ? path : defaultRoute, params: new URLSearchParams(query || '') };
}

export function navigate(path, params) {
  const q = params ? `?${new URLSearchParams(params)}` : '';
  const target = `#/${path}${q}`;
  if (location.hash === target) renderRoute();
  else location.hash = target;
}

export const refresh = () => renderRoute({ keepScroll: true });

/**
 * Liga ações da tela atual por delegação (`data-action="nome"`). Os ouvintes da
 * tela anterior são removidos automaticamente a cada nova renderização.
 */
let viewAbort = null;
export function bindActions(root, handlers, { events = ['click'] } = {}) {
  viewAbort?.abort();
  viewAbort = new AbortController();
  for (const type of events) {
    root.addEventListener(
      type,
      (e) => {
        const el = e.target.closest('[data-action]');
        if (!el || !root.contains(el)) return;
        const isField = el.matches('input, select, textarea');
        // Campos respondem a 'input'/'change'; botões e linhas respondem a 'click'.
        if (type === 'click' ? isField : !isField) return;
        handlers[el.dataset.action]?.(e, el);
      },
      { signal: viewAbort.signal }
    );
  }
  return viewAbort.signal;
}

async function renderRoute(opts = {}) {
  const { path, params } = parseHash();
  const route = routes[path];
  const token = ++renderToken;
  const view = $('#view');

  $$('[data-route]').forEach((a) => {
    if (a.dataset.route === path) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  $('#pageTitle').textContent = route.title;
  document.title = `${route.title} · CRM System`;
  closeMobileNav();

  const scrollY = window.scrollY;
  if (!opts.keepScroll) view.innerHTML = String(skeleton(8));

  const ctx = { params, isCurrent: () => token === renderToken };
  try {
    await route.render(view, ctx);
    if (opts.keepScroll) window.scrollTo(0, scrollY);
    else if (opts instanceof Event || !opts.keepScroll) {
      window.scrollTo(0, 0);
      view.focus({ preventScroll: true });
    }
  } catch (err) {
    if (!ctx.isCurrent()) return;
    console.error(err);
    view.innerHTML = String(errorState(err, true));
    view.querySelector('[data-retry]')?.addEventListener('click', () => renderRoute());
  }
}

// ---------------------------------------------------------------------------
// Navegação lateral no celular
// ---------------------------------------------------------------------------
function wireMobileNav() {
  $('#menuBtn')?.addEventListener('click', () => {
    const open = !document.body.classList.contains('nav-open');
    document.body.classList.toggle('nav-open', open);
    $('#menuBtn').setAttribute('aria-expanded', String(open));
    $('#scrim').hidden = !open;
  });
  $('#scrim')?.addEventListener('click', closeMobileNav);
  document.addEventListener('keydown', (e) => e.key === 'Escape' && closeMobileNav());
}

function closeMobileNav() {
  document.body.classList.remove('nav-open');
  $('#menuBtn')?.setAttribute('aria-expanded', 'false');
  const scrim = $('#scrim');
  if (scrim) scrim.hidden = true;
}

// ---------------------------------------------------------------------------
// Perfil e senha
// ---------------------------------------------------------------------------
export function openProfileModal() {
  const u = session.user;
  formModal({
    title: 'Meu perfil',
    description: 'E-mail, perfil de acesso e meta são definidos pelo administrador.',
    fields: html`
      <div class="profile-head">${avatar(u.name, 'lg')}<div><strong>${u.email}</strong><span>${u.role === 'admin' ? 'Administrador' : 'Colaborador'}${u.team ? `, ${u.team}` : ''}</span></div></div>
      <div class="form__grid">
        <div class="field field--full"><label class="field__label" for="pf-name">Nome completo</label>
          <input class="input" id="pf-name" name="name" required minlength="3" maxlength="120" value="${u.name}"></div>
        <div class="field field--full"><label class="field__label" for="pf-phone">Telefone</label>
          <input class="input" id="pf-phone" name="phone" maxlength="30" value="${u.phone || ''}" placeholder="(11) 99999-0000"></div>
      </div>`,
    submitLabel: 'Salvar perfil',
    onSubmit: async (data) => {
      const res = await api.patch('/api/auth/profile', data);
      session.user = res.user;
      paintUser();
      toast('Perfil atualizado.');
    },
  });
}

export function openPasswordModal({ forced = false } = {}) {
  const ctx = formModal({
    title: forced ? 'Crie uma nova senha' : 'Alterar senha',
    description: forced
      ? 'Você entrou com uma senha temporária. Defina uma senha pessoal para continuar.'
      : 'Ao trocar a senha, as suas outras sessões abertas são encerradas.',
    fields: html`
      <div class="field"><label class="field__label" for="pw-current">${forced ? 'Senha temporária' : 'Senha atual'}</label>
        <input class="input" id="pw-current" name="current_password" type="password" autocomplete="current-password" required></div>
      <div class="field"><label class="field__label" for="pw-new">Nova senha</label>
        <input class="input" id="pw-new" name="new_password" type="password" autocomplete="new-password" required minlength="8" maxlength="128">
        <p class="field__hint">Pelo menos 8 caracteres, combinando letras e números.</p></div>
      <div class="field"><label class="field__label" for="pw-confirm">Confirme a nova senha</label>
        <input class="input" id="pw-confirm" name="confirm" type="password" autocomplete="new-password" required></div>`,
    submitLabel: 'Salvar nova senha',
    dismissible: !forced,
    onSubmit: async (data) => {
      if (data.new_password !== data.confirm) throw new Error('A confirmação não confere com a nova senha.');
      const res = await api.post('/api/auth/change-password', data);
      session.user = res.user;
      toast('Senha alterada. As outras sessões foram encerradas.');
    },
  });
  if (forced) {
    // Sem Esc e sem fechar pelo fundo: a troca é obrigatória (ou a pessoa sai).
    const cancel = ctx.$('.modal__foot [data-close]');
    if (cancel) {
      cancel.removeAttribute('data-close');
      cancel.textContent = 'Sair';
      cancel.addEventListener('click', logout);
    }
  }
}

export { toastError };
