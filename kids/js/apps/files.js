// My Files — documents, spreadsheets and drawings.
import { store } from '../store.js';
import { h, fmtDate, confirmDlg, toast } from '../util.js';

const TYPES = { doc: { icon: '📝', app: 'writer', label: 'Writing' }, sheet: { icon: '📊', app: 'sheets', label: 'Spreadsheets' }, drawing: { icon: '🖼️', app: 'paint', label: 'Pictures' } };

export async function open(win, ctx) {
  const pad = h('div', { class: 'app-pad', style: { flex: 1, overflow: 'auto' } });
  win.body.append(h('div', { class: 'app-toolbar' },
    h('button', { class: 'btn btn-sm', onclick: () => ctx.openApp('writer') }, '📝 New writing'),
    h('button', { class: 'btn btn-sm', onclick: () => ctx.openApp('sheets') }, '📊 New spreadsheet'),
    h('button', { class: 'btn btn-sm', onclick: () => ctx.openApp('paint') }, '🖼️ New picture'),
    h('span', { class: 'spacer' }), h('button', { class: 'btn btn-sm', onclick: draw }, '🔄')), pad);
  async function draw() {
    const docs = (await store.list('documents', { childId: ctx.me.id })).sort((a, b) => b.updatedAt - a.updatedAt);
    pad.innerHTML = '';
    if (!docs.length) return pad.append(h('div', { class: 'empty' }, h('span', { class: 'big' }, '📂'), 'Nothing saved yet. Make something amazing!'));
    for (const [type, t] of Object.entries(TYPES)) {
      const list = docs.filter(d => d.type === type);
      if (!list.length) continue;
      const grid = h('div', { class: 'file-grid' });
      list.forEach(d => grid.append(h('div', { class: 'file', onclick: () => ctx.openApp(t.app, { id: d.id, title: d.title }) },
        type === 'drawing' && d.content ? h('img', { src: d.content, style: { width: '100%', height: '70px', objectFit: 'cover', borderRadius: '8px' } }) : h('div', { class: 'e' }, t.icon),
        h('b', {}, d.title), h('span', { class: 'small muted' }, fmtDate(d.updatedAt)), d.submitted ? h('div', { class: 'pill good' }, 'Sent ✓') : null,
        h('button', { class: 'icon-btn del', title: 'Delete', onclick: async e => { e.stopPropagation(); if (await confirmDlg(`Delete "${d.title}"?`, { ok: 'Delete', danger: true })) { await store.remove('documents', d.id); toast('Deleted'); draw(); } } }, '🗑'))));
      pad.append(h('h3', { style: { margin: '14px 0 8px' } }, `${t.icon} ${t.label}`), grid);
    }
  }
  await draw();
  return { handle: draw };
}
