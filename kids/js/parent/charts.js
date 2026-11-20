// Tiny SVG chart helpers (no dependencies).
import { esc } from '../util.js';

export function barChart(series, { height = 160, color = '#5b5bd6', fmt = v => v, labelEvery = 1 } = {}) {
  const W = 600, H = height, pad = 26, n = series.length;
  const max = Math.max(1, ...series.map(s => s.v));
  const bw = (W - pad * 2) / n;
  const bars = series.map((s, i) => {
    const bh = (s.v / max) * (H - pad * 2);
    const x = pad + i * bw + bw * 0.15;
    return `<rect x="${x}" y="${H - pad - bh}" width="${bw * 0.7}" height="${Math.max(bh, s.v ? 2 : 0)}" rx="3" fill="${color}"><title>${esc(s.label || s.d)}: ${esc(fmt(s.v))}</title></rect>`
      + (i % labelEvery === 0 ? `<text x="${x + bw * 0.35}" y="${H - 8}" font-size="11" text-anchor="middle" fill="#8a90ad">${esc(s.short ?? '')}</text>` : '');
  }).join('');
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}"><line x1="${pad}" y1="${H - pad}" x2="${W - pad}" y2="${H - pad}" stroke="#e4e7f2"/>${bars}<text x="${pad}" y="14" font-size="11" fill="#8a90ad">max ${esc(fmt(max))}</text></svg></div>`;
}

export function lineChart(points, { height = 170, color = '#db2777', min = 0, max = 1, fmt = v => Math.round(v * 100) + '%' } = {}) {
  const W = 600, H = height, pad = 30;
  if (points.length < 2) return '<div class="empty small">Not enough data yet — complete a few lessons to see the trend.</div>';
  const x = i => pad + (i / (points.length - 1)) * (W - pad * 2);
  const y = v => H - pad - ((v - min) / (max - min)) * (H - pad * 2);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const grid = [0, .5, 1].map(f => { const v = min + f * (max - min); return `<line x1="${pad}" x2="${W - pad}" y1="${y(v)}" y2="${y(v)}" stroke="#eef0f7"/><text x="2" y="${y(v) + 4}" font-size="10" fill="#8a90ad">${esc(fmt(v))}</text>`; }).join('');
  const dots = points.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.v)}" r="4" fill="${color}"><title>${esc(p.label)}: ${esc(fmt(p.v))}</title></circle>`).join('');
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}">${grid}<path d="${path}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round"/>${dots}</svg></div>`;
}

export function masteryColor(m) { return m >= 0.85 ? '#2f9e44' : m >= 0.65 ? '#f08c00' : '#e03131'; }
