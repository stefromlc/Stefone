// My Files — everything a child has saved, plus their AI picture gallery.
import { store } from '../store.js';
import { h, timeAgo, confirmDlg, toast } from '../util.js';
import { DOC_TYPES } from './doclib.js';
import { storedImg } from '../media.js';

export async function open(win, ctx) {
  const pad = h('div', { class: 'app-pad', style: { flex: 1, overflow: 'auto' } });
  let tab = 'all';
  const tabs = h('div', { class: 'tabs' });
  win.body.append(h('div', { class: 'app-toolbar' },
    h('button', { class: 'btn btn-sm', onclick: () => ctx.openApp('writer') }, '📝 New writing'),
    h('button', { class: 'btn btn-sm', onclick: () => ctx.openApp('sheets') }, '📊 New spreadsheet'),
    h('button', { class: 'btn btn-sm', onclick: () => ctx.openApp('paint') }, '🖌️ New picture'),
    h('button', { class: 'btn btn-sm', onclick: () => ctx.openApp('stories') }, '📚 New story'),
    h('span', { class: 'spacer' }), h('button', { class: 'btn btn-sm', title: 'Refresh', onclick: draw }, '🔄')), tabs, pad);
  async function draw() {
    const [docs, imgs] = await Promise.all([store.list('documents', { childId: ctx.me.id }), store.list('images', { childId: ctx.me.id })]);
    docs.sort((a, b) => b.updatedAt - a.updatedAt);
    const pics = imgs.filter(i => i.kind === 'kid').sort((a, b) => b.ts - a.ts);
    tabs.innerHTML = '';
    [['all', `🗂 Everything (${docs.length})`], ...Object.entries(DOC_TYPES).filter(([k]) => docs.some(d => d.type === k)).map(([k, t]) => [k, `${t.icon} ${t.label}`]), ['pics', `🎨 AI pictures (${pics.length})`]]
      .forEach(([k, l]) => tabs.append(h('button', { class: tab === k ? 'on' : '', onclick: () => { tab = k; draw(); } }, l)));
    pad.innerHTML = '';
    if (tab === 'pics') {
      if (!pics.length) return pad.append(h('div', { class: 'empty' }, h('span', { class: 'big' }, '🎨'), 'Pictures you make with Picture Maker appear here.'));
      const g = h('div', { class: 'gallery' });
      pics.forEach(p => g.append(h('figure', { class: 'gal-item' }, storedImg(p.id), h('figcaption', {}, p.prompt?.slice(0, 60) || ''),
        h('div', { class: 'row' }, h('button', { class: 'btn btn-sm', onclick: () => ctx.openApp('paint', { imageId: p.id }) }, '🖌️ Paint on it'), h('button', { class: 'btn btn-sm', onclick: () => { ctx.setWallpaper(null, p.id); toast('🖼 New wallpaper!', 'good'); } }, '🖼 Wallpaper')))));
      return pad.append(g);
    }
    const list = docs.filter(d => tab === 'all' || d.type === tab);
    if (!list.length) return pad.append(h('div', { class: 'empty' }, h('span', { class: 'big' }, '📂'), 'Nothing saved yet. Make something amazing!'));
    const grid = h('div', { class: 'file-grid' });
    list.forEach(d => {
      const t = DOC_TYPES[d.type] || { icon: '📄', app: 'writer' };
      const thumb = d.type === 'drawing' && d.content ? h('img', { src: d.content, class: 'file-thumb' }) : d.type === 'story' && d.coverImageId ? storedImg(d.coverImageId, { class: 'file-thumb' }) : h('div', { class: 'e' }, t.icon);
      grid.append(h('div', { class: 'file', onclick: () => ctx.openApp(t.app, { id: d.id, title: d.title }) }, thumb,
        h('b', {}, d.title || 'Untitled'), h('span', { class: 'small muted' }, timeAgo(d.updatedAt)), d.submitted ? h('div', { class: 'pill good' }, d.reviewed ? '💬 Seen' : 'Sent ✓') : null,
        h('button', { class: 'icon-btn del', title: 'Delete', onclick: async e => { e.stopPropagation(); if (await confirmDlg(`Delete "${d.title}"?`, { ok: 'Delete', danger: true })) { await store.remove('documents', d.id); toast('Deleted'); draw(); } } }, '🗑')));
    });
    pad.append(grid);
  }
  await draw();
  return { handle: draw };
}
