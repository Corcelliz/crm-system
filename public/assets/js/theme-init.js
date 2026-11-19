/* Aplica o tema antes da primeira pintura para evitar "piscar" (carregado de forma síncrona no <head>). */
(function () {
  var pref = 'system';
  try {
    pref = localStorage.getItem('crm-system-theme') || 'system';
  } catch (e) {
    /* armazenamento indisponível */
  }
  var dark = pref === 'dark' || (pref === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
})();
