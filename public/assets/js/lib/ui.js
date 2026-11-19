import { html, raw, uid, $ } from './dom.js';
import { icon } from './icons.js';

// ---------------------------------------------------------------------------
// Notificações (toasts)
// ---------------------------------------------------------------------------
let toastHost;
export function toast(message, { tone = 'success', title, duration = 4200 } = {}) {
  if (!toastHost) {
    toastHost = document.createElement('div');
    toastHost.className = 'toasts';
    toastHost.setAttribute('role', 'status');
    toastHost.setAttribute('aria-live', 'polite');
    document.body.append(toastHost);
  }
  const ico = { success: 'check', error: 'alert', info: 'info', warning: 'alert' }[tone] || 'info';
  const el = document.createElement('div');
  el.className = `toast toast--${tone}`;
  el.innerHTML = String(html`<span class="toast__icon">${icon(ico)}</span>
    <div class="toast__text">${title ? html`<strong>${title}</strong>` : ''}<span>${message}</span></div>
    <button type="button" class="toast__close" aria-label="Fechar notificação">${icon('x', 'icon--sm')}</button>`);
  const remove = () => {
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 220);
  };
  el.querySelector('.toast__close').addEventListener('click', remove);
  toastHost.append(el);
  if (duration) setTimeout(remove, duration);
  return remove;
}

export const toastError = (err) => toast(err?.message || String(err), { tone: 'error', duration: 6000 });

// ---------------------------------------------------------------------------
// Modais e gavetas (sobre <dialog>, com foco preso e Esc nativos)
// ---------------------------------------------------------------------------
export function modal({ title, description, body = '', footer = '', size = 'md', variant = 'modal', dismissible = true, onClose } = {}) {
  const dialog = document.createElement('dialog');
  const id = uid('dlg');
  dialog.className = `${variant} ${variant}--${size}`;
  dialog.setAttribute('aria-labelledby', `${id}-title`);
  dialog.innerHTML = String(html`
    <div class="${variant}__box">
      <header class="${variant}__head">
        <div class="${variant}__heading">
          <h2 class="${variant}__title" id="${id}-title">${title}</h2>
          ${description ? html`<p class="${variant}__desc">${description}</p>` : ''}
        </div>
        ${dismissible ? html`<button type="button" class="btn btn--ghost btn--icon btn--sm" data-close aria-label="Fechar">${icon('x')}</button>` : ''}
      </header>
      <div class="${variant}__body">${body}</div>
      ${footer ? html`<footer class="${variant}__foot">${footer}</footer>` : ''}
    </div>`);
  document.body.append(dialog);

  let pressedOnBackdrop = false;
  dialog.addEventListener('mousedown', (e) => (pressedOnBackdrop = e.target === dialog));
  dialog.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) close();
    else if (e.target === dialog && pressedOnBackdrop && dismissible) close();
  });
  dialog.addEventListener('cancel', (e) => {
    if (!dismissible) e.preventDefault();
  });
  dialog.addEventListener('close', () => {
    dialog.remove();
    onClose?.();
  });

  function close() {
    if (!dialog.open) return;
    dialog.classList.add('is-closing');
    setTimeout(() => dialog.close(), 140);
  }

  dialog.showModal();
  return { dialog, close, $: (sel) => dialog.querySelector(sel), setBody: (content) => (dialog.querySelector(`.${variant}__body`).innerHTML = String(content)) };
}

export const drawer = (opts) => modal({ ...opts, variant: 'drawer', size: opts.size || 'md' });

/** Lê os campos nomeados de um formulário. Checkbox vira booleano. */
export function readForm(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    if (el.type === 'checkbox') out[el.name] = el.checked;
    else if (el.type === 'radio') {
      if (el.checked) out[el.name] = el.value;
    } else out[el.name] = el.value.trim();
  }
  return out;
}

export function setBusy(button, busy) {
  if (!button) return;
  button.disabled = busy;
  button.classList.toggle('is-busy', busy);
}

/**
 * Modal com formulário. `onSubmit(data, ctx)` pode lançar erro (exibido no
 * próprio modal) e retornar `false` para manter o modal aberto.
 */
export function formModal({ title, description, fields, submitLabel = 'Salvar', tone = 'primary', size = 'md', variant = 'modal', dismissible = true, onSubmit, onOpen, extraFooter = '' }) {
  const formId = uid('form');
  const ctx = modal({
    title,
    description,
    size,
    variant,
    dismissible,
    body: html`<form id="${formId}" class="form">${fields}<div class="form-error" data-form-error role="alert" hidden></div></form>`,
    footer: html`${extraFooter}<span class="spacer"></span><button type="button" class="btn" data-close>Cancelar</button>
      <button type="submit" form="${formId}" class="btn btn--${tone}" data-submit>${submitLabel}</button>`,
  });
  const form = ctx.$('form');
  const errorBox = ctx.$('[data-form-error]');
  const submit = ctx.$('[data-submit]');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.hidden = true;
    setBusy(submit, true);
    try {
      const keepOpen = (await onSubmit(readForm(form), { ...ctx, form })) === false;
      if (!keepOpen) ctx.close();
    } catch (err) {
      errorBox.innerHTML = String(html`${icon('alert')}<span>${err.message}</span>`);
      errorBox.hidden = false;
      errorBox.scrollIntoView({ block: 'nearest' });
    } finally {
      setBusy(submit, false);
    }
  });

  onOpen?.({ ...ctx, form });
  const first = form.querySelector('input:not([type=hidden]):not([disabled]), select, textarea');
  if (first) requestAnimationFrame(() => first.focus());
  return { ...ctx, form };
}

/** Diálogo de confirmação. Retorna Promise<boolean>. `requireText` exige digitação. */
export function confirmDialog({ title, message, confirmLabel = 'Confirmar', tone = 'danger', requireText } = {}) {
  return new Promise((resolve) => {
    let decided = false;
    const inputId = uid('confirm');
    const ctx = modal({
      title,
      size: 'sm',
      body: html`<p class="modal__text">${message}</p>
        ${requireText ? html`<div class="field" style="margin-top:16px"><label class="field__label" for="${inputId}">Digite <strong>${requireText}</strong> para confirmar</label><input class="input" id="${inputId}" autocomplete="off"></div>` : ''}`,
      footer: html`<span class="spacer"></span><button type="button" class="btn" data-close>Cancelar</button>
        <button type="button" class="btn btn--${tone}" data-confirm ${requireText ? raw('disabled') : ''}>${confirmLabel}</button>`,
      onClose: () => !decided && resolve(false),
    });
    const btn = ctx.$('[data-confirm]');
    if (requireText) {
      const input = ctx.$('input');
      input.addEventListener('input', () => (btn.disabled = input.value.trim() !== requireText));
      input.focus();
    } else btn.focus();
    btn.addEventListener('click', () => {
      decided = true;
      resolve(true);
      ctx.close();
    });
  });
}

// ---------------------------------------------------------------------------
// Menu suspenso simples (ações de linha, menu do usuário)
// ---------------------------------------------------------------------------
let openMenuEl = null;
export function closeMenu() {
  openMenuEl?.cleanup();
  openMenuEl = null;
}

export function openMenu(anchor, items, { align = 'end' } = {}) {
  if (openMenuEl && openMenuEl.anchor === anchor) return closeMenu();
  closeMenu();
  const menu = document.createElement('div');
  menu.className = 'menu';
  menu.setAttribute('role', 'menu');
  menu.innerHTML = items
    .map((item, i) =>
      item === 'divider'
        ? '<div class="menu__divider" role="separator"></div>'
        : String(html`<button type="button" role="menuitem" class="menu__item ${item.tone === 'danger' ? 'menu__item--danger' : ''}" data-index="${i}" ${item.disabled ? raw('disabled') : ''}>
            ${item.icon ? icon(item.icon) : ''}<span>${item.label}</span></button>`)
    )
    .join('');
  document.body.append(menu);

  const rect = anchor.getBoundingClientRect();
  const mw = menu.offsetWidth;
  const mh = menu.offsetHeight;
  let left = align === 'end' ? rect.right - mw : rect.left;
  left = Math.max(8, Math.min(left, window.innerWidth - mw - 8));
  let top = rect.bottom + 6;
  if (top + mh > window.innerHeight - 8) top = Math.max(8, rect.top - mh - 6);
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  anchor.setAttribute('aria-expanded', 'true');

  const buttons = [...menu.querySelectorAll('.menu__item:not([disabled])')];
  buttons[0]?.focus();

  const onClick = (e) => {
    const btn = e.target.closest('.menu__item');
    if (!btn) return;
    const item = items[Number(btn.dataset.index)];
    closeMenu();
    anchor.focus();
    item.onSelect?.();
  };
  const onKey = (e) => {
    const idx = buttons.indexOf(document.activeElement);
    if (e.key === 'Escape') {
      closeMenu();
      anchor.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      buttons[(idx + 1) % buttons.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      buttons[(idx - 1 + buttons.length) % buttons.length]?.focus();
    } else if (e.key === 'Tab') closeMenu();
  };
  const onOutside = (e) => {
    if (!menu.contains(e.target) && !anchor.contains(e.target)) closeMenu();
  };
  menu.addEventListener('click', onClick);
  document.addEventListener('keydown', onKey);
  setTimeout(() => document.addEventListener('mousedown', onOutside));
  window.addEventListener('resize', closeMenu, { once: true });
  window.addEventListener('scroll', closeMenu, { once: true, capture: true });

  openMenuEl = {
    anchor,
    cleanup() {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onOutside);
      anchor.setAttribute('aria-expanded', 'false');
      menu.remove();
    },
  };
}

// ---------------------------------------------------------------------------
// Estados de tela
// ---------------------------------------------------------------------------
export function emptyState({ icon: ico = 'info', title, text, action = '' }) {
  return html`<div class="empty">
    <span class="empty__icon">${icon(ico, 'icon--lg')}</span>
    <h3 class="empty__title">${title}</h3>
    ${text ? html`<p class="empty__text">${text}</p>` : ''}
    ${action}
  </div>`;
}

export function skeleton(lines = 6) {
  return html`<div class="skeleton" aria-busy="true" aria-label="Carregando">
    ${Array.from({ length: lines }, (_, i) => html`<span class="skeleton__line" style="width:${[92, 78, 85, 64, 88, 70][i % 6]}%"></span>`)}
  </div>`;
}

export function errorState(err, retry) {
  return html`<div class="empty empty--error">
    <span class="empty__icon">${icon('alert', 'icon--lg')}</span>
    <h3 class="empty__title">Não foi possível carregar esta tela</h3>
    <p class="empty__text">${err?.message || 'Erro desconhecido.'}</p>
    ${retry ? html`<button type="button" class="btn" data-retry>${icon('refresh')} Tentar de novo</button>` : ''}
  </div>`;
}

export const focusMain = () => $('#view')?.focus({ preventScroll: true });
