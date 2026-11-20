// Music Maker — playable piano (mouse, touch, keyboard) with instruments, plus an 8-step beat maker. All Web Audio.
import { store } from '../store.js';
import { h, toast } from '../util.js';
import { nameIt } from './doclib.js';

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const KEYMAP = 'awsedftgyhujkolp;';
const INSTR = { piano: '🎹 Piano', xylo: '🪘 Xylophone', synth: '🛸 Space synth', flute: '🪈 Flute' };
const DRUMS = [['kick', '🥁 Kick'], ['snare', '👏 Snare'], ['hat', '✨ Hi-hat'], ['bell', '🔔 Bell']];

export async function open(win, ctx, args = {}) {
  const { me } = ctx;
  const ac = new (window.AudioContext || window.webkitAudioContext)();
  const master = ac.createGain(); master.gain.value = 0.5; master.connect(ac.destination);
  let instr = 'piano', octave = 4, playing = false, step = 0, timer = null, bpm = 110;
  let doc = args.id ? await store.get('documents', args.id) : null;
  const grid = doc?.content?.grid || DRUMS.map(() => Array(16).fill(false));
  const recorded = [];

  const freq = (n, o) => 440 * Math.pow(2, (n + (o - 4) * 12 - 9) / 12);
  function note(f, dur = 0.6) {
    const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
    if (instr === 'piano') { o.type = 'triangle'; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.6, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur * 1.6); }
    else if (instr === 'xylo') { o.type = 'sine'; g.gain.setValueAtTime(0.7, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5); }
    else if (instr === 'synth') { o.type = 'sawtooth'; const f2 = ac.createBiquadFilter(); f2.frequency.value = 1400; o.connect(f2); f2.connect(g); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.35, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + dur * 1.4); o.frequency.value = f; o.start(t); o.stop(t + dur * 1.5); g.connect(master); return; }
    else { o.type = 'sine'; const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = 5; lg.gain.value = 4; lfo.connect(lg); lg.connect(o.frequency); lfo.start(t); lfo.stop(t + dur * 1.6); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.45, t + 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t + dur * 1.5); }
    o.frequency.value = f; o.connect(g); g.connect(master); o.start(t); o.stop(t + dur * 1.7);
  }
  function drum(kind) {
    const t = ac.currentTime;
    if (kind === 'kick') { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.15); g.gain.setValueAtTime(1, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3); o.connect(g).connect(master); o.start(t); o.stop(t + 0.3); return; }
    if (kind === 'bell') { const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine'; o.frequency.value = 1320; g.gain.setValueAtTime(0.3, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.6); o.connect(g).connect(master); o.start(t); o.stop(t + 0.6); return; }
    const len = kind === 'hat' ? 0.05 : 0.18, buf = ac.createBuffer(1, ac.sampleRate * len, ac.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = buf; f.type = kind === 'hat' ? 'highpass' : 'bandpass'; f.frequency.value = kind === 'hat' ? 7000 : 1800; g.gain.value = kind === 'hat' ? 0.4 : 0.8;
    s.connect(f).connect(g).connect(master); s.start(t);
  }

  // piano
  const piano = h('div', { class: 'piano' });
  const keyEls = {};
  const press = (n, o, el) => { if (ac.state === 'suspended') ac.resume(); note(freq(n, o)); el?.classList.add('down'); setTimeout(() => el?.classList.remove('down'), 160); recorded.push({ n, o, t: Date.now() }); };
  const drawPiano = () => {
    piano.innerHTML = '';
    for (let oo = 0; oo < 2; oo++) for (let n = 0; n < 12; n++) {
      const idx = oo * 12 + n, black = NOTES[n].includes('#');
      const k = h('button', { class: `pk ${black ? 'black' : 'white'}`, onpointerdown: e => { e.preventDefault(); press(n, octave + oo, k); } }, black ? '' : h('span', {}, `${NOTES[n]}${KEYMAP[idx] ? `\n${KEYMAP[idx].toUpperCase()}` : ''}`));
      keyEls[idx] = k; piano.append(k);
    }
    piano.append(h('button', { class: 'pk white', onpointerdown: e => { e.preventDefault(); press(0, octave + 2, e.currentTarget); } }, h('span', {}, 'C')));
  };
  drawPiano();
  const onKey = e => {
    if (!document.body.contains(piano) || e.repeat || e.target.matches('input,textarea')) return;
    const i = KEYMAP.indexOf(e.key.toLowerCase());
    if (i >= 0) press(i % 12, octave + Math.floor(i / 12), keyEls[i]);
  };
  document.addEventListener('keydown', onKey);

  // sequencer
  const seq = h('div', { class: 'seq' });
  const drawSeq = () => {
    seq.innerHTML = '';
    DRUMS.forEach(([k, l], r) => {
      const row = h('div', { class: 'seq-row' }, h('span', { class: 'seq-l' }, l));
      grid[r].forEach((on, c) => row.append(h('button', { class: `seq-c ${on ? 'on' : ''} ${c % 4 === 0 ? 'beat' : ''}`, 'data-c': c, onclick: e => { grid[r][c] = !grid[r][c]; e.currentTarget.classList.toggle('on'); if (grid[r][c]) drum(k); dirty = true; win.markDirty(true); } })));
      seq.append(row);
    });
  };
  drawSeq();
  let dirty = false;
  const tick = () => {
    seq.querySelectorAll('.seq-c').forEach(c => c.classList.toggle('now', +c.dataset.c === step));
    DRUMS.forEach(([k], r) => { if (grid[r][step]) drum(k); });
    step = (step + 1) % 16;
  };
  const playBtn = h('button', { class: 'btn btn-good', onclick: () => {
    if (ac.state === 'suspended') ac.resume();
    playing = !playing; playBtn.textContent = playing ? '⏹ Stop beat' : '▶ Play beat';
    clearInterval(timer); if (playing) timer = setInterval(tick, 60000 / bpm / 4);
  } }, '▶ Play beat');
  const tempo = h('input', { type: 'range', min: 60, max: 180, value: bpm, oninput: () => { bpm = +tempo.value; if (playing) { clearInterval(timer); timer = setInterval(tick, 60000 / bpm / 4); } } });
  const instrSel = h('select', { class: 'input', style: { width: '170px' }, onchange: () => { instr = instrSel.value; } }, ...Object.entries(INSTR).map(([k, l]) => h('option', { value: k }, l)));
  win.guard({ isDirty: () => dirty, save: async () => { if (!doc) { const n = await nameIt('', 'beat'); if (!n) throw new Error('Not saved'); doc = { childId: me.id, type: 'song', title: n }; win.setTitle(n); } doc.content = { grid, bpm }; await store.put('documents', doc); dirty = false; win.markDirty(false); }, name: () => doc?.title || 'your beat' });
  win.onClose(() => { clearInterval(timer); document.removeEventListener('keydown', onKey); ac.close(); });
  win.body.append(h('div', { class: 'music' },
    h('div', { class: 'row wrap' }, h('b', {}, '🎹 Piano'), instrSel, h('button', { class: 'btn btn-sm', onclick: () => { octave = Math.max(2, octave - 1); } }, '🔉 Lower'), h('button', { class: 'btn btn-sm', onclick: () => { octave = Math.min(6, octave + 1); } }, '🔊 Higher'),
      h('button', { class: 'btn btn-sm', title: 'Play back what you just played', onclick: () => { const t0 = recorded[0]?.t; if (!t0) return toast('Play some notes first!'); const notes = recorded.splice(0); notes.forEach(r => setTimeout(() => note(freq(r.n, r.o)), r.t - t0)); } }, '⏪ Play back my tune'),
      h('span', { class: 'spacer' }), h('span', { class: 'small muted' }, 'Tip: use your keyboard keys A W S E D F…')),
    piano,
    h('div', { class: 'row wrap', style: { marginTop: '14px' } }, h('b', {}, '🥁 Beat maker'), playBtn, h('span', { class: 'small' }, 'Speed'), tempo,
      h('button', { class: 'btn btn-sm', onclick: () => { grid.forEach(r => r.fill(false)); drawSeq(); } }, '🗑 Clear'),
      h('button', { class: 'btn btn-sm btn-primary', onclick: () => win.dirty.save().then(() => toast('💾 Saved!', 'good')).catch(() => { }) }, '💾 Save beat')),
    seq));
}
