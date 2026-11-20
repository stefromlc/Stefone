// My Journal — daily mood, gratitude and free writing (parents can read it; the child is told so).
import { store } from '../store.js';
import { h, toast, today, fmtDate, addDays } from '../util.js';
import { micButton, sfx } from '../media.js';

const MOODS = [['😄', 'Great'], ['🙂', 'Good'], ['😐', 'OK'], ['😟', 'Worried'], ['😢', 'Sad'], ['😡', 'Cross'], ['😴', 'Tired'], ['🤩', 'Excited']];
const PROMPTS = ['What made you smile today?', 'What was the trickiest thing today, and how did you try?', 'If you could have any superpower, what would it be and why?', 'Who was kind to you today?', 'What is something new you learned?', 'Describe your dream day from start to finish.', 'What are you looking forward to?', 'What would you invent to help people?', 'Write about your favourite place.', 'What makes a good friend?'];

export async function open(win, ctx) {
  const { me } = ctx;
  let date = today();
  const pad = h('div', { class: 'app-pad journal', style: { flex: 1, overflow: 'auto' } });
  win.body.append(pad);
  async function draw() {
    const id = `${me.id}_${date}`;
    const e = (await store.get('journal', id)) || { id, childId: me.id, date };
    let dirty = false;
    const markDirty = () => { dirty = true; win.markDirty(true); };
    pad.innerHTML = '';
    const moods = h('div', { class: 'mood-row big' }, ...MOODS.map(([m, l]) => h('button', { class: e.mood === m ? 'on' : '', onclick: ev => { e.mood = m; e.moodLabel = l; moods.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === ev.currentTarget)); sfx('pop'); markDirty(); } }, h('span', {}, m), h('small', {}, l))));
    const grat = h('textarea', { class: 'input', rows: 2, placeholder: 'I am grateful for…', oninput: ev => { e.grateful = ev.target.value; markDirty(); } }, e.grateful || '');
    const learned = h('textarea', { class: 'input', rows: 2, placeholder: 'Today I learned…', oninput: ev => { e.learned = ev.target.value; markDirty(); } }, e.learned || '');
    const prompt = PROMPTS[Math.floor(new Date(date).getTime() / 86400000) % PROMPTS.length];
    const free = h('textarea', { class: 'input journal-page', rows: 8, placeholder: prompt, oninput: ev => { e.text = ev.target.value; markDirty(); } }, e.text || '');
    const save = async () => { e.ts = Date.now(); await store.put('journal', e); dirty = false; win.markDirty(false); if (e.mood) store.log('journal', { mood: e.mood }); };
    win.guard({ isDirty: () => dirty, save, name: () => `your journal for ${fmtDate(date)}` });
    const add = (ta, t) => { ta.value = (ta.value ? ta.value.trimEnd() + ' ' : '') + t; ta.dispatchEvent(new Event('input')); };
    pad.append(
      h('div', { class: 'row' }, h('button', { class: 'btn btn-sm', onclick: async () => { if (dirty) await save(); date = addDays(date, -1); draw(); } }, '◀'), h('h2', { style: { margin: 0, flex: 1, textAlign: 'center' } }, `📔 ${fmtDate(date, { weekday: 'long', day: 'numeric', month: 'long' })}`),
        h('button', { class: 'btn btn-sm', disabled: date >= today(), onclick: async () => { if (dirty) await save(); date = addDays(date, 1); draw(); } }, '▶')),
      h('p', { class: 'small muted', style: { textAlign: 'center' } }, '🔒 Your journal is just for you and Mum & Dad.'),
      h('h4', {}, 'How do I feel?'), moods,
      ['😟', '😢', '😡'].includes(e.mood) ? h('div', { class: 'feedback info' }, '💛 It\'s OK to feel like this. Talking to Mum or Dad can really help.') : null,
      h('h4', {}, '🙏 Something I\'m grateful for'), h('div', { class: 'row' }, grat, micButton(t => add(grat, t))),
      h('h4', {}, '💡 Something I learned'), h('div', { class: 'row' }, learned, micButton(t => add(learned, t))),
      h('h4', {}, `✏️ ${prompt}`), free, h('div', { class: 'row' }, micButton(t => add(free, t), { label: '🎤 Say it', cls: 'btn btn-sm' }), h('span', { class: 'spacer' }), h('button', { class: 'btn btn-primary btn-lg', onclick: async () => { await save(); toast('📔 Saved!', 'good'); sfx('star'); ctx.refresh(); } }, '💾 Save today')));
  }
  await draw();
}
