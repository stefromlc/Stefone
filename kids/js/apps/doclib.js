// Shared helpers for kids' document apps: naming, open dialog, AI pictures with daily limits.
import { store } from '../store.js';
import { h, modal, toast, fmtDate, timeAgo } from '../util.js';
import { generateImage, saveImage, picturesToday } from '../media.js';
import { screenKidMessage } from '../ai.js';

export const DOC_TYPES = {
  doc: { icon: '📝', app: 'writer', label: 'Writing' },
  sheet: { icon: '📊', app: 'sheets', label: 'Spreadsheets' },
  drawing: { icon: '🖼️', app: 'paint', label: 'Pictures' },
  story: { icon: '📚', app: 'stories', label: 'Story books' },
  code: { icon: '🐢', app: 'code', label: 'Code' },
  song: { icon: '🎵', app: 'music', label: 'Songs' },
};

/** Kid-friendly "name your work" dialog. Resolves to a name or null. */
export function nameIt(current = '', what = 'work') {
  // When the desktop is saving everything automatically (e.g. screen time is up), don't wait for a child to type a name.
  if (window.__klAutoName) return Promise.resolve(current || `My ${what} – ${fmtDate(Date.now(), { day: 'numeric', month: 'short' })} ${new Date().toTimeString().slice(0, 5)}`);
  return new Promise(res => {
    const inp = h('input', { class: 'input big-input', value: current, placeholder: 'e.g. My dragon story', maxlength: 60 });
    let done = false;
    const ok = () => { const v = inp.value.trim(); if (!v) { toast('Give it a name first 🙂', 'warn'); return false; } done = true; res(v); };
    const m = modal({ title: `💾 Name your ${what}`, cls: 'modal-kid', body: h('div', {}, h('p', {}, 'What shall we call it?'), inp), actions: [{ label: 'Cancel' }, { label: '💾 Save', cls: 'btn-primary', onClick: ok }], onClose: () => { if (!done) res(null); } });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter' && ok() !== false) m.close(); });
    setTimeout(() => inp.select(), 40);
  });
}

/** "Open" dialog listing a child's saved documents of one type. */
export async function openPicker(ctx, type) {
  const t = DOC_TYPES[type];
  const docs = (await store.list('documents', { childId: ctx.me.id })).filter(d => d.type === type).sort((a, b) => b.updatedAt - a.updatedAt);
  const grid = h('div', { class: 'file-grid' });
  const m = modal({ title: `📂 Open ${t.label.toLowerCase()}`, wide: true, body: grid, actions: [{ label: 'Close' }] });
  if (!docs.length) grid.append(h('p', { class: 'muted' }, 'Nothing saved yet.'));
  docs.forEach(d => grid.append(h('button', { class: 'file', onclick: () => { m.close(); ctx.openApp(t.app, { id: d.id, title: d.title }); } },
    d.type === 'drawing' && d.content ? h('img', { src: d.content, class: 'file-thumb' }) : h('div', { class: 'e' }, t.icon),
    h('b', {}, d.title), h('span', { class: 'small muted' }, timeAgo(d.updatedAt)))));
}

/** Make an AI picture for a child (checks parent limits + blocked words). Returns { data, id }. */
export async function kidPicture(ctx, prompt, { aspect = '1:1', source = 'app', label } = {}) {
  const s = await store.settings();
  if (!s.media?.kidPictures) throw new Error('Making pictures is switched off — ask Mum or Dad.');
  if (!s.models.image) throw new Error('No picture model has been chosen yet — ask Dad.');
  const check = screenKidMessage(label || prompt, s);
  if (check.blocked) { store.log('picture_blocked', { prompt }); throw new Error("Let's make a picture of something else! 🙂"); }
  const used = await picturesToday(ctx.me.id);
  const limit = s.media.kidPicturesPerDay || 0;
  if (limit && used >= limit) throw new Error(`That's all ${limit} pictures for today! You can draw one in Paint instead 🖌️`);
  const data = await generateImage(prompt, { aspect });
  const id = await saveImage(data, { kind: 'kid', childId: ctx.me.id, prompt: label || prompt, fullPrompt: prompt, source });
  store.log('picture', { prompt: label || prompt, source });
  return { data, id };
}
