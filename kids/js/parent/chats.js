// Helper chat logs — every conversation is visible to parents; flagged ones first.
import { store } from '../store.js';
import { h, md, fmtDate, fmtTime, timeAgo, toast } from '../util.js';
import { header, state, kidById, refreshBadges, rerender } from './shell.js';

export async function render(main) {
  header(main, '🦉 Helper chats', { kidSwitch: true, all: true });
  const all = await store.list('chats');
  const chats = all.filter(c => state.kidId === 'all' || c.childId === state.kidId).sort((a, b) => (b.flagged && !b.flagSeen) - (a.flagged && !a.flagSeen) || b.updatedAt - a.updatedAt);
  const today = new Date().toDateString();
  const msgsToday = chats.reduce((n, c) => n + c.messages.filter(m => m.role === 'user' && new Date(m.ts).toDateString() === today).length, 0);
  main.append(h('p', { class: 'muted' }, `${chats.length} conversations · ${msgsToday} questions asked today · The helper is told never to hand out answers, and to flag anything worrying.`));
  const layout = h('div', { class: 'grid2', style: { gridTemplateColumns: 'minmax(260px, 1fr) 2fr', alignItems: 'start' } });
  const list = h('div', { class: 'card', style: { padding: '8px' } });
  const view = h('div', { class: 'card' }, h('p', { class: 'muted' }, 'Pick a conversation.'));
  layout.append(list, view);
  main.append(layout);
  if (!chats.length) list.append(h('p', { class: 'muted', style: { padding: '10px' } }, 'No chats yet.'));
  chats.forEach(c => {
    const kid = kidById(c.childId);
    list.append(h('div', { class: 'result', onclick: () => show(c) },
      h('div', { class: 'row' }, h('span', {}, kid?.avatar), h('b', { style: { flex: 1, color: 'var(--ink)' } }, c.title || 'Chat'), c.flagged && !c.flagSeen ? h('span', { class: 'pill bad' }, '🚩') : c.flagged ? h('span', { class: 'pill' }, '🚩 seen') : null),
      h('div', { class: 'small muted' }, `${c.messages.length} messages · ${timeAgo(c.updatedAt)}`)));
  });
  function show(c) {
    const kid = kidById(c.childId);
    view.innerHTML = '';
    view.append(h('div', { class: 'row' }, h('h3', { style: { margin: 0, flex: 1 } }, `${kid?.avatar || ''} ${c.title || 'Chat'}`), h('span', { class: 'small muted' }, fmtDate(c.createdAt))));
    if (c.flagged) view.append(h('div', { class: 'alert bad', style: { marginTop: '10px' } }, '🚩', h('div', { style: { flex: 1 } }, h('b', {}, 'Flagged: '), (c.flagReasons || []).join('; ')),
      !c.flagSeen ? h('button', { class: 'btn btn-sm', onclick: async () => { c.flagSeen = true; c.flagSeenBy = state.me.name; await store.put('chats', c); toast('Marked as seen'); refreshBadges(); rerender(); } }, 'Mark as seen') : null));
    if (c.context) view.append(h('div', { class: 'alert info small' }, '📌', h('div', {}, 'Context: ', c.context.slice(0, 300))));
    const log = h('div', { class: 'chat-log', style: { maxHeight: '60vh', borderRadius: '12px', marginTop: '10px' } });
    c.messages.forEach(m => {
      const b = h('div', { class: `msg ${m.role} ${m.flagged ? 'flagged' : ''}` });
      if (m.role === 'assistant') b.append(h('div', { class: 'md', html: md(m.content) })); else b.textContent = m.content;
      b.append(h('div', { class: 'small', style: { opacity: .6, marginTop: '4px' } }, fmtTime(m.ts)));
      log.append(b);
    });
    view.append(log);
  }
  if (chats[0]) show(chats[0]);
}
