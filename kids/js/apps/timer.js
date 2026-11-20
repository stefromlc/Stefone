// Timer — visual countdown, focus/break modes and brain-break ideas.
import { h, toast } from '../util.js';
import { say, sfx } from '../media.js';

const BREAKS = ['🤸 Do 10 star jumps', '💧 Drink some water', '🧘 Take 5 slow, deep breaths', '💃 Have a 1-minute dance party', '🙆 Stretch up high, then touch your toes', '👀 Look out of the window and find 3 things that are green', '🐸 Hop like a frog 10 times'];

export function open(win) {
  let total = 300, left = 300, timer = null;
  const R = 110, C = 2 * Math.PI * R;
  const ring = h('div', { class: 'tm-ring' });
  const label = h('div', { class: 'tm-label' });
  const draw = () => {
    const m = Math.floor(left / 60), s = left % 60;
    ring.innerHTML = `<svg viewBox="0 0 260 260"><circle cx="130" cy="130" r="${R}" fill="none" stroke="#e9ecf5" stroke-width="22"/><circle cx="130" cy="130" r="${R}" fill="none" stroke="${left < 60 ? '#fa5252' : '#0b7285'}" stroke-width="22" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - left / total)}" transform="rotate(-90 130 130)"/><text x="130" y="145" text-anchor="middle" font-size="52" font-weight="900" fill="#1f2440">${m}:${String(s).padStart(2, '0')}</text></svg>`;
  };
  const stop = () => { clearInterval(timer); timer = null; startBtn.textContent = '▶ Start'; };
  const set = (mins, lbl = '') => { stop(); total = left = Math.round(mins * 60); label.textContent = lbl; draw(); };
  const startBtn = h('button', { class: 'btn btn-good btn-lg', onclick: () => {
    if (timer) return stop();
    if (left <= 0) left = total;
    startBtn.textContent = '⏸ Pause';
    timer = setInterval(() => {
      left--; draw();
      if (left <= 0) {
        stop(); sfx('star'); setTimeout(() => sfx('star'), 400);
        const idea = BREAKS[Math.floor(Math.random() * BREAKS.length)];
        toast(`⏰ Time's up! ${label.textContent.includes('Focus') ? 'Brain break: ' + idea : ''}`, 'good', 7000);
        say(label.textContent.includes('Focus') ? `Time's up! Brain break time. ${idea.slice(2)}` : "Time's up!");
      }
    }, 1000);
  } }, '▶ Start');
  win.onClose(() => clearInterval(timer));
  const presets = h('div', { class: 'row wrap', style: { justifyContent: 'center' } }, ...[1, 2, 5, 10, 15, 20].map(m => h('button', { class: 'btn btn-sm', onclick: () => set(m) }, `${m} min`)));
  const modes = h('div', { class: 'row wrap', style: { justifyContent: 'center' } },
    h('button', { class: 'btn', onclick: () => set(15, '🎯 Focus time') }, '🎯 Focus 15'), h('button', { class: 'btn', onclick: () => set(5, '🌈 Break time') }, '🌈 Break 5'));
  win.body.append(h('div', { class: 'tm' }, label, ring, h('div', { class: 'row', style: { justifyContent: 'center' } }, startBtn, h('button', { class: 'btn btn-lg', onclick: () => { stop(); left = total; draw(); } }, '↺')), presets, modes,
    h('button', { class: 'btn btn-sm btn-ghost', onclick: () => { const i = BREAKS[Math.floor(Math.random() * BREAKS.length)]; toast(i, 'info', 5000); say(i.slice(2)); } }, '💡 Brain-break idea')));
  draw();
}
