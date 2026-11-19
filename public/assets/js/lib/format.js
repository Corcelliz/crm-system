/** Formatação pt-BR: moeda, datas, prazos, iniciais. */

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const BRL_CENTS = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });

export const money = (n) => BRL.format(Number(n) || 0);
export const moneyCents = (n) => BRL_CENTS.format(Number(n) || 0);

/** R$ 1,2 mi · R$ 48 mil · R$ 900 */
export function moneyShort(n) {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  if (abs >= 1e6) return `R$ ${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: abs >= 1e7 ? 0 : 1 })} mi`;
  if (abs >= 1e3) return `R$ ${(v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: abs >= 1e4 ? 0 : 1 })} mil`;
  return money(v);
}

export const int = (n) => (Number(n) || 0).toLocaleString('pt-BR');
export const pct = (ratio, digits = 0) => `${((Number(ratio) || 0) * 100).toLocaleString('pt-BR', { maximumFractionDigits: digits })}%`;

const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayLocal = () => ymd(new Date());
export function addDays(dateStr, days) {
  const d = parseLocalDate(dateStr);
  d.setDate(d.getDate() + days);
  return ymd(d);
}

export function parseLocalDate(value) {
  const [y, m, d] = String(value).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

const toDate = (v) => (typeof v === 'string' && v.length === 10 ? parseLocalDate(v) : new Date(v));

export const dateBR = (v) => (v ? toDate(v).toLocaleDateString('pt-BR') : '—');
export const dateTimeBR = (v) =>
  v ? toDate(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
export const dayMonth = (v) => (v ? toDate(v).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }).replace('.', '') : '—');
export const timeHM = (v) => (v ? new Date(v).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '');
export const monthLong = (m) => new Date(2000, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long' });
export const monthShort = (m) => new Date(2000, m - 1, 1).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
export const longToday = () => new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

export function relative(iso) {
  if (!iso) return '—';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'agora';
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)} h`;
  const days = Math.floor(diff / 86400);
  if (days === 1) return 'ontem';
  if (days < 7) return `há ${days} dias`;
  return dayMonth(iso);
}

/** Rótulo e tom de um prazo (AAAA-MM-DD) em relação a hoje. */
export function dueInfo(dateStr, done = false) {
  if (!dateStr) return { label: 'Sem prazo', tone: 'none' };
  const today = parseLocalDate(todayLocal());
  const due = parseLocalDate(dateStr);
  const days = Math.round((due - today) / 86400000);
  if (done) return { label: dayMonth(dateStr), tone: 'none' };
  if (days < 0) return { label: days === -1 ? 'Venceu ontem' : `Atrasada ${-days} dias`, tone: 'overdue' };
  if (days === 0) return { label: 'Hoje', tone: 'today' };
  if (days === 1) return { label: 'Amanhã', tone: 'soon' };
  if (days < 7) return { label: due.toLocaleDateString('pt-BR', { weekday: 'long' }).replace('-feira', ''), tone: 'soon' };
  return { label: dayMonth(dateStr), tone: 'later' };
}

export function greeting(date = new Date()) {
  const h = date.getHours();
  if (h < 5) return 'Boa noite';
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

export function initials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

const AVATAR_HUES = ['#3f8f88', '#a9741a', '#4b6fa5', '#6f7f2e', '#8a5a8f', '#b4583a', '#2f7d9a'];
export function avatarColor(seed = '') {
  let h = 0;
  for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_HUES[h % AVATAR_HUES.length];
}

export const firstName = (name = '') => String(name).trim().split(/\s+/)[0] || '';
