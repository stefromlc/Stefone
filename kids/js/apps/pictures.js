// Picture Maker — AI image generation for kids (with limits + safety), plus Photo Detective (vision).
import { store } from '../store.js';
import { h, toast, md } from '../util.js';
import { micButton, storedImg, picturesToday, fileToDataUrl, lookAtImage, say, sayButton, sfx } from '../media.js';
import { kidPicture } from './doclib.js';

const STYLES = [['cartoon', '😺 Cartoon', 'bright cartoon style'], ['watercolour', '🎨 Watercolour', 'soft watercolour painting'], ['crayon', '🖍️ Crayon', 'child-like crayon drawing'], ['clay', '🧸 Clay', 'cute 3D clay model'], ['pixel', '👾 Pixel', 'retro pixel art'], ['comic', '💥 Comic', 'comic book style'], ['realistic', '📷 Real', 'realistic, like a nature photo']];
const IDEAS = ['a dragon having a picnic with a teddy bear', 'a castle made of sweets on a cloud', 'a cat astronaut floating past Saturn', 'an underwater school for fish', 'a robot gardener watering giant flowers', 'a penguin surfing a huge wave', 'a treehouse city in a rainforest', 'a unicorn riding a bicycle through a village', 'a friendly monster baking cupcakes', 'a dinosaur at the seaside building sandcastles'];

export async function open(win, ctx, args = {}) {
  const { me, settings } = ctx;
  let tab = 'make', style = 'cartoon', aspect = '1:1', last = null;
  const pad = h('div', { class: 'pm', style: { flex: 1, overflow: 'auto' } });
  const tabs = h('div', { class: 'tabs' });
  win.body.append(tabs, pad);
  const drawTabs = () => { tabs.innerHTML = ''; [['make', '🎨 Make a picture'], ['detective', '🔍 Photo Detective'], ['gallery', '🖼️ My pictures']].forEach(([k, l]) => tabs.append(h('button', { class: tab === k ? 'on' : '', onclick: () => { tab = k; draw(); } }, l))); };

  async function draw() {
    drawTabs(); pad.innerHTML = '';
    if (tab === 'make') return make();
    if (tab === 'detective') return detective();
    return gallery();
  }

  async function make() {
    const limit = settings.media?.kidPicturesPerDay || 0;
    const used = await picturesToday(me.id);
    const prompt = h('textarea', { class: 'input pm-prompt', rows: 2, placeholder: 'Describe your picture… e.g. a fox wearing wellies jumping in puddles' });
    const result = h('div', { class: 'pm-result' }, last ? storedImg(last.id) : h('div', { class: 'pm-empty' }, h('div', { style: { fontSize: '64px' } }, '🎨'), 'Your picture will appear here'));
    const actions = h('div', { class: 'row wrap', style: { justifyContent: 'center' } });
    const styleRow = h('div', { class: 'chip-bank' }, ...STYLES.map(([k, l]) => h('button', { class: `chipx ${style === k ? 'sel' : ''}`, onclick: e => { style = k; styleRow.querySelectorAll('.chipx').forEach(b => b.classList.toggle('sel', b === e.currentTarget)); } }, l)));
    const shapeRow = h('div', { class: 'seg seg-sm' }, ...[['1:1', '⬜ Square'], ['16:9', '▬ Wide'], ['3:4', '▮ Tall']].map(([k, l]) => h('button', { class: aspect === k ? 'on' : '', onclick: e => { aspect = k; shapeRow.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === e.currentTarget)); } }, l)));
    const go = h('button', { class: 'btn btn-primary btn-lg' }, '✨ Make it!');
    const left = h('span', { class: 'small muted' }, limit ? `${Math.max(0, limit - used)} of ${limit} pictures left today` : '');
    pad.append(h('div', { class: 'pm-grid' },
      h('div', { class: 'pm-controls' },
        args.wallpaper ? h('div', { class: 'feedback info' }, '🖼 Make a picture for your desktop wallpaper — choose “Wide”!') : null,
        h('b', {}, '1. What should I paint?'), h('div', { class: 'row' }, prompt, micButton(t => { prompt.value = t; }, { cls: 'btn btn-lg' })),
        h('button', { class: 'btn btn-sm', onclick: () => { prompt.value = IDEAS[Math.floor(Math.random() * IDEAS.length)]; sfx('pop'); } }, '🎲 Give me an idea'),
        h('b', {}, '2. Pick a style'), styleRow, h('b', {}, '3. Pick a shape'), shapeRow,
        h('div', { class: 'row' }, go, left)),
      h('div', {}, result, actions)));
    if (args.wallpaper) { aspect = '16:9'; shapeRow.children[1].click(); }
    const showActions = () => {
      actions.innerHTML = '';
      if (!last) return;
      actions.append(h('button', { class: 'btn', onclick: () => ctx.openApp('paint', { imageId: last.id }) }, '🖌️ Paint on it'),
        h('button', { class: 'btn', onclick: () => { ctx.setWallpaper(null, last.id); toast('🖼 New wallpaper!', 'good'); } }, '🖼 Make it my wallpaper'),
        h('button', { class: 'btn', onclick: () => ctx.openApp('stories', { imageId: last.id }) }, '📚 Start a story'));
    };
    showActions();
    go.onclick = async () => {
      const p = prompt.value.trim();
      if (p.length < 3) return toast('Tell me what to paint first 🙂', 'warn');
      go.disabled = true; go.innerHTML = '<span class="spinner"></span> Painting…';
      result.innerHTML = ''; result.append(h('div', { class: 'pm-empty pm-painting' }, h('div', { class: 'brush-anim' }, '🖌️'), 'Mixing the paints…'));
      try {
        const sty = STYLES.find(s => s[0] === style)[2];
        const { id } = await kidPicture(ctx, `${p}. Style: ${sty}.`, { aspect, source: 'pictures', label: p });
        last = { id, prompt: p };
        result.innerHTML = ''; result.append(storedImg(id));
        sfx('star'); showActions();
        const u = await picturesToday(me.id); if (limit) left.textContent = `${Math.max(0, limit - u)} of ${limit} pictures left today`;
      } catch (e) { result.innerHTML = ''; result.append(h('div', { class: 'pm-empty' }, '😕 ', e.message)); }
      go.disabled = false; go.textContent = '✨ Make it!';
    };
  }

  function detective() {
    const out = h('div', { class: 'md pm-det-out' });
    const img = h('div', { class: 'pm-det-img' }, h('div', { class: 'pm-empty' }, h('div', { style: { fontSize: '56px' } }, '🔍'), 'Take or choose a photo of something you found — a leaf, a bug, a rock, a shell, your model…'));
    const q = h('input', { class: 'input', placeholder: 'What do you want to know? (optional)' });
    let data = null;
    pad.append(h('div', { class: 'pm-grid' },
      h('div', { class: 'pm-controls' }, h('h3', {}, '🔍 Photo Detective'), h('p', { class: 'muted' }, 'Ollie will look at your photo and help you investigate it like a real scientist.'),
        h('label', { class: 'btn btn-lg btn-primary' }, '📷 Choose a photo', h('input', { type: 'file', accept: 'image/*', capture: 'environment', style: { display: 'none' }, onchange: async e => { const f = e.target.files[0]; if (!f) return; data = await fileToDataUrl(f, 1024); img.innerHTML = ''; img.append(h('img', { src: data })); } })),
        h('div', { class: 'row' }, q, micButton(t => { q.value = t; })),
        h('button', { class: 'btn btn-lg', onclick: async e => {
          if (!data) return toast('Choose a photo first', 'warn');
          const b = e.currentTarget; b.disabled = true; out.innerHTML = '<span class="spinner"></span> Investigating…';
          try {
            const r = await lookAtImage({ dataUrl: data, maxTokens: 500, onToken: (_, f) => { out.innerHTML = md(f); },
              system: `You are Ollie the Owl, a curious science buddy for ${me.name}, aged ${me.age || 8} (UK). Look at the photo. In British English and under 120 words: say what you think it is (and how sure you are), share 2 amazing facts, then ask ONE question that makes ${me.name} look more closely or think like a scientist. Keep it safe and friendly; if the photo shows a person or anything unsafe, don't describe them — just suggest asking a grown-up.`,
              question: q.value.trim() || 'What is this? Tell me about it!' });
            out.innerHTML = md(r);
            store.log('detective', { title: q.value.trim() || 'photo' });
          } catch (err) { out.textContent = err.message; }
          b.disabled = false;
        } }, '🔎 Investigate!'),
        h('div', { class: 'row' }, sayButton(() => out.innerText, '🔊 Read it to me'))),
      h('div', {}, img, out)));
  }

  async function gallery() {
    const pics = (await store.list('images', { childId: me.id })).filter(i => i.kind === 'kid').sort((a, b) => b.ts - a.ts);
    if (!pics.length) return pad.append(h('div', { class: 'empty' }, h('span', { class: 'big' }, '🖼️'), 'No pictures yet!'));
    pad.append(h('div', { class: 'gallery', style: { padding: '16px' } }, ...pics.map(p => h('figure', { class: 'gal-item' }, storedImg(p.id), h('figcaption', {}, p.prompt?.replace(/\. Style:.*$/, '').slice(0, 70)),
      h('div', { class: 'row' }, h('button', { class: 'btn btn-sm', onclick: () => ctx.openApp('paint', { imageId: p.id }) }, '🖌️'), h('button', { class: 'btn btn-sm', onclick: () => { ctx.setWallpaper(null, p.id); toast('🖼 New wallpaper!', 'good'); } }, '🖼'))))));
  }

  await draw();
  return { handle: a => { if (a?.wallpaper) { args = a; tab = 'make'; draw(); } } };
}
