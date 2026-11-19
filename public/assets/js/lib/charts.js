import { html, raw } from './dom.js';
import { moneyShort, money, int, pct } from './format.js';

/**
 * Gráficos em HTML/CSS (texto nítido, tema automático). Todos são de série única:
 * uma cor de dados (--chart-1) e uma cor de destaque (--chart-accent) para o período atual.
 * Cada barra é focável e tem dica (tooltip) com o valor exato; há tabela alternativa.
 */

/** Teto "redondo" para o eixo (1, 2, 2,5, 5 × 10^n). */
export function niceMax(value) {
  if (value <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(value));
  const f = value / exp;
  const step = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return step * exp;
}

/**
 * Colunas verticais.
 * @param {{label:string, fullLabel?:string, value:number, detail?:string, accent?:boolean}[]} data
 */
export function columnChart(data, { title, format = moneyShort, exact = money, height = 200, labelAccent = true } = {}) {
  const max = niceMax(Math.max(...data.map((d) => d.value), 0));
  const ticks = [1, 0.5, 0];
  return html`<figure class="chart" aria-label="${title || 'Gráfico de colunas'}">
    <div class="cols" style="--chart-h:${height}px">
      <div class="cols__axis" aria-hidden="true">
        ${ticks.map((t) => html`<span class="cols__tick" style="bottom:${t * 100}%"><span>${t === 0 ? '0' : format(max * t)}</span></span>`)}
      </div>
      <div class="cols__plot">
        ${data.map((d) => {
          const h = Math.max(d.value > 0 ? 1.5 : 0, (d.value / max) * 100);
          return html`<div class="cols__col${d.accent ? ' is-accent' : ''}" tabindex="0" role="img"
              aria-label="${d.fullLabel || d.label}: ${exact(d.value)}${d.detail ? `, ${d.detail}` : ''}">
            <div class="cols__track">
              ${d.accent && labelAccent && d.value > 0 ? html`<span class="cols__value" style="bottom:${h}%">${format(d.value)}</span>` : ''}
              <span class="cols__bar" style="height:${h}%"></span>
              <span class="cols__tip" role="presentation"><strong>${exact(d.value)}</strong><span>${d.fullLabel || d.label}${d.detail ? html`<br>${d.detail}` : ''}</span></span>
            </div>
            <span class="cols__label">${d.label}</span>
          </div>`;
        })}
      </div>
    </div>
    ${dataTable(data, { exact, labelHead: 'Período' })}
  </figure>`;
}

/**
 * Barras horizontais com rótulo e valor diretos (funil, segmentos).
 * @param {{label:string, value:number, count?:number, color?:string}[]} rows
 */
export function barList(rows, { title, format = moneyShort, exact = money, countLabel = 'oportunidades', showCount = true } = {}) {
  const max = Math.max(...rows.map((r) => r.value), 0) || 1;
  return html`<figure class="chart" aria-label="${title || 'Gráfico de barras'}">
    <ul class="barlist">
      ${rows.map(
        (r) => html`<li class="barlist__row" tabindex="0" aria-label="${r.label}: ${exact(r.value)}${showCount && r.count !== undefined ? `, ${r.count} ${countLabel}` : ''}">
          <span class="barlist__label">${r.color ? html`<span class="barlist__key" style="background:${r.color}"></span>` : ''}${r.label}</span>
          <span class="barlist__track"><span class="barlist__fill" style="width:${Math.max(r.value > 0 ? 1 : 0, (r.value / max) * 100)}%${r.color ? `;background:${r.color}` : ''}"></span></span>
          <span class="barlist__value num">${format(r.value)}${showCount && r.count !== undefined ? html`<small>${int(r.count)}</small>` : ''}</span>
        </li>`
      )}
    </ul>
  </figure>`;
}

/** Barra de progresso com marcador opcional de "ritmo esperado". */
export function progressBar(ratio, { pace, label, tone } = {}) {
  const w = Math.max(0, Math.min(1, ratio)) * 100;
  const status = tone || (ratio >= 1 ? 'done' : pace !== undefined && ratio < pace * 0.85 ? 'behind' : 'ok');
  return html`<div class="progress progress--${status}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(ratio * 100)}"
      aria-label="${label || 'Progresso'}: ${pct(ratio)}">
    <span class="progress__fill" style="width:${w}%"></span>
    ${pace !== undefined ? html`<span class="progress__pace" style="left:${Math.min(1, pace) * 100}%" title="Ritmo esperado para hoje"></span>` : ''}
  </div>`;
}

function dataTable(data, { exact, labelHead }) {
  return html`<details class="chart__table">
    <summary>Ver dados em tabela</summary>
    <table class="table table--compact">
      <thead><tr><th scope="col">${labelHead}</th><th scope="col" class="t-right">Valor</th>${data.some((d) => d.detail) ? raw('<th scope="col" class="t-right">Detalhe</th>') : ''}</tr></thead>
      <tbody>${data.map((d) => html`<tr><td>${d.fullLabel || d.label}</td><td class="t-right num">${exact(d.value)}</td>${data.some((x) => x.detail) ? html`<td class="t-right">${d.detail || ''}</td>` : ''}</tr>`)}</tbody>
    </table>
  </details>`;
}
