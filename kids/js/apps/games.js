// Brain Games — Memory Match, Word Scramble (from the child's spellings) and Make the Number (mental maths).
import { store } from '../store.js';
import { h, toast, confetti, uid } from '../util.js';
import { say, sfx } from '../media.js';
import { Y34_WORDS } from '../skills.js';

const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const EMOJI = ['🐶', '🐱', '🦊', '🐼', '🐸', '🦁', '🐵', '🦄', '🐙', '🐢', '🦋', '🐝', '🍎', '🍕', '🚀', '⚽', '🎈', '🌈'];

export async function open(win, ctx) {
  const { me } = ctx;
  const pad = h('div', { class: 'app-pad games', style: { flex: 1, overflow: 'auto' } });
  win.body.append(pad);
  const best = (await store.get('prefs', me.id))?.gameBest || {};
  async function saveBest(k, v, lowerIsBetter) {
    if (best[k] != null && (lowerIsBetter ? v >= best[k] : v <= best[k])) return false;
    best[k] = v; const prefs = (await store.get('prefs', me.id)) || { id: me.id, childId: me.id }; prefs.gameBest = best; await store.put('prefs', prefs); return true;
  }
  const back = () => h('button', { class: 'btn', onclick: menu }, '⬅ Games');

  function menu() {
    win.setTitle('Brain Games');
    pad.innerHTML = '';
    const card = (e, name, desc, color, fn) => h('button', { class: 'game-card', style: { '--gc': color }, onclick: fn }, h('span', { class: 'e' }, e), h('b', {}, name), h('small', {}, desc));
    pad.append(h('h2', { style: { textAlign: 'center' } }, '🧩 Brain Games'),
      h('div', { class: 'game-grid' },
        card('🃏', 'Memory Match', 'Find the matching pairs', '#7048e8', () => memory(8)),
        card('🔤', 'Word Scramble', 'Unjumble your spelling words', '#e8590c', scramble),
        card('🎯', 'Make the Number', 'Pick numbers that add up to the target', '#0c8599', () => makeNumber(10))));
  }

  // ───── Memory ─────
  function memory(pairs) {
    win.setTitle('Memory Match');
    pad.innerHTML = '';
    const cards = shuffle(shuffle(EMOJI).slice(0, pairs).flatMap(e => [e, e]));
    let open = [], found = 0, moves = 0, lock = false; const t0 = Date.now();
    const info = h('div', { class: 'muted' }, 'Moves: 0');
    const grid = h('div', { class: 'mem-grid', style: { gridTemplateColumns: `repeat(${pairs > 6 ? 4 : 4}, 1fr)` } });
    cards.forEach((e, i) => {
      const c = h('button', { class: 'mem' }, h('span', { class: 'mem-in' }, h('span', { class: 'mf' }, '❓'), h('span', { class: 'mb' }, e)));
      c.onclick = async () => {
        if (lock || c.classList.contains('flip')) return;
        c.classList.add('flip'); sfx('click'); open.push([c, e]);
        if (open.length < 2) return;
        moves++; info.textContent = `Moves: ${moves}`;
        const [[a, ea], [b, eb]] = open; open = [];
        if (ea === eb) { a.classList.add('got'); b.classList.add('got'); found++; sfx('good');
          if (found === pairs) { const secs = Math.round((Date.now() - t0) / 1000); const nb = await saveBest(`mem${pairs}`, moves, true); confetti(); sfx('star'); store.log('game', { title: 'Memory Match', score: null });
            pad.append(h('div', { class: 'feedback good', style: { textAlign: 'center' } }, `🎉 You found them all in ${moves} moves (${secs}s)! ${nb ? '🏆 New best!' : ''}`, h('div', {}, h('button', { class: 'btn btn-primary', onclick: () => memory(pairs) }, '🔁 Again'), ' ', h('button', { class: 'btn', onclick: () => memory(Math.min(10, pairs + 2)) }, '⬆️ Harder')))); }
        } else { lock = true; setTimeout(() => { a.classList.remove('flip'); b.classList.remove('flip'); lock = false; }, 800); }
      };
      grid.append(c);
    });
    pad.append(h('div', { class: 'row' }, back(), h('span', { class: 'spacer' }), info, h('span', { class: 'small muted' }, best[`mem${pairs}`] ? `🏆 Best: ${best[`mem${pairs}`]} moves` : '')), grid);
  }

  // ───── Word scramble ─────
  async function scramble() {
    win.setTitle('Word Scramble');
    const lists = (await store.list('spelling_lists')).filter(l => !l.childIds?.length || l.childIds.includes(me.id));
    const mine = (await store.list('words', { childId: me.id })).map(w => w.word);
    const pool = [...new Set([...lists.flatMap(l => l.words.map(w => w.word)), ...mine, ...Y34_WORDS])].filter(w => /^[a-zA-Z]{4,10}$/.test(w));
    const words = shuffle(pool).slice(0, 8);
    let i = 0, score = 0; const missed = [];
    const next = () => {
      pad.innerHTML = '';
      if (i >= words.length) {
        store.put('evidence', { id: uid('ev_'), childId: me.id, skill: 'english.spelling', subject: 'english', score: score / words.length, weight: 2, ts: Date.now(), source: 'game', prompt: 'Word Scramble', response: `${score}/${words.length}`, correct: missed.join(', ') });
        store.log('game', { title: 'Word Scramble', score: score / words.length });
        if (score >= 6) confetti(); sfx('star');
        return pad.append(back(), h('div', { class: 'drill' }, h('h1', {}, `${score} / ${words.length}`), missed.length ? h('p', {}, 'Practise: ', missed.join(', ')) : h('p', {}, 'Perfect! 🌟'), h('button', { class: 'btn btn-primary btn-lg', onclick: scramble }, '🔁 Play again')));
      }
      const word = words[i].toLowerCase();
      let letters = shuffle([...word]); if (letters.join('') === word) letters = shuffle(letters);
      let built = [];
      const slots = h('div', { class: 'scr-slots' }), tiles = h('div', { class: 'scr-tiles' }), fb = h('div', { class: 'drill-fb' });
      const draw = () => {
        slots.innerHTML = ''; tiles.innerHTML = '';
        [...word].forEach((_, k) => slots.append(h('button', { class: `scr-slot ${built[k] ? 'filled' : ''}`, onclick: () => { if (built[k]) { built.splice(k, 1); draw(); } } }, built[k]?.ch || '')));
        letters.forEach((ch, k) => tiles.append(h('button', { class: 'scr-tile', disabled: built.some(b => b.k === k), onclick: () => { built.push({ ch, k }); sfx('click'); draw(); if (built.length === word.length) check(); } }, ch)));
      };
      const check = () => {
        const ok = built.map(b => b.ch).join('') === word;
        if (ok) { score++; sfx('good'); fb.textContent = '✅ ' + word; setTimeout(() => { i++; next(); }, 900); }
        else { sfx('bad'); fb.textContent = 'Not quite — try again!'; setTimeout(() => { built = []; fb.textContent = ''; draw(); }, 900); }
      };
      pad.append(h('div', { class: 'row' }, back(), h('span', { class: 'spacer' }), h('span', { class: 'muted' }, `Word ${i + 1} of ${words.length} · ⭐ ${score}`)),
        h('div', { class: 'drill' }, h('button', { class: 'btn', onclick: () => say(word) }, '🔊 Hear the word'), slots, tiles, fb,
          h('button', { class: 'btn btn-sm', onclick: () => { missed.push(word); fb.textContent = `It was “${word}”`; setTimeout(() => { i++; next(); }, 1400); } }, '🙈 Skip')));
      draw();
    };
    next();
  }

  // ───── Make the number ─────
  function makeNumber(level) {
    win.setTitle('Make the Number');
    let round = 0, score = 0;
    const play = () => {
      pad.innerHTML = '';
      if (round >= 8) {
        store.put('evidence', { id: uid('ev_'), childId: me.id, skill: 'maths.mental-maths', subject: 'maths', score: score / 8, weight: 2, ts: Date.now(), source: 'game', prompt: `Make the Number (to ${level})`, response: `${score}/8`, correct: '' });
        store.log('game', { title: 'Make the Number', score: score / 8 }); sfx('star'); if (score >= 6) confetti();
        return pad.append(back(), h('div', { class: 'drill' }, h('h1', {}, `${score} / 8`), h('div', { class: 'row', style: { justifyContent: 'center' } }, h('button', { class: 'btn btn-primary btn-lg', onclick: () => makeNumber(level) }, '🔁 Again'), ...[10, 20, 100].filter(l => l !== level).map(l => h('button', { class: 'btn btn-lg', onclick: () => makeNumber(l) }, `Make ${l}`)))));
      }
      const target = level === 100 ? 10 * (2 + Math.floor(Math.random() * 9)) + (Math.random() < .5 ? 0 : 5) : level === 20 ? 8 + Math.floor(Math.random() * 13) : 5 + Math.floor(Math.random() * 6);
      const a = 1 + Math.floor(Math.random() * (target - 1)), b = target - a;
      const max = level === 100 ? 60 : level;
      const nums = shuffle([a, b, ...Array.from({ length: 6 }, () => 1 + Math.floor(Math.random() * max))]);
      const picked = new Set(); const fb = h('div', { class: 'drill-fb' }); const sumEl = h('div', { class: 'muted' }, 'Total: 0');
      const grid = h('div', { class: 'num-grid' });
      nums.forEach((n, k) => { const btn = h('button', { class: 'num-tile', onclick: () => {
        picked.has(k) ? picked.delete(k) : picked.add(k); btn.classList.toggle('on'); sfx('click');
        const sum = [...picked].reduce((t, j) => t + nums[j], 0); sumEl.textContent = `Total: ${sum}`;
        if (sum === target) { score++; sfx('good'); fb.textContent = '🎯 Bullseye!'; grid.querySelectorAll('button').forEach(x => { x.disabled = true; }); setTimeout(() => { round++; play(); }, 900); }
        else if (sum > target) { sfx('bad'); fb.textContent = 'Too much! Tap a number to take it away.'; } else fb.textContent = '';
      } }, n); grid.append(btn); });
      pad.append(h('div', { class: 'row' }, back(), h('span', { class: 'spacer' }), h('span', { class: 'muted' }, `Round ${round + 1} of 8 · ⭐ ${score}`)),
        h('div', { class: 'drill' }, h('div', { class: 'small muted' }, 'Pick numbers that add up to'), h('div', { class: 'q' }, target), grid, sumEl, fb, h('button', { class: 'btn btn-sm', onclick: () => { round++; play(); } }, 'Skip ⏭')));
    };
    play();
  }

  menu();
}
