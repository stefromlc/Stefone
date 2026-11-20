// Interactive lesson activities: rendering, marking and display helpers for every question type.
import { h, md, toast, esc } from '../util.js';
import { markAnswer, aiReady } from '../ai.js';
import { lookAtImage, micButton, saveImage, storedImg, sfx } from '../media.js';

export const TYPES = {
  mcq: { label: 'Multiple choice', icon: '🔘' },
  multi: { label: 'Choose all that apply', icon: '☑️' },
  numeric: { label: 'Number answer', icon: '🔢' },
  short: { label: 'Short answer', icon: '✏️' },
  writing: { label: 'Writing task', icon: '📝' },
  order: { label: 'Put in order', icon: '🔀' },
  match: { label: 'Match pairs', icon: '🔗' },
  sort: { label: 'Sort into groups', icon: '🗂️' },
  fillblank: { label: 'Fill the gaps', icon: '🧩' },
  numberline: { label: 'Number line', icon: '📏' },
  draw: { label: 'Draw it', icon: '🖍️' },
  speak: { label: 'Read aloud', icon: '🗣️' },
};

const norm = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\b(a|an|the)\b/g, ' ').replace(/\s+/g, ' ').trim();
const wordCount = s => (String(s).trim().match(/\S+/g) || []).length;
function shuffle(arr, seed = 7) {
  const a = arr.map((x, i) => [x, i]); let s = seed;
  for (let i = a.length - 1; i > 0; i--) { s = (s * 9301 + 49297) % 233280; const j = Math.floor((s / 233280) * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  if (a.length > 1 && a.every(([, i], k) => i === k)) a.push(a.shift());
  return a.map(([x]) => x);
}
const seedOf = str => [...String(str)].reduce((t, c) => (t * 31 + c.charCodeAt(0)) % 99991, 11);
export const blanksOf = text => [...String(text || '').matchAll(/\[\[(.+?)\]\]/g)].map(m => m[1]);

// ─────────── answers as text (review, evidence, AI analysis) ───────────
export function correctText(a) {
  switch (a.type) {
    case 'mcq': return a.options?.[a.answer] ?? '';
    case 'multi': return (a.answers || []).map(i => a.options[i]).join(', ');
    case 'numeric': return `${a.answer}${a.unit ? ' ' + a.unit : ''}`;
    case 'short': return a.answer;
    case 'order': return (a.items || []).join(' → ');
    case 'match': return (a.pairs || []).map(p => `${p[0]} = ${p[1]}`).join('; ');
    case 'sort': return (a.items || []).map(i => `${i.text} → ${i.cat}`).join('; ');
    case 'fillblank': return blanksOf(a.text).join(', ');
    case 'numberline': return String(a.answer);
    case 'speak': return a.target || '';
    default: return a.rubric || '';
  }
}
export function responseText(a, r) {
  if (r == null) return '';
  switch (a.type) {
    case 'mcq': return a.options?.[r] ?? '';
    case 'multi': return (r || []).map(i => a.options[i]).join(', ');
    case 'order': return (r || []).join(' → ');
    case 'match': return Object.entries(r || {}).map(([k, v]) => `${k} = ${v}`).join('; ');
    case 'sort': return Object.entries(r || {}).map(([k, v]) => `${k} → ${v}`).join('; ');
    case 'fillblank': return (r || []).join(', ');
    case 'draw': return '(drawing)';
    default: return String(r);
  }
}

// ─────────── marking ───────────
export async function markActivity(a, r, child) {
  const frac = (n, d) => { const score = d ? n / d : 0; return { score, correct: score >= 0.999 }; };
  switch (a.type) {
    case 'mcq': { const ok = Number(r) === Number(a.answer); return { score: ok ? 1 : 0, correct: ok }; }
    case 'multi': {
      const want = new Set(a.answers || []), got = new Set(r || []);
      const hits = [...got].filter(x => want.has(x)).length, wrong = got.size - hits;
      return { score: Math.max(0, (hits - wrong) / Math.max(1, want.size)), correct: hits === want.size && !wrong };
    }
    case 'numeric': {
      const v = parseFloat(String(r).replace(/[, ]/g, '').replace(/[^0-9.\-]/g, ''));
      const ok = !isNaN(v) && Math.abs(v - Number(a.answer)) < (a.tolerance || 0.001);
      return { score: ok ? 1 : 0, correct: ok };
    }
    case 'order': return frac((r || []).filter((x, i) => x === a.items[i]).length, a.items.length);
    case 'match': return frac((a.pairs || []).filter(([l, rr]) => (r || {})[l] === rr).length, a.pairs.length);
    case 'sort': return frac((a.items || []).filter(i => (r || {})[i.text] === i.cat).length, a.items.length);
    case 'fillblank': { const b = blanksOf(a.text); return frac(b.filter((w, i) => norm((r || [])[i]) === norm(w) || (a.acceptAlt && norm((r || [])[i]).replace(/s$/, '') === norm(w).replace(/s$/, ''))).length, b.length); }
    case 'numberline': {
      const tol = a.tolerance ?? (Number(a.max) - Number(a.min)) / 20;
      const ok = Math.abs(Number(r) - Number(a.answer)) <= tol + 1e-9;
      return { score: ok ? 1 : 0, correct: ok };
    }
    case 'speak': {
      const want = norm(a.target).split(' ').filter(Boolean), got = new Set(norm(r).split(' '));
      const n = want.filter(w => got.has(w)).length;
      const score = want.length ? n / want.length : 0;
      return { score, correct: score >= 0.8, feedback: score >= 0.8 ? 'Lovely clear reading!' : 'Good try! Listen again and have another go next time.' };
    }
    case 'short': {
      const nr = norm(r);
      if ([a.answer, ...(a.accept || [])].some(x => norm(x) && norm(x) === nr)) return { score: 1, correct: true };
      break;
    }
    case 'draw': {
      if (await aiReady()) {
        try {
          const raw = await lookAtImage({
            dataUrl: r, maxTokens: 300,
            system: 'You are a kind primary teacher marking an 8-year-old\'s drawing. Reply ONLY with JSON: {"score":0..1,"correct":bool,"feedback":"1-2 encouraging sentences to the child, with one tip"}. Judge the idea, not artistic skill.',
            question: `Task: ${a.prompt}\nWhat a good answer shows: ${a.rubric || 'meets the task'}`,
          });
          const j = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
          const score = Math.max(0, Math.min(1, Number(j.score) || 0));
          return { score, correct: j.correct ?? score >= 0.7, feedback: j.feedback || '' };
        } catch (e) { console.warn(e); }
      }
      return { score: null, correct: null, pending: true, feedback: 'Great drawing! A grown-up will check this one. ⭐' };
    }
  }
  if (await aiReady()) {
    try { return await markAnswer({ activity: a, response: r, child }); } catch (e) { console.warn(e); }
  }
  return { score: null, correct: null, pending: true, feedback: 'Thanks! A grown-up will check this one. ⭐' };
}

// ─────────── rendering ───────────
/**
 * Returns { el, value(), ready() } — `prev` (an earlier answer) renders read-only with the correct answer shown.
 */
export function renderActivity(a, { prev, onEnter } = {}) {
  const locked = !!prev;
  const el = h('div', { class: `act act-${a.type}` });
  const seed = seedOf(a.id || a.prompt);
  let value = prev?.response ?? null;
  const ready = () => value != null && !(Array.isArray(value) && !value.length) && String(value).trim() !== '' && (typeof value !== 'object' || Object.keys(value).length);

  if (a.imageId) el.append(h('div', { class: 'act-img' }, storedImg(a.imageId, { alt: '' })));

  // Tap-to-pick helper used by match & sort
  const pickable = (chips, onPick) => { let sel = null; chips.forEach(c => c.onclick = () => { if (locked) return; chips.forEach(x => x.classList.remove('sel')); if (sel === c) { sel = null; return; } sel = c; c.classList.add('sel'); sfx('click'); onPick?.(c); }); return () => sel; };

  switch (a.type) {
    case 'mcq': case 'multi': {
      const multi = a.type === 'multi';
      if (multi) { value = value || []; el.append(h('div', { class: 'act-hint' }, 'Choose ALL the right answers')); }
      const grid = h('div', { class: `choices ${a.options.length === 2 ? 'two' : ''}` });
      a.options.forEach((o, k) => {
        const c = h('button', { class: 'choice' }, h('span', { class: 'letter' }, 'ABCDEFGH'[k]), h('span', { html: md(o).replace(/^<p>|<\/p>\s*$/g, '') }));
        if (locked) {
          const right = multi ? a.answers.includes(k) : k === a.answer;
          const chosen = multi ? (value || []).includes(k) : k === Number(value);
          if (right) c.classList.add('right'); else if (chosen) c.classList.add('wrong');
          if (chosen) c.classList.add('sel');
        } else c.onclick = () => {
          sfx('click');
          if (multi) { value = value.includes(k) ? value.filter(x => x !== k) : [...value, k]; c.classList.toggle('sel'); }
          else { value = k; grid.querySelectorAll('.choice').forEach((b, j) => b.classList.toggle('sel', j === k)); }
        };
        grid.append(c);
      });
      el.append(grid);
      break;
    }
    case 'numeric': case 'short': {
      const inp = h('input', { class: 'input big-input', inputmode: a.type === 'numeric' ? 'decimal' : 'text', value: value ?? '', placeholder: a.type === 'numeric' ? 'Type a number' : 'Type your answer', autocomplete: 'off', style: { maxWidth: a.type === 'numeric' ? '260px' : '100%' } });
      inp.oninput = () => { value = inp.value; };
      inp.onkeydown = e => { if (e.key === 'Enter') onEnter?.(); };
      if (locked) inp.readOnly = true; else setTimeout(() => inp.focus(), 60);
      el.append(h('div', { class: 'row' }, inp, a.unit ? h('b', { class: 'unit' }, a.unit) : null, !locked && a.type === 'short' ? micButton(t => { inp.value = t; value = t; }, { cls: 'btn btn-lg' }) : null));
      break;
    }
    case 'writing': {
      const ta = h('textarea', { class: 'input', rows: 8, spellcheck: 'true', lang: 'en-GB', placeholder: 'Write your answer here…', style: { fontSize: '1.1em' } }, value || '');
      const wc = h('span', { class: 'small muted' });
      const upd = () => { wc.textContent = `${wordCount(ta.value)} words${a.minWords ? ` · aim for ${a.minWords}+` : ''}`; };
      ta.oninput = () => { value = ta.value; upd(); }; upd();
      if (locked) ta.readOnly = true;
      el.append(ta, h('div', { class: 'row' }, wc, h('span', { class: 'spacer' }), !locked ? micButton(t => { ta.value = (ta.value ? ta.value.trimEnd() + ' ' : '') + t; value = ta.value; upd(); }, { label: '🎤 Say it', cls: 'btn btn-sm' }) : null));
      break;
    }
    case 'order': {
      let items = value || shuffle(a.items, seed);
      value = items;
      const list = h('div', { class: 'order-list' });
      let picked = null;
      const draw = () => {
        list.innerHTML = '';
        items.forEach((t, i) => {
          const row = h('div', { class: `order-item ${picked === i ? 'sel' : ''} ${locked ? (t === a.items[i] ? 'right' : 'wrong') : ''}` },
            h('span', { class: 'num' }, i + 1), h('span', { class: 'tx' }, t),
            locked ? null : h('span', { class: 'ord-btns' },
              h('button', { class: 'icon-btn', title: 'Move up', onclick: e => { e.stopPropagation(); if (i) { [items[i - 1], items[i]] = [items[i], items[i - 1]]; picked = null; sfx('click'); draw(); } } }, '▲'),
              h('button', { class: 'icon-btn', title: 'Move down', onclick: e => { e.stopPropagation(); if (i < items.length - 1) { [items[i + 1], items[i]] = [items[i], items[i + 1]]; picked = null; sfx('click'); draw(); } } }, '▼')));
          if (!locked) row.onclick = () => { if (picked == null) picked = i; else { [items[picked], items[i]] = [items[i], items[picked]]; picked = null; } sfx('click'); draw(); };
          list.append(row);
        });
        value = items;
      };
      draw();
      el.append(h('div', { class: 'act-hint' }, locked ? '' : 'Put them in the right order. Tap two cards to swap them, or use the arrows.'), list);
      if (locked) el.append(h('div', { class: 'small muted' }, 'Correct order: ' + a.items.join(' → ')));
      break;
    }
    case 'match': {
      value = value || {};
      const rights = shuffle(a.pairs.map(p => p[1]), seed);
      const bank = h('div', { class: 'chip-bank' });
      const rows = h('div', { class: 'match-rows' });
      const chips = rights.map(t => h('button', { class: 'chipx', 'data-v': t }, t));
      let getSel;
      const draw = () => {
        rows.innerHTML = '';
        const used = new Set(Object.values(value));
        chips.forEach(c => c.classList.toggle('used', used.has(c.dataset.v)));
        a.pairs.forEach(([l, r]) => {
          const got = value[l];
          const slot = h('button', { class: `slot ${got ? 'filled' : ''} ${locked ? (got === r ? 'right' : 'wrong') : ''}`, onclick: () => {
            if (locked) return;
            const s = getSel?.();
            if (s) { for (const k of Object.keys(value)) if (value[k] === s.dataset.v) delete value[k]; value[l] = s.dataset.v; s.classList.remove('sel'); sfx('pop'); }
            else if (got) delete value[l];
            draw();
          } }, got || 'tap a word, then here');
          rows.append(h('div', { class: 'match-row' }, h('div', { class: 'left' }, l), h('span', { class: 'arrow' }, '↔'), slot, locked && got !== r ? h('span', { class: 'small muted' }, `(${r})`) : null));
        });
      };
      getSel = pickable(chips);
      bank.append(...chips);
      if (!locked) el.append(h('div', { class: 'act-hint' }, 'Tap a word below, then tap where it belongs.'), bank);
      el.append(rows);
      draw();
      break;
    }
    case 'sort': {
      value = value || {};
      const bank = h('div', { class: 'chip-bank' });
      const buckets = h('div', { class: 'buckets' });
      const chips = shuffle(a.items.map(i => i.text), seed).map(t => h('button', { class: 'chipx', 'data-v': t }, t));
      const getSel = pickable(chips);
      const draw = () => {
        bank.innerHTML = ''; buckets.innerHTML = '';
        chips.filter(c => !value[c.dataset.v]).forEach(c => bank.append(c));
        if (!bank.children.length && !locked) bank.append(h('span', { class: 'muted small' }, 'All sorted! Tap a word in a box to take it out.'));
        a.categories.forEach(cat => {
          const box = h('button', { class: 'bucket', onclick: () => { if (locked) return; const s = getSel(); if (!s) return; value[s.dataset.v] = cat; s.classList.remove('sel'); sfx('pop'); draw(); } }, h('div', { class: 'bucket-h' }, cat));
          Object.entries(value).filter(([, c]) => c === cat).forEach(([t]) => {
            const ok = a.items.find(i => i.text === t)?.cat === cat;
            box.append(h('span', { class: `chipx in ${locked ? (ok ? 'right' : 'wrong') : ''}`, onclick: e => { if (locked) return; e.stopPropagation(); delete value[t]; draw(); } }, t));
          });
          buckets.append(box);
        });
      };
      if (!locked) el.append(h('div', { class: 'act-hint' }, 'Tap a word, then tap the box it belongs in.'));
      el.append(bank, buckets);
      draw();
      break;
    }
    case 'fillblank': {
      const blanks = blanksOf(a.text);
      value = value || blanks.map(() => '');
      const para = h('div', { class: 'fill-text' });
      let bi = 0;
      const parts = String(a.text).split(/\[\[.+?\]\]/);
      const inputs = [];
      parts.forEach((p, i) => {
        para.append(h('span', { html: esc(p).replace(/\n/g, '<br>') }));
        if (i < blanks.length) {
          const k = bi++;
          const inp = h('input', { class: `blank ${locked ? (norm(value[k]) === norm(blanks[k]) ? 'right' : 'wrong') : ''}`, value: value[k] || '', size: Math.max(5, blanks[k].length + 1), autocomplete: 'off', spellcheck: 'false' });
          inp.oninput = () => { value[k] = inp.value; };
          inp.onfocus = () => { focusIdx = k; };
          inp.onkeydown = e => { if (e.key === 'Enter') { (inputs[k + 1] || null)?.focus() ?? onEnter?.(); } };
          if (locked) inp.readOnly = true;
          inputs.push(inp); para.append(inp);
        }
      });
      let focusIdx = 0;
      el.append(para);
      if (a.bank && !locked) {
        const words = shuffle([...blanks, ...(a.distractors || [])], seed);
        el.append(h('div', { class: 'chip-bank' }, ...words.map(w => h('button', { class: 'chipx', onclick: () => {
          const i = inputs.findIndex((inp, j) => j >= focusIdx && !inp.value) >= 0 ? inputs.findIndex((inp, j) => j >= focusIdx && !inp.value) : inputs.findIndex(inp => !inp.value);
          if (i < 0) return; inputs[i].value = w; value[i] = w; focusIdx = i + 1; sfx('pop'); inputs[i + 1]?.focus();
        } }, w))));
      }
      if (locked) el.append(h('div', { class: 'small muted' }, 'Answers: ' + blanks.join(', ')));
      break;
    }
    case 'numberline': {
      const min = Number(a.min ?? 0), max = Number(a.max ?? 10), step = Number(a.step || (max - min) / 100);
      value = value ?? null;
      const W = 640, pad = 30;
      const x = v => pad + ((v - min) / (max - min)) * (W - pad * 2);
      const labels = a.labels?.length ? a.labels : [min, (min + max) / 2, max];
      const svgNS = 'http://www.w3.org/2000/svg';
      const wrap = h('div', { class: 'nl-wrap' });
      const ticks = Array.from({ length: Math.round((max - min) / (a.tickEvery || (max - min) / 10)) + 1 }, (_, i) => min + i * (a.tickEvery || (max - min) / 10));
      wrap.innerHTML = `<svg viewBox="0 0 ${W} 110" class="nl"><line x1="${pad}" y1="60" x2="${W - pad}" y2="60" stroke="#495057" stroke-width="4" stroke-linecap="round"/>${ticks.map(t => `<line x1="${x(t)}" x2="${x(t)}" y1="50" y2="70" stroke="#495057" stroke-width="2"/>`).join('')}${labels.map(t => `<text x="${x(Number(t))}" y="95" text-anchor="middle" font-size="18" font-weight="800" fill="#1f2440">${esc(String(t))}</text>`).join('')}<g class="nl-marker" style="display:none"><path d="M0 0 l-12 -22 h24z" fill="var(--accent,#5b5bd6)"/><circle cy="-28" r="12" fill="var(--accent,#5b5bd6)"/></g>${locked ? `<g transform="translate(${x(Number(a.answer))},60)"><circle r="8" fill="#2f9e44"/></g>` : ''}</svg>`;
      const svg = wrap.firstChild, marker = svg.querySelector('.nl-marker');
      const place = v => { value = v; marker.style.display = ''; marker.setAttribute('transform', `translate(${x(v)},56)`); };
      if (value != null) place(Number(value));
      if (!locked) {
        const at = ev => { const r = svg.getBoundingClientRect(); const px = ((ev.clientX - r.left) / r.width) * W; let v = min + ((px - pad) / (W - pad * 2)) * (max - min); v = Math.round(v / step) * step; v = Math.max(min, Math.min(max, +v.toFixed(6))); place(v); };
        svg.addEventListener('pointerdown', e => { svg.setPointerCapture(e.pointerId); at(e); const mv = ev => at(ev); svg.addEventListener('pointermove', mv); svg.addEventListener('pointerup', () => { svg.removeEventListener('pointermove', mv); sfx('pop'); }, { once: true }); });
      }
      el.append(h('div', { class: 'act-hint' }, locked ? `The green dot shows ${a.answer}.` : 'Tap or drag on the line to place your marker.'), wrap);
      break;
    }
    case 'draw': {
      const cv = h('canvas', { width: 640, height: 400, class: 'draw-cv' });
      const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 640, 400);
      let col = '#1f2440', size = 6, drawn = false;
      if (locked) { el.append(prev.imageId ? h('div', { class: 'act-img' }, storedImg(prev.imageId)) : h('p', { class: 'muted' }, '(drawing)')); break; }
      const pos = e => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * 640 / r.width, y: (e.clientY - r.top) * 400 / r.height }; };
      let last = null;
      cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); last = pos(e); g.fillStyle = col; g.beginPath(); g.arc(last.x, last.y, size / 2, 0, 7); g.fill(); drawn = true; value = 'drawing'; });
      cv.addEventListener('pointermove', e => { if (!last) return; const p = pos(e); g.strokeStyle = col; g.lineWidth = size; g.lineCap = 'round'; g.beginPath(); g.moveTo(last.x, last.y); g.lineTo(p.x, p.y); g.stroke(); last = p; });
      cv.addEventListener('pointerup', () => { last = null; });
      const tools = h('div', { class: 'row wrap' }, ...['#1f2440', '#e03131', '#1c7ed6', '#2f9e44', '#f08c00', '#ffffff'].map(c => h('button', { class: 'swatch', style: { background: c }, title: c === '#ffffff' ? 'Rubber' : 'Colour', onclick: () => { col = c; size = c === '#ffffff' ? 22 : 6; } })),
        h('button', { class: 'btn btn-sm', onclick: () => { g.fillStyle = '#fff'; g.fillRect(0, 0, 640, 400); drawn = false; value = null; } }, '🗑 Start again'));
      el.append(tools, cv);
      el._getDrawing = () => (drawn ? cv.toDataURL('image/jpeg', 0.8) : null);
      break;
    }
    case 'speak': {
      el.append(h('div', { class: 'speak-target' }, a.target));
      const heard = h('div', { class: 'speak-heard' }, value ? `I heard: “${value}”` : '');
      if (!locked) el.append(h('div', { class: 'row', style: { justifyContent: 'center' } }, micButton(t => { value = t; heard.textContent = `I heard: “${t}”`; sfx('pop'); }, { label: '🎤 Start reading', cls: 'btn btn-lg btn-primary', maxSeconds: 40 })));
      el.append(heard);
      break;
    }
  }
  return {
    el, ready,
    async value() {
      if (a.type === 'draw') {
        const d = el._getDrawing?.();
        return d;
      }
      return value;
    },
  };
}

/** Store a drawing answer as an image record and return its id. */
export async function persistDrawing(dataUrl, meta) { return saveImage(dataUrl, { kind: 'answer', ...meta }); }
