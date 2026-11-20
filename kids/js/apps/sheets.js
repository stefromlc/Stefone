// Sheets — a simple spreadsheet with formulas (=A1+B2, SUM, AVERAGE, MIN, MAX, COUNT, ROUND) and bar charts.
import { store } from '../store.js';
import { h, toast, modal, esc } from '../util.js';
import { nameIt, openPicker } from './doclib.js';

const COLS = 12, ROWS = 40;
const colName = i => String.fromCharCode(65 + i);
const parseRef = r => { const m = /^([A-Z])(\d+)$/.exec(r); return m ? { c: m[1].charCodeAt(0) - 65, r: +m[2] - 1 } : null; };

// ───── formula engine (no eval) ─────
function tokenize(s) {
  const out = []; let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) { i++; continue; }
    let m;
    if ((m = /^\d+(\.\d+)?/.exec(s.slice(i)))) { out.push({ t: 'num', v: parseFloat(m[0]) }); i += m[0].length; continue; }
    if ((m = /^[A-Za-z]+\d*/.exec(s.slice(i)))) {
      const w = m[0].toUpperCase();
      out.push(/^[A-Z]\d+$/.test(w) ? { t: 'ref', v: w } : { t: 'fn', v: w }); i += m[0].length; continue;
    }
    if ('+-*/^(),:'.includes(ch)) { out.push({ t: 'op', v: ch }); i++; continue; }
    throw new Error('bad char');
  }
  return out;
}
const FNS = {
  SUM: a => a.reduce((x, y) => x + y, 0),
  AVERAGE: a => a.length ? FNS.SUM(a) / a.length : 0, AVG: a => FNS.AVERAGE(a), MEAN: a => FNS.AVERAGE(a),
  MIN: a => Math.min(...a), MAX: a => Math.max(...a), COUNT: a => a.length,
  ROUND: a => { const p = Math.pow(10, a[1] || 0); return Math.round(a[0] * p) / p; },
  ABS: a => Math.abs(a[0]),
  MEDIAN: a => { const b = [...a].sort((x, y) => x - y); const m = Math.floor(b.length / 2); return b.length ? (b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2) : 0; },
  MODE: a => { const c = {}; a.forEach(x => { c[x] = (c[x] || 0) + 1; }); return +Object.entries(c).sort((x, y) => y[1] - x[1])[0]?.[0] || 0; },
  RANGE: a => (a.length ? Math.max(...a) - Math.min(...a) : 0),
  PRODUCT: a => a.reduce((x, y) => x * y, 1),
  SQRT: a => Math.sqrt(a[0]), POWER: a => Math.pow(a[0], a[1]),
  RANDBETWEEN: a => Math.floor(Math.random() * (a[1] - a[0] + 1)) + a[0],
};
function evalFormula(src, getNum, getRange) {
  const toks = tokenize(src); let p = 0;
  const peek = () => toks[p], eat = v => { const t = toks[p]; if (!t || (v && t.v !== v)) throw new Error('syntax'); p++; return t; };
  const expr = () => { let v = term(); while (peek() && (peek().v === '+' || peek().v === '-')) { const o = eat().v; const r = term(); v = o === '+' ? v + r : v - r; } return v; };
  const term = () => { let v = power(); while (peek() && (peek().v === '*' || peek().v === '/')) { const o = eat().v; const r = power(); v = o === '*' ? v * r : v / r; } return v; };
  const power = () => { let v = unary(); if (peek() && peek().v === '^') { eat(); v = Math.pow(v, power()); } return v; };
  const unary = () => { if (peek() && peek().v === '-') { eat(); return -unary(); } if (peek() && peek().v === '+') { eat(); return unary(); } return primary(); };
  const args = () => {
    const vals = [];
    eat('(');
    if (peek() && peek().v !== ')') for (; ;) {
      if (peek().t === 'ref' && toks[p + 1] && toks[p + 1].v === ':') { const a = eat().v; eat(':'); const b = eat().v; vals.push(...getRange(a, b)); }
      else vals.push(expr());
      if (peek() && peek().v === ',') { eat(); continue; } break;
    }
    eat(')');
    return vals;
  };
  const primary = () => {
    const t = peek(); if (!t) throw new Error('syntax');
    if (t.t === 'num') { p++; return t.v; }
    if (t.t === 'ref') { p++; return getNum(t.v); }
    if (t.t === 'fn') { p++; const f = FNS[t.v]; if (!f) throw new Error('fn'); return f(args()); }
    if (t.v === '(') { eat('('); const v = expr(); eat(')'); return v; }
    throw new Error('syntax');
  };
  const v = expr(); if (p !== toks.length) throw new Error('syntax'); return v;
}

export async function open(win, ctx, args = {}) {
  const { me } = ctx;
  let doc = args.id ? await store.get('documents', args.id) : null;
  if (!doc) doc = { childId: me.id, type: 'sheet', title: '', content: { cells: {} } };
  let dirty = false;
  const cells = doc.content.cells ||= {};
  win.setTitle(doc.title || 'Untitled spreadsheet');
  let sel = { c: 0, r: 0 }, anchor = { c: 0, r: 0 };

  const refLbl = h('span', { class: 'ref' }, 'A1');
  const fx = h('input', { class: 'input', style: { padding: '5px 10px' }, placeholder: 'Type a number, words, or a formula like =A1+A2 or =SUM(A1:A5)' });
  const status = h('span', { class: 'save-status' });
  const autosave = () => { dirty = true; win.markDirty(true); status.textContent = '● Not saved'; status.classList.add('unsaved'); };
  const save = async ({ copy = false } = {}) => {
    if (!doc.title || copy) { const n = await nameIt(copy ? doc.title + ' (copy)' : '', 'spreadsheet'); if (!n) throw new Error('Not saved'); if (copy) doc = { ...doc, id: undefined, createdAt: undefined }; doc.title = n; win.setTitle(n); }
    await store.put('documents', doc); dirty = false; win.markDirty(false); status.textContent = '✓ Saved'; status.classList.remove('unsaved');
  };
  win.guard({ isDirty: () => dirty, save: () => save(), name: () => doc.title || 'your spreadsheet' });
  const doSave = () => save().then(() => toast('💾 Saved!', 'good')).catch(e => e.message !== 'Not saved' && toast(e.message, 'error'));
  const title = h('span');
  const tb = (label, t, fn) => h('button', { class: 'tb', title: t, onclick: fn }, label);
  const fill = h('input', { type: 'color', value: '#fff3bf', title: 'Fill colour', style: { width: '34px', height: '30px', border: 0, background: 'none' }, oninput: () => eachSel(k => { (cells[k] ||= {}).bg = fill.value; }) });
  const toolbar = h('div', { class: 'app-toolbar' },
    tb('📄 New', 'New spreadsheet', () => ctx.openApp('sheets')), tb('📂 Open', 'Open', () => openPicker(ctx, 'sheet')), h('button', { class: 'btn btn-sm btn-primary', onclick: doSave }, '💾 Save'), h('span', { class: 'sep' }),
    tb(h('b', {}, 'B'), 'Bold', () => eachSel(k => { const c = cells[k] ||= {}; c.b = !c.b; })), fill,
    tb('🧽', 'Clear colour', () => eachSel(k => { if (cells[k]) delete cells[k].bg; })),
    h('span', { class: 'sep' }),
    tb('Σ Sum', 'Add up the selected cells (answer goes below)', () => quickFn('SUM')),
    tb('x̄ Average', 'Average of selected cells', () => quickFn('AVERAGE')),
    tb('📊 Chart', 'Make a chart from the selected cells', chart),
    tb('↕ Sort', 'Sort the selected rows by the first column', sortSel),
    h('span', { class: 'sep' }),
    tb('🗑', 'Clear selected cells', () => eachSel(k => { delete cells[k]; })),
    tb('📤 Send', 'Send to Mum & Dad', async () => { try { await save(); } catch { return; } doc.submitted = true; doc.submittedAt = Date.now(); doc.reviewed = false; await store.put('documents', doc); store.log('doc_sent', { title: doc.title }); toast('📤 Sent to Mum & Dad!', 'good'); }),
    h('span', { class: 'spacer' }), status);
  const table = h('table', { class: 'sheet' });
  const wrap = h('div', { class: 'sheet-wrap' }, table);
  win.body.append(toolbar, h('div', { class: 'formula-bar' }, refLbl, h('b', {}, 'ƒx'), fx), wrap,
    h('div', { class: 'statusbar' }, h('span', { id: 'selinfo' }, ''), h('span', { class: 'spacer' }), 'Tip: start with = to do maths, e.g. =B2*3 or =AVERAGE(B1:B5) · Ctrl+S saves'));
  const selinfo = win.body.querySelector('#selinfo');

  // values
  let memo = {};
  const raw = k => cells[k]?.v ?? '';
  function value(k, stack = new Set()) {
    if (k in memo) return memo[k];
    const r = raw(k);
    let out;
    if (typeof r === 'string' && r.startsWith('=')) {
      if (stack.has(k)) return '#LOOP';
      stack.add(k);
      try {
        const num = ref => { const v = value(ref, stack); if (typeof v === 'string' && v.startsWith('#')) throw new Error(v); const n = parseFloat(v); return isNaN(n) ? 0 : n; };
        const range = (a, b) => { const A = parseRef(a), B = parseRef(b); const out = []; for (let rr = Math.min(A.r, B.r); rr <= Math.max(A.r, B.r); rr++) for (let cc = Math.min(A.c, B.c); cc <= Math.max(A.c, B.c); cc++) { const v = value(colName(cc) + (rr + 1), stack); const n = parseFloat(v); if (v !== '' && !isNaN(n)) out.push(n); } return out; };
        const v = evalFormula(r.slice(1), num, range);
        out = !isFinite(v) ? '#DIV/0' : Math.round(v * 1e8) / 1e8;
      } catch (e) { out = String(e.message).startsWith('#') ? e.message : '#ERR'; }
      stack.delete(k);
    } else out = r;
    memo[k] = out;
    return out;
  }

  // grid
  const inputs = {};
  const head = h('tr', {}, h('th', { class: 'rh' }));
  for (let c = 0; c < COLS; c++) head.append(h('th', {}, colName(c)));
  table.append(head);
  for (let r = 0; r < ROWS; r++) {
    const tr = h('tr', {}, h('th', { class: 'rh' }, r + 1));
    for (let c = 0; c < COLS; c++) {
      const k = colName(c) + (r + 1);
      const inp = h('input', { 'data-k': k, spellcheck: 'false' });
      inp.addEventListener('focus', () => { select(c, r, false); inp.value = raw(k); });
      inp.addEventListener('blur', () => commit(k, inp.value));
      inp.addEventListener('input', () => { fx.value = inp.value; });
      inp.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); move(c, r + 1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); move(c, r - 1); }
        else if (e.key === 'ArrowRight' && inp.selectionStart === inp.value.length) { e.preventDefault(); move(c + 1, r); }
        else if (e.key === 'ArrowLeft' && inp.selectionStart === 0) { e.preventDefault(); move(c - 1, r); }
      });
      inp.addEventListener('mousedown', e => { if (e.shiftKey) { e.preventDefault(); select(c, r, true); } });
      inp.addEventListener('mouseenter', e => { if (e.buttons === 1 && document.activeElement !== inp) select(c, r, true); });
      inputs[k] = inp;
      tr.append(h('td', {}, inp));
    }
    table.append(tr);
  }
  fx.addEventListener('input', () => { const k = colName(sel.c) + (sel.r + 1); inputs[k].value = fx.value; });
  fx.addEventListener('keydown', e => { if (e.key === 'Enter') { commit(colName(sel.c) + (sel.r + 1), fx.value); move(sel.c, sel.r + 1); } });

  function move(c, r) { c = Math.max(0, Math.min(COLS - 1, c)); r = Math.max(0, Math.min(ROWS - 1, r)); inputs[colName(c) + (r + 1)].focus(); }
  function select(c, r, extend) {
    if (!extend) anchor = { c, r };
    sel = { c, r };
    refLbl.textContent = colName(c) + (r + 1);
    fx.value = raw(colName(c) + (r + 1));
    paintSel();
  }
  function selRange() { return { c1: Math.min(anchor.c, sel.c), c2: Math.max(anchor.c, sel.c), r1: Math.min(anchor.r, sel.r), r2: Math.max(anchor.r, sel.r) }; }
  function eachSel(fn) { const { c1, c2, r1, r2 } = selRange(); for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) fn(colName(c) + (r + 1)); render(); autosave(); }
  function paintSel() {
    const { c1, c2, r1, r2 } = selRange();
    let nums = [];
    for (const [k, inp] of Object.entries(inputs)) {
      const p = parseRef(k); const td = inp.parentElement;
      const inR = p.c >= c1 && p.c <= c2 && p.r >= r1 && p.r <= r2;
      td.classList.toggle('inrange', inR && (c1 !== c2 || r1 !== r2));
      td.classList.toggle('sel', p.c === sel.c && p.r === sel.r);
      if (inR) { const v = parseFloat(value(k)); if (!isNaN(v)) nums.push(v); }
    }
    selinfo.textContent = nums.length > 1 ? `Sum: ${FNS.SUM(nums)} · Average: ${Math.round(FNS.AVERAGE(nums) * 100) / 100} · Count: ${nums.length}` : '';
  }
  function commit(k, v) {
    v = v.trim();
    if (v === raw(k)) { render(); return; }
    if (v === '') { if (cells[k]) { delete cells[k].v; if (!Object.keys(cells[k]).length) delete cells[k]; } }
    else (cells[k] ||= {}).v = v;
    render(); autosave();
  }
  function render() {
    memo = {};
    for (const [k, inp] of Object.entries(inputs)) {
      const c = cells[k];
      if (document.activeElement !== inp) { const v = value(k); inp.value = v; inp.style.textAlign = v !== '' && !isNaN(parseFloat(v)) && isFinite(v) ? 'right' : 'left'; }
      inp.style.fontWeight = c?.b ? '900' : ''; inp.parentElement.style.background = c?.bg || '';
      inp.style.color = String(value(k)).startsWith('#') ? '#e03131' : '';
    }
    paintSel();
  }
  function quickFn(fn) {
    const { c1, c2, r1, r2 } = selRange();
    if (r1 === r2 && c1 === c2) return toast('First select some cells (click, then shift-click).', 'warn');
    const target = colName(c1) + (r2 + 2);
    (cells[target] ||= {}).v = `=${fn}(${colName(c1)}${r1 + 1}:${colName(c2)}${r2 + 1})`;
    render(); autosave(); inputs[target].focus();
  }
  function sortSel() {
    const { c1, c2, r1, r2 } = selRange();
    if (r1 === r2) return toast('Select some rows to sort first', 'warn');
    const rows = [];
    for (let r = r1; r <= r2; r++) { const row = []; for (let c = c1; c <= c2; c++) row.push(cells[colName(c) + (r + 1)]); rows.push(row); }
    const key = row => { const v = row[0]?.v ?? ''; const n = parseFloat(v); return isNaN(n) ? String(v).toLowerCase() : n; };
    rows.sort((x, y) => { const a = key(x), b = key(y); return typeof a === typeof b ? (a > b ? 1 : a < b ? -1 : 0) : typeof a === 'number' ? -1 : 1; });
    rows.forEach((row, i) => row.forEach((cell, j) => { const k = colName(c1 + j) + (r1 + i + 1); if (cell) cells[k] = cell; else delete cells[k]; }));
    render(); autosave();
  }
  function chart() {
    const { c1, c2, r1, r2 } = selRange();
    const rows = [];
    for (let r = r1; r <= r2; r++) {
      const a = value(colName(c1) + (r + 1)), b = c2 > c1 ? value(colName(c1 + 1) + (r + 1)) : a;
      const n = parseFloat(b);
      if (!isNaN(n)) rows.push({ label: c2 > c1 ? String(a) : `Row ${r + 1}`, v: n });
    }
    if (rows.length < 2) return toast('Select two columns: names on the left, numbers on the right.', 'warn');
    const pal = ['#4dabf7', '#ff6b6b', '#51cf66', '#fcc419', '#b197fc', '#ff922b', '#20c997', '#f783ac'];
    const W = 640, H = 360;
    const titleIn = h('input', { class: 'input', placeholder: 'Chart title', value: 'My chart' });
    const box = h('div', { class: 'chart-box' });
    let kind = 'bar';
    const draw = () => {
      const max = Math.max(...rows.map(x => x.v), 1);
      let svg = '';
      if (kind === 'bar') {
        const bw = (W - 60) / rows.length;
        svg = `<line x1="45" y1="${H - 40}" x2="${W - 5}" y2="${H - 40}" stroke="#888"/><line x1="45" y1="40" x2="45" y2="${H - 40}" stroke="#888"/>` + rows.map((x, i) => { const bh = (x.v / max) * (H - 100); const xx = 50 + i * bw + bw * 0.15; return `<rect x="${xx}" y="${H - 40 - bh}" width="${bw * 0.7}" height="${bh}" rx="6" fill="${pal[i % pal.length]}"/><text x="${xx + bw * 0.35}" y="${H - 46 - bh}" text-anchor="middle" font-weight="800" font-size="14">${x.v}</text><text x="${xx + bw * 0.35}" y="${H - 20}" text-anchor="middle" font-size="13">${esc(x.label.slice(0, 12))}</text>`; }).join('');
      } else if (kind === 'line') {
        const px = i => 60 + i * ((W - 100) / (rows.length - 1)), py = v => H - 40 - (v / max) * (H - 100);
        svg = `<line x1="45" y1="${H - 40}" x2="${W - 5}" y2="${H - 40}" stroke="#888"/><line x1="45" y1="40" x2="45" y2="${H - 40}" stroke="#888"/><polyline fill="none" stroke="#5b5bd6" stroke-width="4" stroke-linejoin="round" points="${rows.map((x, i) => `${px(i)},${py(x.v)}`).join(' ')}"/>` + rows.map((x, i) => `<circle cx="${px(i)}" cy="${py(x.v)}" r="7" fill="${pal[i % pal.length]}"/><text x="${px(i)}" y="${py(x.v) - 12}" text-anchor="middle" font-weight="800" font-size="14">${x.v}</text><text x="${px(i)}" y="${H - 20}" text-anchor="middle" font-size="13">${esc(x.label.slice(0, 12))}</text>`).join('');
      } else {
        const tot = rows.reduce((t, x) => t + Math.max(0, x.v), 0) || 1; let ang = -Math.PI / 2; const cx = 200, cy = H / 2 + 10, r = 140;
        svg = rows.map((x, i) => { const a2 = ang + (Math.max(0, x.v) / tot) * Math.PI * 2; const large = a2 - ang > Math.PI ? 1 : 0; const p = `M${cx},${cy} L${cx + r * Math.cos(ang)},${cy + r * Math.sin(ang)} A${r},${r} 0 ${large} 1 ${cx + r * Math.cos(a2)},${cy + r * Math.sin(a2)} Z`; ang = a2; return `<path d="${p}" fill="${pal[i % pal.length]}" stroke="#fff" stroke-width="3"/>`; }).join('')
          + rows.map((x, i) => `<rect x="400" y="${70 + i * 30}" width="20" height="20" rx="4" fill="${pal[i % pal.length]}"/><text x="430" y="${86 + i * 30}" font-size="15" font-weight="700">${esc(x.label.slice(0, 14))} (${x.v})</text>`).join('');
      }
      box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;font-family:Nunito,sans-serif"><text x="${W / 2}" y="24" text-anchor="middle" font-size="20" font-weight="900">${esc(titleIn.value)}</text>${svg}</svg>`;
    };
    const kinds = h('div', { class: 'seg seg-sm' }, ...[['bar', '📊 Bars'], ['line', '📈 Line'], ['pie', '🥧 Pie']].map(([k, l]) => h('button', { class: k === kind ? 'on' : '', onclick: e => { kind = k; kinds.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === e.currentTarget)); draw(); } }, l)));
    titleIn.oninput = draw;
    modal({ title: '📊 My chart', wide: true, body: h('div', {}, h('div', { class: 'row' }, kinds, titleIn), box) });
    draw();
  }
  render();
  setTimeout(() => inputs.A1.focus(), 60);
}

export const _test = { evalFormula, tokenize };
