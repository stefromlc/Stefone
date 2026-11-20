// Calculator — big friendly buttons, keyboard support, history and read-aloud. No eval().
import { h } from '../util.js';
import { say, sfx } from '../media.js';

function calc(expr) {
  const toks = expr.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').match(/\d+\.?\d*|\.\d+|[+\-*/()%]/g) || [];
  let p = 0;
  const peek = () => toks[p];
  const prim = () => { const t = toks[p++]; if (t === '(') { const v = add(); p++; return v; } if (t === '-') return -prim(); const n = parseFloat(t); if (isNaN(n)) throw new Error('?'); if (peek() === '%') { p++; return n / 100; } return n; };
  const mul = () => { let v = prim(); while (peek() === '*' || peek() === '/') { const o = toks[p++]; const r = prim(); v = o === '*' ? v * r : v / r; } return v; };
  const add = () => { let v = mul(); while (peek() === '+' || peek() === '-') { const o = toks[p++]; const r = mul(); v = o === '+' ? v + r : v - r; } return v; };
  const v = add();
  if (p !== toks.length || !isFinite(v)) throw new Error('?');
  return Math.round(v * 1e10) / 1e10;
}

export function open(win) {
  let expr = '', justDone = false;
  const disp = h('div', { class: 'calc-disp' }, '0');
  const hist = h('div', { class: 'calc-hist' });
  const show = () => { disp.textContent = expr || '0'; };
  const press = k => {
    sfx('click');
    if (k === 'C') expr = '';
    else if (k === '⌫') expr = expr.slice(0, -1);
    else if (k === '=') {
      try { const r = calc(expr); hist.prepend(h('div', {}, `${expr} = `, h('b', {}, r))); say(`${expr.replace(/\*/g, ' times ').replace(/\//g, ' divided by ').replace(/-/g, ' minus ').replace(/\+/g, ' plus ')} equals ${r}`); expr = String(r); justDone = true; }
      catch { disp.textContent = 'Oops!'; return; }
    } else { if (justDone && /[\d.]/.test(k)) expr = ''; justDone = false; expr += k; }
    show();
  };
  const keys = ['C', '(', ')', '÷', '7', '8', '9', '×', '4', '5', '6', '−', '1', '2', '3', '+', '0', '.', '⌫', '='];
  const pad = h('div', { class: 'calc-keys' }, ...keys.map(k => h('button', { class: `ck ${/[÷×−+=]/.test(k) ? 'op' : ''} ${k === '=' ? 'eq' : ''} ${k === 'C' ? 'clr' : ''}`, onclick: () => press(k) }, k)));
  const root = h('div', { class: 'calc', tabindex: 0 }, disp, pad, hist);
  root.addEventListener('keydown', e => {
    const map = { '*': '×', '/': '÷', '-': '−', Enter: '=', '=': '=', Backspace: '⌫', Escape: 'C' };
    const k = map[e.key] || (/^[\d.+()%]$/.test(e.key) ? e.key : null);
    if (k) { e.preventDefault(); press(k); }
  });
  win.body.append(root);
  setTimeout(() => root.focus(), 50);
}
