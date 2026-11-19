import { api } from './lib/api.js';
import { $, $$, html } from './lib/dom.js';
import { icon } from './lib/icons.js';
import { avatarColor } from './lib/format.js';
import { bindThemeToggle } from './lib/theme.js';
import { startPipeline } from './login-pipeline.js';

const form = $('#loginForm');
const email = $('#email');
const password = $('#password');
const remember = $('#remember');
const submitBtn = $('#submitBtn');
const errorBox = $('#formError');
const notice = $('#notice');
const toggle = $('#togglePassword');
const capsHint = $('#capsHint');

const LAST_EMAIL_KEY = 'crm-system-last-email';
let lockTimer = null;

bindThemeToggle($('#themeToggle'));
startPipeline($('#pipeline'));
$$('[data-avatar]').forEach((el) => el.style.setProperty('--av', avatarColor(el.dataset.avatar)));

// ------------------------------------------------------------------ avisos vindos da URL
const NOTICES = {
  'sessao=expirada': ['info', 'Sua sessão expirou. Entre novamente para continuar de onde parou.'],
  'sessao=encerrada': ['info', 'Sua sessão foi encerrada (senha alterada ou acesso revogado). Entre novamente.'],
  'conta=desativada': ['warning', 'Esta conta foi desativada. Fale com o administrador do sistema.'],
  'manutencao=1': ['warning', 'O sistema está em manutenção. No momento, apenas administradores podem entrar.'],
  'saiu=1': ['success', 'Você saiu da sua conta com segurança.'],
};

function showNotice(tone, message) {
  const ico = tone === 'success' ? 'check' : tone === 'warning' ? 'alert' : 'info';
  notice.className = `notice notice--${tone}`;
  notice.innerHTML = String(html`${icon(ico)}<span>${message}</span>`);
  notice.hidden = false;
}

const query = location.search.slice(1);
const fromUrl = Object.keys(NOTICES).find((k) => query.includes(k));
if (fromUrl) showNotice(...NOTICES[fromUrl]);
if (location.search) history.replaceState(null, '', '/login');

try {
  const last = localStorage.getItem(LAST_EMAIL_KEY);
  if (last) email.value = last;
} catch {
  /* sem armazenamento */
}
(email.value ? password : email).focus();

// ------------------------------------------------------------------ mostrar senha / Caps Lock
function paintToggle() {
  const visible = password.type === 'text';
  toggle.innerHTML = String(icon(visible ? 'eyeOff' : 'eye'));
  toggle.setAttribute('aria-label', visible ? 'Ocultar senha' : 'Mostrar senha');
  toggle.setAttribute('aria-pressed', String(visible));
}
toggle.addEventListener('click', () => {
  password.type = password.type === 'password' ? 'text' : 'password';
  paintToggle();
  password.focus();
});
paintToggle();

const checkCaps = (e) => {
  if (typeof e.getModifierState === 'function') capsHint.hidden = !e.getModifierState('CapsLock');
};
password.addEventListener('keydown', checkCaps);
password.addEventListener('keyup', checkCaps);
password.addEventListener('blur', () => (capsHint.hidden = true));

// ------------------------------------------------------------------ contas de demonstração
$$('.demo__btn').forEach((btn) =>
  btn.addEventListener('click', () => {
    email.value = btn.dataset.email;
    password.value = btn.dataset.password;
    $$('.demo__btn').forEach((b) => b.classList.toggle('is-picked', b === btn));
    hideError();
    submitBtn.focus();
  })
);

$('#forgotBtn').addEventListener('click', () => {
  showNotice('info', 'Peça ao administrador para redefinir sua senha. Ele gera uma senha temporária na área de administração, em Usuários.');
});

// ------------------------------------------------------------------ envio
function hideError() {
  errorBox.hidden = true;
  email.removeAttribute('aria-invalid');
  password.removeAttribute('aria-invalid');
}

function showError(message, { field } = {}) {
  errorBox.innerHTML = String(html`${icon('alert')}<span>${message}</span>`);
  errorBox.hidden = false;
  if (field) field.setAttribute('aria-invalid', 'true');
  form.classList.remove('is-shaking');
  void form.offsetWidth; // reinicia a animação
  form.classList.add('is-shaking');
}

function setBusy(busy, label = 'Entrar') {
  submitBtn.disabled = busy;
  submitBtn.classList.toggle('is-busy', busy);
  submitBtn.textContent = label;
}

function startLockCountdown(seconds) {
  clearInterval(lockTimer);
  let left = seconds;
  const paint = () => {
    const mm = String(Math.floor(left / 60)).padStart(2, '0');
    const ss = String(left % 60).padStart(2, '0');
    submitBtn.textContent = `Tente de novo em ${mm}:${ss}`;
  };
  submitBtn.disabled = true;
  paint();
  lockTimer = setInterval(() => {
    left -= 1;
    if (left <= 0) {
      clearInterval(lockTimer);
      submitBtn.disabled = false;
      submitBtn.textContent = 'Entrar';
      hideError();
      return;
    }
    paint();
  }, 1000);
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  hideError();

  const emailValue = email.value.trim();
  if (!emailValue) return showError('Informe seu e-mail.', { field: email }), email.focus();
  if (!email.checkValidity()) return showError('Este e-mail parece incompleto. Confira o endereço.', { field: email }), email.focus();
  if (!password.value) return showError('Informe sua senha.', { field: password }), password.focus();

  setBusy(true);
  try {
    const result = await api.post('/api/auth/login', {
      email: emailValue,
      password: password.value,
      remember: remember.checked,
    });
    try {
      localStorage.setItem(LAST_EMAIL_KEY, emailValue);
    } catch {
      /* sem armazenamento */
    }
    submitBtn.classList.remove('is-busy');
    submitBtn.innerHTML = String(html`${icon('check')} Entrando`);
    window.location.assign(result.redirect);
  } catch (err) {
    setBusy(false);
    const code = err.data?.code;
    if (code === 'LOCKED' || code === 'RATE_LIMITED') {
      showError(err.message);
      startLockCountdown(err.data.retryAfter || 60);
      return;
    }
    let message = err.message;
    if (typeof err.data?.remaining === 'number') {
      message +=
        err.data.remaining === 0
          ? ''
          : ` ${err.data.remaining === 1 ? 'Resta 1 tentativa' : `Restam ${err.data.remaining} tentativas`} antes do bloqueio temporário.`;
    }
    showError(message, { field: code === 'INVALID_CREDENTIALS' ? password : null });
    if (code === 'INVALID_CREDENTIALS') {
      password.select();
      password.focus();
    }
  }
});
