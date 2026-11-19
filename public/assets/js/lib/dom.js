/**
 * Utilitários de DOM. O template `html` escapa TODOS os valores interpolados por
 * padrão; só conteúdo marcado com `raw()` (ou outro `html`) entra sem escape.
 */

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (value) => (value === null || value === undefined ? '' : String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]));

class SafeHtml {
  constructor(value) {
    this.value = value;
  }
  toString() {
    return this.value;
  }
}

export const raw = (value) => new SafeHtml(value ?? '');

function renderValue(value) {
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return value.map(renderValue).join('');
  if (value === null || value === undefined || value === false) return '';
  return esc(value);
}

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += renderValue(values[i]) + strings[i + 1];
  return new SafeHtml(out);
}

/** Delegação de eventos: `on(root, 'click', '[data-action]', (event, target) => {})`. */
export function on(root, type, selector, handler, options) {
  const listener = (event) => {
    const target = event.target.closest(selector);
    if (target && root.contains(target)) handler(event, target);
  };
  root.addEventListener(type, listener, options);
  return () => root.removeEventListener(type, listener, options);
}

let uidCounter = 0;
export const uid = (prefix = 'u') => `${prefix}${Date.now().toString(36)}${(uidCounter++).toString(36)}`;

export function debounce(fn, wait = 250) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}
