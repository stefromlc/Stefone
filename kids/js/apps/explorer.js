// Explorer — a safe, kid-friendly browser: Simple English Wikipedia + parent-approved sites.
import { store } from '../store.js';
import { h, esc, toast, stopSpeaking } from '../util.js';
import { say } from '../media.js';

const WIKI = 'https://simple.wikipedia.org/w/api.php';

export async function open(win, ctx, args = {}) {
  const { settings } = ctx;
  const hist = []; let pos = -1;
  const addr = h('input', { class: 'addr', placeholder: '🔎 Search for anything… (e.g. volcanoes, Romans, sharks)' });
  const bBack = h('button', { class: 'tb', title: 'Back', onclick: () => nav(pos - 1) }, '⬅');
  const bFwd = h('button', { class: 'tb', title: 'Forward', onclick: () => nav(pos + 1) }, '➡');
  const bHome = h('button', { class: 'tb', title: 'Home', onclick: () => go({ kind: 'home' }) }, '🏠');
  const bRead = h('button', { class: 'tb', title: 'Read to me' }, '🔊');
  const bAsk = h('button', { class: 'tb', title: 'Ask the helper about this page' }, '🦉');
  const page = h('div', { class: 'browser-page' });
  win.body.append(h('div', { class: 'browser-bar' }, bBack, bFwd, bHome, addr, bRead, bAsk), page);
  addr.addEventListener('keydown', e => { if (e.key === 'Enter' && addr.value.trim()) go({ kind: 'search', q: addr.value.trim() }); });
  addr.addEventListener('focus', () => addr.select());
  win.onClose(() => stopSpeaking());

  const blocked = text => (settings.safety?.blockedWords || []).some(w => w && new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(text));
  function go(state) { hist.splice(pos + 1); hist.push(state); pos = hist.length - 1; show(state); }
  function nav(i) { if (i < 0 || i >= hist.length) return; pos = i; show(hist[pos]); }
  let current = { text: '', title: '' };

  async function show(st) {
    stopSpeaking();
    bBack.disabled = pos <= 0; bFwd.disabled = pos >= hist.length - 1;
    page.innerHTML = ''; page.scrollTop = 0;
    current = { text: '', title: '' };
    if (st.kind === 'home') return home();
    if (st.kind === 'search') return search(st.q);
    if (st.kind === 'article') return article(st.title);
    if (st.kind === 'site') return site(st.site);
  }

  function home() {
    addr.value = '';
    const sites = settings.safety?.allowedSites || [];
    const q = h('input', { class: 'input big-input', placeholder: 'What do you want to find out about?', style: { maxWidth: '520px' } });
    q.addEventListener('keydown', e => { if (e.key === 'Enter' && q.value.trim()) go({ kind: 'search', q: q.value.trim() }); });
    page.append(h('div', { class: 'wiki-home' },
      h('div', { style: { fontSize: '64px' } }, '🧭'), h('h1', {}, 'Explorer'), h('p', { class: 'muted' }, 'Search a kids\' encyclopedia, or visit a website Mum & Dad have chosen.'),
      h('div', { class: 'row', style: { justifyContent: 'center' } }, q, h('button', { class: 'btn btn-primary btn-lg', onclick: () => q.value.trim() && go({ kind: 'search', q: q.value.trim() }) }, 'Search')),
      h('div', { class: 'row', style: { justifyContent: 'center', marginTop: '12px' } }, h('button', { class: 'btn', onclick: random }, '🎲 Surprise me!')),
      sites.length ? h('div', {}, h('h3', { style: { marginTop: '30px' } }, '⭐ Websites from Mum & Dad'), h('div', { class: 'site-tiles' }, ...sites.map(s => h('button', { onclick: () => go({ kind: 'site', site: s }) }, h('span', { class: 'e' }, s.icon || '🌐'), s.name)))) : null));
    setTimeout(() => q.focus(), 50);
  }

  async function wiki(params) {
    const url = WIKI + '?' + new URLSearchParams({ format: 'json', origin: '*', ...params });
    const r = await fetch(url);
    if (!r.ok) throw new Error('Could not load the page');
    return r.json();
  }
  const loading = () => { page.innerHTML = '<div class="empty"><span class="spinner"></span> Loading…</div>'; };
  const oops = msg => { page.innerHTML = `<div class="empty"><span class="big">🙈</span>${esc(msg)}</div>`; };

  async function search(q) {
    addr.value = q;
    if (blocked(q)) { store.log('browse_blocked', { q }); return oops("Let's search for something else! Try animals, space, history or science."); }
    loading();
    store.log('browse_search', { q });
    try {
      const d = await wiki({ action: 'query', list: 'search', srsearch: q, srlimit: 15, srprop: 'snippet' });
      const res = (d.query?.search || []).filter(r => !blocked(r.title + ' ' + r.snippet));
      page.innerHTML = '';
      const box = h('div', { class: 'wiki' }, h('h2', {}, `Results for "${q}"`));
      if (!res.length) box.append(h('p', {}, 'No pages found. Try a different word or check the spelling.'));
      res.forEach(r => {
        const sn = h('div', { class: 'small muted' }); sn.innerHTML = window.DOMPurify.sanitize(r.snippet + '…', { ALLOWED_TAGS: ['span'] });
        box.append(h('div', { class: 'result', onclick: () => go({ kind: 'article', title: r.title }) }, h('b', {}, r.title), sn));
      });
      page.append(box);
    } catch (e) { oops('Explorer could not connect. Check the internet and try again.'); }
  }

  async function random() {
    try { const d = await wiki({ action: 'query', list: 'random', rnnamespace: 0, rnlimit: 5 }); const pick = (d.query?.random || []).find(r => !blocked(r.title)); if (pick) go({ kind: 'article', title: pick.title }); }
    catch { toast('Could not connect', 'error'); }
  }

  async function article(title) {
    addr.value = title;
    if (blocked(title)) return oops("Let's look at something else!");
    loading();
    try {
      const d = await wiki({ action: 'parse', page: title, prop: 'text|displaytitle', redirects: 1, disableeditsection: 1 });
      if (d.error) return oops("Couldn't find that page.");
      const tmp = document.createElement('div');
      tmp.innerHTML = window.DOMPurify.sanitize(d.parse.text['*'], { FORBID_TAGS: ['style', 'form', 'input'] });
      tmp.querySelectorAll('.reference, .reflist, .references, .mw-editsection, .navbox, .metadata, .ambox, #toc, .toc, .noprint, .mw-empty-elt, sup, .sistersitebox, .portal').forEach(n => n.remove());
      tmp.querySelectorAll('img').forEach(img => { const s = img.getAttribute('src'); if (s?.startsWith('//')) img.src = 'https:' + s; img.removeAttribute('srcset'); img.loading = 'lazy'; });
      ['Related pages', 'References', 'Other websites', 'Notes', 'Sources'].forEach(hd => { const el = [...tmp.querySelectorAll('h2')].find(x => x.textContent.trim().startsWith(hd)); if (el) { let n = el.closest('.mw-heading') || el; while (n.nextSibling) n.nextSibling.remove(); n.remove(); } });
      tmp.querySelectorAll('a').forEach(a => {
        const href = a.getAttribute('href') || '';
        if (href.startsWith('/wiki/') && !/^\/wiki\/(File|Category|Help|Template|Special|Wikipedia|Portal|Talk):/.test(href)) {
          a.href = '#'; a.dataset.wiki = decodeURIComponent(href.slice(6)).replace(/_/g, ' ');
        } else { a.replaceWith(...a.childNodes); }
      });
      page.innerHTML = '';
      const box = h('div', { class: 'wiki' }, h('h1', {}, d.parse.title));
      box.append(...tmp.childNodes);
      page.append(box);
      box.addEventListener('click', e => { const a = e.target.closest('a[data-wiki]'); if (a) { e.preventDefault(); go({ kind: 'article', title: a.dataset.wiki }); } });
      current = { title: d.parse.title, text: [...box.querySelectorAll('p')].map(p => p.textContent).join('\n').trim() };
      store.log('browse', { title: d.parse.title });
    } catch (e) { oops('Explorer could not load that page.'); }
  }

  function site(s) {
    addr.value = s.url;
    store.log('browse_site', { title: s.name });
    page.append(h('div', { class: 'feedback info', style: { margin: '8px', fontSize: '.9em', display: 'flex', gap: '10px', alignItems: 'center' } },
      `🌐 ${s.name}`, h('span', { class: 'spacer' }), 'Page blank? Some websites won\'t open inside Explorer —', h('a', { href: s.url, target: '_blank', rel: 'noopener', class: 'btn btn-sm' }, 'Open in a new tab')),
      h('iframe', { src: s.url, sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups', referrerpolicy: 'no-referrer', style: { height: 'calc(100% - 60px)' } }));
  }

  bRead.onclick = () => { if (!current.text) return toast('Open a page first 🙂'); say(current.title + '. ' + current.text.slice(0, 1800)); };
  bAsk.onclick = () => ctx.openApp('helper', { context: current.title ? `${ctx.me.name} is reading the encyclopedia page "${current.title}":\n${current.text.slice(0, 1500)}` : '' });

  go(args.q ? { kind: 'search', q: args.q } : { kind: 'home' });
  return { handle: a => a?.q && go({ kind: 'search', q: a.q }) };
}
