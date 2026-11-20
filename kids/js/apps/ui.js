// Shared kid UI pieces: picture grids with a full-screen viewer, source chips.
import { h } from '../util.js';
import { say } from '../media.js';

export function lightbox(pics, start = 0) {
  let i = start;
  const img = h('img', { class: 'lb-img', alt: '' });
  const cap = h('div', { class: 'lb-cap' });
  const back = h('div', { class: 'lightbox', onclick: e => { if (e.target === back) close(); } });
  const draw = () => {
    const p = pics[i];
    img.src = p.src; img.alt = p.title || '';
    cap.innerHTML = '';
    cap.append(h('b', {}, p.title || ''), p.caption && p.caption !== p.title ? h('div', {}, p.caption) : null, h('div', { class: 'small', style: { opacity: .7 } }, `📷 ${p.credit || ''}`),
      h('div', { class: 'row', style: { justifyContent: 'center', marginTop: '6px' } }, h('button', { class: 'btn btn-sm', onclick: () => say(`${p.title}. ${p.caption || ''}`) }, '🔊'), p.url ? h('a', { class: 'btn btn-sm', href: p.url, target: '_blank', rel: 'noopener' }, 'ℹ️ Read more') : null));
  };
  const nav = d => { i = (i + d + pics.length) % pics.length; draw(); };
  const onKey = e => { if (e.key === 'Escape') close(); if (e.key === 'ArrowRight') nav(1); if (e.key === 'ArrowLeft') nav(-1); };
  const close = () => { back.remove(); document.removeEventListener('keydown', onKey); };
  back.append(h('button', { class: 'lb-x', onclick: close }, '✕'), pics.length > 1 ? h('button', { class: 'lb-nav lb-prev', onclick: () => nav(-1) }, '‹') : null, img, pics.length > 1 ? h('button', { class: 'lb-nav lb-next', onclick: () => nav(1) }, '›') : null, cap);
  document.addEventListener('keydown', onKey);
  document.body.append(back);
  draw();
}

export function pictureGrid(pics, { big = false } = {}) {
  const g = h('div', { class: `pic-grid ${big ? 'big' : ''} n${Math.min(pics.length, 4)}` });
  pics.forEach((p, i) => g.append(h('button', { class: 'pic', title: p.title, onclick: () => lightbox(pics, i) },
    h('img', { src: p.src, alt: p.title || '', loading: 'lazy', onerror: e => e.currentTarget.parentElement.remove() }), h('span', { class: 'pic-cap' }, p.title || ''))));
  return g;
}

export function sourceChips(sources) {
  return h('div', { class: 'sources' }, h('span', { class: 'small muted' }, '📚 '), ...sources.slice(0, 5).map(s => {
    let host = ''; try { host = new URL(s.url).hostname.replace(/^www\./, ''); } catch { }
    return h('a', { class: 'src-chip', href: s.url, target: '_blank', rel: 'noopener', title: s.title }, host || s.title);
  }));
}
