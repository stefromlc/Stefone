// Code Turtle — Logo-style coding: forward/turn/repeat/pen colour, animated turtle, challenges.
import { store } from '../store.js';
import { h, toast, uid } from '../util.js';
import { sfx } from '../media.js';
import { nameIt } from './doclib.js';

const CHALLENGES = [
  { id: 'line', name: 'Draw a line', hint: 'forward 100', goal: 'Make the turtle walk forward.' },
  { id: 'square', name: 'Square', hint: 'repeat 4 [ forward 100 right 90 ]', goal: 'Draw a square with 4 equal sides.' },
  { id: 'triangle', name: 'Triangle', hint: 'repeat 3 [ forward 120 right 120 ]', goal: 'Draw a triangle. How far must the turtle turn?' },
  { id: 'stairs', name: 'Staircase', hint: 'repeat 5 [ forward 30 right 90 forward 30 left 90 ]', goal: 'Draw some steps.' },
  { id: 'star', name: 'Star', hint: 'repeat 5 [ forward 150 right 144 ]', goal: 'Draw a 5-pointed star. (Clue: 144)' },
  { id: 'circle', name: 'Circle', hint: 'repeat 36 [ forward 10 right 10 ]', goal: 'Draw a circle using lots of tiny steps.' },
  { id: 'house', name: 'House', hint: 'repeat 4 [ forward 100 right 90 ] …', goal: 'Draw a square house with a triangle roof.' },
  { id: 'flower', name: 'Flower', hint: 'repeat 12 [ repeat 4 [ forward 60 right 90 ] right 30 ]', goal: 'Spin squares round to make a flower.' },
];
const COLOURS = { red: '#e03131', orange: '#f76707', yellow: '#fab005', green: '#2f9e44', blue: '#1c7ed6', purple: '#7048e8', pink: '#e64980', black: '#1f2440', brown: '#8d5524', rainbow: 'rainbow' };

function parse(src) {
  const toks = src.replace(/\[/g, ' [ ').replace(/\]/g, ' ] ').split(/[\s,;]+/).filter(Boolean).map(t => t.toLowerCase());
  let i = 0;
  const alias = { fd: 'forward', bk: 'back', backward: 'back', lt: 'left', rt: 'right', pu: 'penup', pd: 'pendown', colour: 'color', pen: 'color' };
  const num = () => { const t = toks[i++]; const n = Number(t); if (t == null || isNaN(n)) throw new Error(`I expected a number after "${toks[i - 2]}" but found "${t ?? 'nothing'}"`); return n; };
  const block = (inner) => {
    const out = [];
    while (i < toks.length) {
      let t = toks[i++];
      t = alias[t] || t;
      if (t === ']') { if (inner) return out; throw new Error('There is a ] without a matching ['); }
      if (['forward', 'back', 'left', 'right'].includes(t)) out.push({ op: t, n: num() });
      else if (t === 'repeat') { const n = num(); if (toks[i++] !== '[') throw new Error('After "repeat 4" put [ and the commands to repeat, then ]'); out.push({ op: 'repeat', n, body: block(true) }); }
      else if (t === 'penup' || t === 'pendown' || t === 'home' || t === 'clear') out.push({ op: t });
      else if (t === 'color') { const c = toks[i++]; if (!COLOURS[c]) throw new Error(`I don't know the colour "${c}". Try: ${Object.keys(COLOURS).join(', ')}`); out.push({ op: 'color', c }); }
      else if (t === 'width' || t === 'size') out.push({ op: 'width', n: num() });
      else throw new Error(`I don't understand "${t}". Try forward, back, left, right, repeat, color, penup, pendown.`);
    }
    if (inner) throw new Error('A [ is missing its ]');
    return out;
  };
  return block(false);
}

export async function open(win, ctx, args = {}) {
  const { me } = ctx;
  let doc = args.id ? await store.get('documents', args.id) : null;
  if (!doc) doc = { childId: me.id, type: 'code', title: '', content: 'color blue\nrepeat 4 [ forward 100 right 90 ]' };
  let dirty = false, running = false, challenge = null;
  const done = new Set((await store.get('prefs', me.id))?.turtleDone || []);
  const ta = h('textarea', { class: 'code-ta', spellcheck: 'false' }, doc.content);
  const W = 600, H = 460;
  const cv = h('canvas', { width: W, height: H, class: 'turtle-cv' });
  const g = cv.getContext('2d');
  const err = h('div', { class: 'code-err' });
  const speed = h('input', { type: 'range', min: 1, max: 10, value: 6, title: 'Speed' });
  ta.oninput = () => { dirty = true; win.markDirty(true); };
  win.guard({ isDirty: () => dirty, save: () => save(), name: () => doc.title || 'your code' });
  async function save() {
    if (!doc.title) { const n = await nameIt('', 'code'); if (!n) throw new Error('Not saved'); doc.title = n; win.setTitle(n); }
    doc.content = ta.value; await store.put('documents', doc); dirty = false; win.markDirty(false);
  }
  const blocks = [['➡️ forward 50', 'forward 50'], ['⬅️ back 50', 'back 50'], ['↪️ right 90', 'right 90'], ['↩️ left 90', 'left 90'], ['🔁 repeat', 'repeat 4 [ forward 50 right 90 ]'], ['🎨 colour', 'color red'], ['✋ pen up', 'penup'], ['✏️ pen down', 'pendown'], ['📏 thickness', 'width 6']];
  const insert = txt => { const s = ta.selectionStart; const before = ta.value.slice(0, s); ta.value = before + (before && !before.endsWith('\n') ? '\n' : '') + txt + '\n' + ta.value.slice(ta.selectionEnd); ta.focus(); ta.oninput(); };
  const chalBox = h('div', { class: 'chal-list' });
  const drawChal = () => { chalBox.innerHTML = ''; CHALLENGES.forEach(c => chalBox.append(h('button', { class: `chal ${challenge?.id === c.id ? 'on' : ''} ${done.has(c.id) ? 'done' : ''}`, onclick: () => { challenge = c; drawChal(); goalEl.innerHTML = ''; goalEl.append(h('b', {}, `🎯 ${c.name}: `), c.goal, h('details', {}, h('summary', {}, '💡 Need a clue?'), h('code', {}, c.hint)), h('button', { class: 'btn btn-sm btn-good', onclick: completeChallenge }, '✅ I did it!')); } }, done.has(c.id) ? '✅ ' : '', c.name))); };
  const goalEl = h('div', { class: 'goal' }, 'Pick a challenge, or just make something cool!');
  win.body.append(
    h('div', { class: 'app-toolbar' }, h('button', { class: 'btn btn-sm btn-good', onclick: run }, '▶ Run'), h('button', { class: 'btn btn-sm', onclick: () => { running = false; reset(); } }, '⏹ Stop'), h('span', { class: 'small' }, '🐢 speed'), speed,
      h('span', { class: 'sep' }), h('button', { class: 'btn btn-sm btn-primary', onclick: () => save().then(() => toast('💾 Saved!', 'good')).catch(() => { }) }, '💾 Save'), h('span', { class: 'spacer' }), h('span', { class: 'small muted' }, 'Commands: forward, back, left, right, repeat N [ … ], color, penup, pendown, width')),
    h('div', { class: 'code-main' },
      h('div', { class: 'code-left' }, h('div', { class: 'block-pal' }, ...blocks.map(([l, t]) => h('button', { class: 'blk', onclick: () => insert(t) }, l))), ta, err),
      h('div', { class: 'code-right' }, cv, goalEl, chalBox)));
  drawChal();
  const T = { x: W / 2, y: H / 2, a: -90, pen: true, col: '#1c7ed6', w: 4, hue: 0 };
  function reset() { g.fillStyle = '#fbfcff'; g.fillRect(0, 0, W, H); g.strokeStyle = '#eef0f7'; g.lineWidth = 1; for (let x = 0; x < W; x += 50) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); } for (let y = 0; y < H; y += 50) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); } Object.assign(T, { x: W / 2, y: H / 2, a: -90, pen: true, col: '#1c7ed6', w: 4, hue: 0 }); drawTurtle(); }
  let base = null;
  function drawTurtle() { base = g.getImageData(0, 0, W, H); paintTurtle(); }
  function paintTurtle() { g.save(); g.translate(T.x, T.y); g.rotate((T.a + 90) * Math.PI / 180); g.font = '26px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('🐢', 0, 0); g.restore(); }
  const wait = ms => new Promise(r => setTimeout(r, ms));
  async function exec(cmds) {
    for (const c of cmds) {
      if (!running) return;
      if (c.op === 'repeat') { for (let k = 0; k < c.n && running; k++) await exec(c.body); continue; }
      if (base) g.putImageData(base, 0, 0);
      if (c.op === 'forward' || c.op === 'back') {
        const d = c.op === 'forward' ? c.n : -c.n, steps = Math.max(1, Math.ceil(Math.abs(d) / (speed.value * 4)));
        for (let s = 0; s < steps && running; s++) {
          if (base) g.putImageData(base, 0, 0);
          const nx = T.x + Math.cos(T.a * Math.PI / 180) * d / steps, ny = T.y + Math.sin(T.a * Math.PI / 180) * d / steps;
          if (T.pen) { g.strokeStyle = T.col === 'rainbow' ? `hsl(${(T.hue += 4) % 360},85%,55%)` : T.col; g.lineWidth = T.w; g.lineCap = 'round'; g.beginPath(); g.moveTo(T.x, T.y); g.lineTo(nx, ny); g.stroke(); }
          T.x = nx; T.y = ny; base = g.getImageData(0, 0, W, H); paintTurtle();
          if (speed.value < 10) await wait(12 - speed.value);
        }
        continue;
      }
      if (c.op === 'left') T.a -= c.n; else if (c.op === 'right') T.a += c.n;
      else if (c.op === 'penup') T.pen = false; else if (c.op === 'pendown') T.pen = true;
      else if (c.op === 'color') T.col = COLOURS[c.c]; else if (c.op === 'width') T.w = Math.max(1, Math.min(30, c.n));
      else if (c.op === 'home') { T.x = W / 2; T.y = H / 2; T.a = -90; } else if (c.op === 'clear') { reset(); }
      base = g.getImageData(0, 0, W, H); paintTurtle();
      if (speed.value < 10) await wait((11 - speed.value) * 12);
    }
  }
  async function run() {
    err.textContent = '';
    let prog; try { prog = parse(ta.value); } catch (e) { err.textContent = '🐢 ' + e.message; sfx('bad'); return; }
    running = false; await wait(20); reset(); running = true;
    await exec(prog);
    if (running) sfx('good');
    running = false;
  }
  async function completeChallenge() {
    if (!challenge) return;
    if (!done.has(challenge.id)) {
      done.add(challenge.id);
      const prefs = (await store.get('prefs', me.id)) || { id: me.id, childId: me.id };
      prefs.turtleDone = [...done]; await store.put('prefs', prefs);
      if (ctx.prefs) ctx.prefs.turtleDone = prefs.turtleDone;
      await store.put('evidence', { id: uid('ev_'), childId: me.id, skill: 'computing.algorithms', subject: 'computing', score: 1, weight: 1, ts: Date.now(), source: 'code', prompt: `Code Turtle challenge: ${challenge.name}`, response: ta.value.slice(0, 200), correct: '' });
      store.log('code', { title: challenge.name });
    }
    sfx('star'); toast(`🎉 Challenge “${challenge.name}” complete!`, 'good'); drawChal();
  }
  reset();
}
