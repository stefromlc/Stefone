// Notes to kids — appear as sticky notes on their desktop.
import { store } from '../store.js';
import { h, toast, timeAgo, uid } from '../util.js';
import { header, state, kidById, rerender } from './shell.js';

export async function render(main) {
  header(main, '💌 Notes to the kids');
  const text = h('textarea', { class: 'input', rows: 3, placeholder: 'e.g. "Super work on your fractions yesterday! Remember to do your reading after lunch 📚"' });
  const chosen = new Set(state.kids.map(k => k.id));
  const checks = state.kids.map(k => h('label', { class: 'check', style: { display: 'inline-flex', marginRight: '12px' } }, h('input', { type: 'checkbox', checked: true, onchange: e => (e.target.checked ? chosen.add(k.id) : chosen.delete(k.id)) }), `${k.avatar} ${k.name}`));
  const quick = ['Well done today! ⭐', "I'm so proud of you! ❤️", "Don't forget your reading 📚", 'Time for a break — go and play! 🌳', 'Great effort — keep going! 💪'];
  main.append(h('div', { class: 'card' }, h('div', { class: 'field' }, h('span', {}, 'To'), h('div', {}, ...checks)), text,
    h('div', { class: 'row wrap', style: { margin: '8px 0' } }, ...quick.map(q => h('button', { class: 'btn btn-sm', onclick: () => { text.value = q; } }, q))),
    h('div', { class: 'row' }, h('span', { class: 'spacer' }), h('button', { class: 'btn btn-primary', onclick: async () => {
      if (!text.value.trim() || !chosen.size) return toast('Write a note and pick who it is for', 'warn');
      for (const id of chosen) await store.put('notes', { id: uid('nt_'), childId: id, from: state.me.name, fromAvatar: state.me.avatar, text: text.value.trim(), ts: Date.now(), read: false });
      toast('💌 Sent — it will pop up on their desktop', 'good'); rerender();
    } }, 'Send note'))));
  const notes = (await store.list('notes')).sort((a, b) => b.ts - a.ts).slice(0, 40);
  main.append(h('div', { class: 'card', style: { marginTop: '14px' } }, h('h3', {}, 'Sent notes'),
    ...(notes.length ? notes.map(n => h('div', { class: 'feed-item' }, h('span', {}, kidById(n.childId)?.avatar || ''), h('span', { style: { flex: 1 } }, h('b', {}, `${n.from}: `), n.text), h('span', { class: `pill ${n.read ? 'good' : ''}` }, n.read ? 'Read ✓' : 'Unread'), h('span', { class: 'small muted' }, timeAgo(n.ts)),
      h('button', { class: 'icon-btn', title: 'Delete', onclick: async () => { await store.remove('notes', n.id); rerender(); } }, '🗑'))) : [h('p', { class: 'muted' }, 'No notes yet.')])));
}
