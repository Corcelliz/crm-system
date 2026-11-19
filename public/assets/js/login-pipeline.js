import { esc } from './lib/dom.js';
import { moneyShort } from './lib/format.js';

/**
 * Ilustração do funil na tela de login: oportunidades avançam estágio a estágio;
 * algumas saem pelo caminho (perdidas) e as que chegam em "Ganho" somam ao total.
 * Respeita prefers-reduced-motion (mostra um retrato estático) e pausa com a aba oculta.
 */

const DEALS = [
  ['Lumen Tecnologia', 48000], ['Café Montanha Azul', 22500], ['Construtora Alicerce', 96000], ['Clínica Vida Plena', 31000],
  ['Transportes Rota Sul', 64000], ['Nuvem Clara Software', 118000], ['Laticínios Campo Sereno', 27500], ['Colégio Novo Saber', 41000],
  ['Metalúrgica Forja Nova', 87000], ['Hotel Vale do Sol', 19500], ['Agrotech Semear', 73000], ['Seguros Amparo', 55000],
  ['Eólica Ventos do Norte', 142000], ['Ótica Visão Clara', 16000], ['Editora Página Aberta', 38500], ['Biotec Raiz', 69000],
];

const STAGE_COUNT = 5;
const LANES = 3;
const HOLD = 1300;
const MOVE = 900;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const stageX = (stage) => `${((stage + 0.5) / STAGE_COUNT) * 100}%`;
const laneY = (lane) => `${20 + lane * 64}px`;

export function startPipeline(root) {
  if (!root) return;
  const body = root.querySelector('.pipe__body');
  const totalEl = root.querySelector('[data-won-total]');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let won = 0;
  let shown = 0;
  let next = 0;

  const makeChip = ([name, value], lane, stage) => {
    const el = document.createElement('div');
    el.className = 'deal-chip';
    el.style.left = stageX(stage);
    el.style.top = laneY(lane);
    el.innerHTML = `<span class="deal-chip__name">${esc(name)}</span><span class="deal-chip__value">${esc(moneyShort(value))}</span>`;
    body.append(el);
    return el;
  };

  const paintTotal = (value) => {
    totalEl.textContent = moneyShort(value);
  };

  function countTo(target) {
    const from = shown;
    const start = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - start) / 700);
      shown = from + (target - from) * (1 - (1 - k) ** 3);
      paintTotal(shown);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  if (reduceMotion) {
    // Retrato estático do funil.
    const layout = [
      [0, 1], [0, 3],
      [1, 0], [1, 2], [1, 4],
      [2, 1], [2, 4],
    ];
    layout.forEach(([lane, stage], i) => {
      const el = makeChip(DEALS[i], lane, stage);
      if (stage === 4) {
        el.classList.add('is-won');
        won += DEALS[i][1];
      }
    });
    paintTotal(won);
    return;
  }

  const waitVisible = async () => {
    while (document.hidden) await sleep(400);
  };

  // Estado do último cartão de cada faixa: evita sobreposição no primeiro estágio.
  const laneState = Array.from({ length: LANES }, () => null);

  async function runChip(lane) {
    const deal = DEALS[next++ % DEALS.length];
    const el = makeChip(deal, lane, 0);
    const state = { stage: 0, done: false };
    laneState[lane] = state;
    try {
      await travel(el, deal, state);
    } finally {
      state.done = true;
    }
  }

  async function travel(el, deal, state) {
    el.animate([{ opacity: 0, transform: 'translate(-50%, 8px)' }, { opacity: 1, transform: 'translate(-50%, 0)' }], {
      duration: 420,
      easing: 'cubic-bezier(.2,.7,.2,1)',
    });

    let stage = 0;
    for (;;) {
      await sleep(HOLD);
      await waitVisible();
      const advances = Math.random() < (stage === 0 ? 0.82 : 0.74);
      if (!advances) {
        await el.animate([{ opacity: 1, transform: 'translate(-50%, 0)' }, { opacity: 0, transform: 'translate(-50%, 16px)' }], {
          duration: 650,
          easing: 'ease-in',
          fill: 'forwards',
        }).finished;
        el.remove();
        return;
      }
      const from = stageX(stage);
      stage += 1;
      const to = stageX(stage);
      await el.animate([{ left: from }, { left: to }], { duration: MOVE, easing: 'cubic-bezier(.55,0,.25,1)', fill: 'forwards' }).finished;
      el.style.left = to;
      state.stage = stage;
      if (stage === STAGE_COUNT - 1) {
        el.classList.add('is-won');
        won += deal[1];
        countTo(won);
        await sleep(1900);
        await el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 500, fill: 'forwards' }).finished;
        el.remove();
        return;
      }
    }
  }

  async function lane(index) {
    await sleep(index * 1400 + 300);
    for (;;) {
      await waitVisible();
      runChip(index);
      await sleep(HOLD + MOVE + 260 + Math.random() * 1400);
      // O próximo cartão só entra depois que o anterior saiu do primeiro estágio.
      while (laneState[index] && !laneState[index].done && laneState[index].stage === 0) await sleep(300);
    }
  }

  for (let i = 0; i < LANES; i++) lane(i);
}
