import { icon } from './icons.js';

const KEY = 'crm-system-theme';

function stored() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export const currentTheme = () => document.documentElement.getAttribute('data-theme') || 'light';

export function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* sem armazenamento: vale só nesta página */
  }
  document.dispatchEvent(new CustomEvent('themechange', { detail: theme }));
}

/** Liga um botão de alternância de tema e mantém ícone/rótulo coerentes. */
export function bindThemeToggle(button) {
  if (!button) return;
  const paint = () => {
    const dark = currentTheme() === 'dark';
    button.innerHTML = String(icon(dark ? 'sun' : 'moon'));
    button.setAttribute('aria-label', dark ? 'Usar tema claro' : 'Usar tema escuro');
    button.title = dark ? 'Tema claro' : 'Tema escuro';
  };
  button.addEventListener('click', () => {
    setTheme(currentTheme() === 'dark' ? 'light' : 'dark');
    paint();
  });
  document.addEventListener('themechange', paint);
  // Acompanha o sistema enquanto a pessoa não escolheu um tema.
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', (e) => {
    if (stored()) return;
    document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
    paint();
  });
  paint();
}
