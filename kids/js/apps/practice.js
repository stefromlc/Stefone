// Practice — quick maths drills and spelling tests. Results feed progress + gap analysis.
import { store } from '../store.js';
import { h, speak, toast, confetti, uid, esc, toNumber } from '../util.js';
export { toNumber };
import { Y34_WORDS } from '../skills.js';
import { starsFor } from './player.js';
import { sfx, say } from '../media.js';

const R = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

const MATHS = {
  tables: { name: 'Times tables', icon: '✖️', color: '#7048e8', skill: 'maths.times-tables', needsTable: true,
    gen: t => { const a = t === 'mixed' ? R(2, 12) : +t, b = R(1, 12); return Math.random() < .5 ? { q: `${a} × ${b}`, a: a * b } : { q: `${b} × ${a}`, a: a * b }; } },
  division: { name: 'Division facts', icon: '➗', color: '#1c7ed6', skill: 'maths.multiplication-division', needsTable: true,
    gen: t => { const a = t === 'mixed' ? R(2, 12) : +t, b = R(1, 12); return { q: `${a * b} ÷ ${a}`, a: b }; } },
  missing: { name: 'Missing numbers', icon: '❓', color: '#0ca678', skill: 'maths.multiplication-division', needsTable: true,
    gen: t => { const a = t === 'mixed' ? R(2, 12) : +t, b = R(2, 12); return { q: `${a} × ? = ${a * b}`, a: b }; } },
  add: { name: 'Adding', icon: '➕', color: '#f08c00', skill: 'maths.addition-subtraction', levels: true,
    gen: (_, lv) => { const m = [20, 100, 1000][lv]; const a = R(1, m - 1), b = R(1, m - a); return { q: `${a} + ${b}`, a: a + b }; } },
  sub: { name: 'Taking away', icon: '➖', color: '#e03131', skill: 'maths.addition-subtraction', levels: true,
    gen: (_, lv) => { const m = [20, 100, 1000][lv]; const a = R(2, m), b = R(1, a - 1); return { q: `${a} − ${b}`, a: a - b }; } },
  bonds: { name: 'Bonds to 100', icon: '💯', color: '#d6336c', skill: 'maths.mental-maths',
    gen: () => { const a = Math.random() < .5 ? R(1, 9) * 10 : R(1, 99); return { q: `${a} + ? = 100`, a: 100 - a }; } },
  doubles: { name: 'Doubles & halves', icon: '🪞', color: '#ae3ec9', skill: 'maths.mental-maths',
    gen: () => { const n = R(2, 50); return Math.random() < .5 ? { q: `Double ${n}`, a: n * 2 } : { q: `Half of ${n * 2}`, a: n }; } },
  place: { name: 'Place value', icon: '🔢', color: '#1098ad', skill: 'maths.place-value',
    // Every digit is different, so "the 7" can only mean one place — and that digit is highlighted too.
    gen: () => {
      let n, s;
      do { n = Math.random() < .35 ? R(102, 987) : R(1023, 9876); s = String(n); } while (new Set(s).size !== s.length);
      let i; do { i = R(0, s.length - 1); } while (s[i] === '0');
      const v = +s[i] * Math.pow(10, s.length - 1 - i);
      const shown = n.toLocaleString('en-GB');
      let k = -1; const html = [...shown].map(ch => { if (/\d/.test(ch)) k++; return k === i && /\d/.test(ch) ? `<mark class="pv">${ch}</mark>` : ch; }).join('');
      const forms = [`What is the value of the <b>${s[i]}</b> in ${html}?`, `What is the <b>${s[i]}</b> worth in ${html}?`];
      return { q: `Value of the ${s[i]} in ${shown}`, html: forms[R(0, 1)], a: v, small: true, explain: `The ${s[i]} is in the ${['ones', 'tens', 'hundreds', 'thousands'][s.length - 1 - i]} place, so it is worth ${v.toLocaleString('en-GB')}.` };
    } },
};

export async function open(win, ctx) {
  const { me } = ctx;
  const pad = h('div', { class: 'app-pad', style: { flex: 1, overflow: 'auto' } });
  win.body.append(pad);

  async function menu() {
    win.setTitle('Practice');
    pad.innerHTML = '';
    pad.append(h('h2', {}, '🧮 Maths practice'), h('p', { class: 'muted' }, '10 quick questions. How fast can you go?'));
    const grid = h('div', { class: 'mode-grid' });
    for (const [k, m] of Object.entries(MATHS)) grid.append(h('button', { style: { background: m.color }, onclick: () => setupMaths(k) }, h('span', { class: 'e' }, m.icon), m.name));
    pad.append(grid, h('h2', { style: { marginTop: '26px' } }, '🔤 Spelling'), h('p', { class: 'muted' }, "Listen to the word, then type it. Press 🔊 to hear it again."));
    const lists = (await store.list('spelling_lists')).filter(l => !l.childIds?.length || l.childIds.includes(me.id)).sort((a, b) => b.createdAt - a.createdAt);
    const sp = (await store.list('practice', { childId: me.id })).filter(p => p.kind === 'spelling');
    const tricky = [...new Set(sp.sort((a, b) => b.ts - a.ts).slice(0, 10).flatMap(p => (p.missed || []).map(x => x.a)))];
    const g2 = h('div', { class: 'mode-grid' });
    lists.forEach(l => g2.append(h('button', { style: { background: '#5c7cfa' }, onclick: () => spelling(l.title, l.words) }, h('span', { class: 'e' }, '📝'), l.title)));
    g2.append(h('button', { style: { background: '#20c997' }, onclick: () => spelling('Year 3/4 words', [...Y34_WORDS].sort(() => Math.random() - .5).slice(0, 10).map(w => ({ word: w }))) }, h('span', { class: 'e' }, '📚'), 'Year 3/4 words'));
    if (tricky.length) g2.append(h('button', { style: { background: '#fd7e14' }, onclick: () => spelling('My tricky words', tricky.slice(0, 10).map(w => ({ word: w }))) }, h('span', { class: 'e' }, '💪'), `My tricky words (${Math.min(10, tricky.length)})`));
    pad.append(g2);
  }

  function setupMaths(k) {
    const m = MATHS[k];
    if (!m.needsTable && !m.levels) return drill(k, null, 0);
    pad.innerHTML = '';
    pad.append(h('button', { class: 'btn', onclick: menu }, '⬅ Back'), h('h2', { style: { marginTop: '12px' } }, `${m.icon} ${m.name}`));
    if (m.needsTable) {
      pad.append(h('p', {}, 'Which times table?'));
      const g = h('div', { class: 'mode-grid' });
      ['mixed', 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].forEach(t => g.append(h('button', { style: { background: m.color }, onclick: () => drill(k, t, 0) }, t === 'mixed' ? '🎲 Mixed' : `${t}×`)));
      pad.append(g);
    } else {
      pad.append(h('p', {}, 'How tricky?'));
      const g = h('div', { class: 'mode-grid' });
      ['🙂 Up to 20', '😎 Up to 100', '🔥 Up to 1000'].forEach((l, i) => g.append(h('button', { style: { background: m.color }, onclick: () => drill(k, null, i) }, l)));
      pad.append(g);
    }
  }

  function drill(k, table, level) {
    const m = MATHS[k];
    const qs = []; const seen = new Set();
    while (qs.length < 10) { const q = m.gen(table, level); if (!seen.has(q.q) || seen.size > 40) { seen.add(q.q); qs.push(q); } }
    run({ title: `${m.icon} ${m.name}${table ? ` (${table === 'mixed' ? 'mixed' : table + '×'})` : ''}`, qs, kind: 'maths', mode: k, skill: m.skill, numeric: true });
  }

  function spelling(title, words) {
    if (!words?.length) return toast('This list has no words yet', 'warn');
    run({ title: `🔤 ${title}`, qs: words.slice(0, 15).map(w => ({ q: w.word, a: w.word, sentence: w.sentence })), kind: 'spelling', mode: title, skill: 'english.spelling', numeric: false });
  }

  function run({ title, qs, kind, mode, skill, numeric }) {
    win.setTitle(title);
    let i = 0, correct = 0; const missed = []; const t0 = Date.now();
    const sayWord = q => say(`${q.a}. ${q.sentence || ''} ${q.sentence ? q.a : ''}`);
    const next = () => {
      if (i >= qs.length) return finish();
      const q = qs[i];
      pad.innerHTML = '';
      const inp = h('input', { class: 'input ans', inputmode: numeric ? 'numeric' : 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
      const fb = h('div', { style: { minHeight: '60px', fontSize: '1.3em', fontWeight: 800, marginTop: '12px' } });
      const bar = h('div', { class: 'bar', style: { maxWidth: '400px', margin: '0 auto' } }, h('i', { style: { width: `${(i / qs.length) * 100}%` } }));
      pad.append(h('div', { class: 'drill' }, bar, h('div', { class: 'muted', style: { marginTop: '8px' } }, `Question ${i + 1} of ${qs.length} · ⭐ ${correct}`),
        kind === 'spelling' ? h('div', { class: 'q' }, h('button', { class: 'btn btn-lg', style: { fontSize: '1.2em' }, onclick: () => sayWord(q) }, '🔊 Hear the word')) : h('div', { class: 'q', style: q.small ? { fontSize: '1.8em' } : null, html: q.html || null }, q.html ? null : q.q),
        h('div', { class: 'row', style: { justifyContent: 'center' } }, inp, h('button', { class: 'btn btn-good btn-lg', onclick: check }, '✓')), fb));
      if (kind === 'spelling') setTimeout(() => sayWord(q), 250);
      setTimeout(() => inp.focus(), 60);
      let done = false;
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') check(); });
      let tries = 0;
      function check() {
        if (done) return;
        const v = inp.value.trim();
        if (!v) return;
        const ok = numeric ? toNumber(v) === q.a : v.toLowerCase() === String(q.a).toLowerCase();
        if (!ok && tries === 0) { // one more go before we show the answer
          tries = 1; sfx('bad');
          fb.innerHTML = '🤔 Not quite — have another go!'; fb.style.color = '#e67700';
          inp.classList.remove('shake'); void inp.offsetWidth; inp.classList.add('shake'); inp.select();
          return;
        }
        done = true;
        if (ok) { correct += tries ? 0.5 : 1; sfx('good'); fb.innerHTML = tries ? '💪 Got it on the second go!' : '✅ Correct!'; fb.style.color = '#2f9e44'; }
        else { sfx('bad'); missed.push({ q: q.q, a: q.a, given: v }); fb.innerHTML = `❌ It's <b>${esc(q.a)}</b>${q.explain ? `<div class="small" style="font-weight:600;margin-top:4px">${esc(q.explain)}</div>` : ''}`; fb.style.color = '#e03131'; }
        inp.readOnly = true;
        i++; setTimeout(next, ok ? 750 : q.explain ? 3200 : 2100);
      }
    };
    async function finish() {
      const score = correct / qs.length;
      const secs = Math.round((Date.now() - t0) / 1000);
      const id = uid('pr_');
      await store.put('practice', { id, childId: me.id, kind, mode, skill, total: qs.length, correct, missed, durationSec: secs, ts: Date.now() });
      await store.put('evidence', { id: 'ev_' + id, childId: me.id, skill, subject: skill.split('.')[0], score, weight: qs.length * 0.5, ts: Date.now(), source: 'practice', ref: id, prompt: `${title} practice`, response: `${correct}/${qs.length}`, correct: missed.map(m => `${m.q} = ${m.a} (said ${m.given})`).join('; ') });
      store.log('practice', { title, score });
      const stars = starsFor(score);
      if (score >= 0.8) confetti();
      speak(score === 1 ? `Perfect score! Amazing, ${me.name}!` : `You got ${correct} out of ${qs.length}. Well done!`);
      pad.innerHTML = '';
      pad.append(h('div', { class: 'drill' }, h('div', { class: 'stars' }, '⭐'.repeat(stars) + '☆'.repeat(3 - stars)),
        h('h1', {}, `${correct} out of ${qs.length}!`), h('p', { class: 'muted' }, `Time: ${secs} seconds`),
        missed.length ? h('div', { class: 'card', style: { textAlign: 'left', maxWidth: '420px', margin: '14px auto' } }, h('b', {}, 'Ones to practise:'), h('ul', {}, ...missed.map(m => h('li', {}, `${m.q} → ${m.a}`)))) : null,
        h('div', { class: 'row', style: { justifyContent: 'center' } }, h('button', { class: 'btn btn-lg', onclick: menu }, '🏠 Menu'), h('button', { class: 'btn btn-primary btn-lg', onclick: () => run({ title, qs: qs.sort(() => Math.random() - .5), kind, mode, skill, numeric }) }, '🔁 Again'))));
    }
    next();
  }

  await menu();
}
