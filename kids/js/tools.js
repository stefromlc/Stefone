// Ollie's research tools: live web search (OpenRouter server tool), a kid-friendly encyclopedia,
// real photo search (Wikipedia/Wikimedia lead images) and a safe calculator — run via tool calling.
import { store } from './store.js';
import { AIError, friendly, screenKidMessage } from './ai.js';

const API = 'https://openrouter.ai/api/v1/chat/completions';
const WIKI = (lang = 'simple') => `https://${lang}.wikipedia.org/w/api.php`;
const blockedIn = (text, s) => screenKidMessage(text, s).blocked;

// ───────── safe calculator ─────────
export function calculate(expr) {
  const toks = String(expr).replace(/×/g, '*').replace(/÷/g, '/').replace(/,/g, '').match(/\d+\.?\d*|\.\d+|[+\-*/()^]/g) || [];
  let p = 0;
  const peek = () => toks[p];
  const prim = () => { const t = toks[p++]; if (t === '(') { const v = add(); p++; return v; } if (t === '-') return -prim(); const n = parseFloat(t); if (isNaN(n)) throw new Error('bad'); return n; };
  const pow = () => { let v = prim(); while (peek() === '^') { p++; v = Math.pow(v, prim()); } return v; };
  const mul = () => { let v = pow(); while (peek() === '*' || peek() === '/') { const o = toks[p++]; const r = pow(); v = o === '*' ? v * r : v / r; } return v; };
  const add = () => { let v = mul(); while (peek() === '+' || peek() === '-') { const o = toks[p++]; const r = mul(); v = o === '+' ? v + r : v - r; } return v; };
  const v = add();
  if (p !== toks.length || !isFinite(v)) throw new Error('bad');
  return Math.round(v * 1e6) / 1e6;
}

// ───────── encyclopedia (Simple English Wikipedia, falls back to English) ─────────
export async function encyclopedia(query) {
  for (const lang of ['simple', 'en']) {
    const u = WIKI(lang) + '?' + new URLSearchParams({ action: 'query', format: 'json', origin: '*', generator: 'search', gsrsearch: query, gsrlimit: 3, prop: 'extracts|info', exintro: 1, explaintext: 1, exchars: 1200, inprop: 'url' });
    try {
      const j = await (await fetch(u)).json();
      const pages = Object.values(j.query?.pages || {}).sort((a, b) => a.index - b.index);
      if (pages.length) return pages.map(p => ({ title: p.title, url: p.fullurl, text: (p.extract || '').trim() })).filter(p => p.text);
    } catch { }
  }
  return [];
}

// ───────── pictures (lead images of matching Wikipedia articles) ─────────
export async function findPictures(query, count = 4) {
  const s = await store.settings();
  if (blockedIn(query, s)) return [];
  const out = [];
  for (const lang of ['en', 'simple']) {
    const u = WIKI(lang) + '?' + new URLSearchParams({ action: 'query', format: 'json', origin: '*', generator: 'search', gsrsearch: query, gsrlimit: 10, gsrnamespace: 0, prop: 'pageimages|description|info', piprop: 'thumbnail|name', pithumbsize: 800, pilicense: 'any', inprop: 'url' });
    try {
      const j = await (await fetch(u)).json();
      const pages = Object.values(j.query?.pages || {}).sort((a, b) => a.index - b.index);
      for (const p of pages) {
        if (!p.thumbnail?.source || out.some(o => o.src === p.thumbnail.source)) continue;
        if (/\.svg/i.test(p.pageimage || '') && out.length) continue; // prefer photos over logos/maps
        if (blockedIn(`${p.title} ${p.description || ''}`, s)) continue;
        out.push({ src: p.thumbnail.source, title: p.title, caption: p.description || p.title, url: p.fullurl, credit: 'Wikipedia / Wikimedia Commons' });
        if (out.length >= count) break;
      }
    } catch { }
    if (out.length >= count) break;
  }
  return out;
}

// ───────── tool-calling chat ─────────
const FUNCS = [
  { type: 'function', function: { name: 'encyclopedia', description: 'Look up facts in a children\'s encyclopedia (Simple English Wikipedia). Use for facts about animals, places, history, science, people, sizes, dates.', parameters: { type: 'object', properties: { query: { type: 'string', description: 'what to look up, e.g. "The Shard" or "Big Ben height"' } }, required: ['query'] } } },
  { type: 'function', function: { name: 'show_pictures', description: 'Show the child real photos of something (a place, animal, object, landmark, artwork, planet…). Use whenever the child asks to see something, or when a picture would really help.', parameters: { type: 'object', properties: { query: { type: 'string', description: 'what to show, e.g. "Big Ben"' }, count: { type: 'integer', description: '1-4 pictures', minimum: 1, maximum: 4 } }, required: ['query'] } } },
  { type: 'function', function: { name: 'calculate', description: 'Do exact arithmetic, e.g. "310 / 96" or "(4*12)+3". Use for real-world maths questions (NOT to solve the child\'s homework for them).', parameters: { type: 'object', properties: { expression: { type: 'string' } }, required: ['expression'] } } },
];

export const TOOL_PROMPT = `
TOOLS: You can look things up.
- For real-world facts (heights, sizes, dates, records, animals, places, news, "how many…", "how big…"), use the tools instead of guessing. Prefer the encyclopedia; use web search for very current or very specific facts.
- When the child asks to see something ("show me…", "what does … look like"), call show_pictures. The pictures appear in the chat for them, so say something like "Here's Big Ben!" and point out something to notice.
- For real-world maths (e.g. "how many Big Bens fit in the Shard?"), find the facts, use calculate, then explain simply AND invite the child to check the sum themselves (e.g. "96 + 96 + 96 = ? Can you work it out?").
- Never use tools to do the child's schoolwork for them. Keep all searches child-appropriate.
- Mention where a fact came from in a few words (e.g. "According to Wikipedia…").`;

async function post(body, key) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json', 'HTTP-Referer': location.origin + location.pathname, 'X-Title': 'Stefone Kids Learning' },
    body: JSON.stringify(body),
  }).catch(e => { throw new AIError('Could not reach the AI service. (' + e.message + ')'); });
  if (!res.ok) { let msg; try { msg = (await res.json()).error?.message; } catch { } const err = new AIError(friendly(res.status, msg)); err.status = res.status; err.raw = msg; throw err; }
  const j = await res.json();
  if (j.error) throw new AIError(friendly(j.error.code || 500, j.error.message));
  return j;
}

/**
 * Chat with research tools. Returns { content, pictures:[], sources:[], used:[] }.
 * onStatus(text) is called while tools run.
 */
export async function chatWithTools({ task = 'tutor', messages, maxTokens = 600, temperature = 0.6, onStatus, model: forceModel }) {
  const s = await store.settings();
  if (!s.apiKey) throw new AIError('No AI key set up yet — ask a grown-up to add one in Settings → AI.');
  const model = forceModel || s.models[task] || s.models.tutor;
  const cfg = s.search || {};
  const tools = [...FUNCS.filter(f => f.function.name !== 'show_pictures' || cfg.pictures !== false)];
  if (cfg.web !== false) tools.push({ type: 'openrouter:web_search', parameters: { max_results: cfg.maxResults || 4, max_uses: 2, ...(cfg.excludedDomains?.length ? { excluded_domains: cfg.excludedDomains } : {}) } });
  const msgs = [...messages];
  const pictures = [], sources = [], used = [];
  let webTools = cfg.web !== false;
  for (let round = 0; round < 5; round++) {
    let j;
    try { j = await post({ model, messages: msgs, temperature, max_tokens: maxTokens, tools: tools.length ? tools : undefined }, s.apiKey); }
    catch (e) {
      // If the model/provider rejects tools, retry once without them (plain chat).
      if (round === 0 && (e.status === 400 || e.status === 404) && tools.length) { tools.length = 0; webTools = false; j = await post({ model, messages: msgs, temperature, max_tokens: maxTokens }, s.apiKey); }
      else throw e;
    }
    const m = j.choices?.[0]?.message || {};
    for (const a of m.annotations || []) {
      const c = a.url_citation || a;
      if (c.url && !sources.some(x => x.url === c.url)) sources.push({ url: c.url, title: c.title || new URL(c.url).hostname });
    }
    if (j.usage?.server_tool_use?.web_search_requests) used.push({ name: 'web_search', count: j.usage.server_tool_use.web_search_requests });
    const calls = m.tool_calls || [];
    if (!calls.length) return { content: m.content || '', pictures, sources, used, webTools };
    msgs.push({ role: 'assistant', content: m.content || '', tool_calls: calls });
    for (const call of calls) {
      let args = {}; try { args = JSON.parse(call.function?.arguments || '{}'); } catch { }
      const name = call.function?.name;
      let result;
      try {
        if (name === 'encyclopedia') {
          onStatus?.(`📚 Looking up “${args.query}”…`);
          const r = await encyclopedia(args.query || '');
          r.forEach(p => { if (!sources.some(x => x.url === p.url)) sources.push({ url: p.url, title: `${p.title} (Wikipedia)` }); });
          result = r.length ? r.map(p => `## ${p.title}\n${p.text}`).join('\n\n') : 'Nothing found.';
        } else if (name === 'show_pictures') {
          onStatus?.(`🖼️ Finding pictures of “${args.query}”…`);
          const r = await findPictures(args.query || '', Math.min(4, args.count || 3));
          r.forEach(p => { if (!pictures.some(x => x.src === p.src)) pictures.push(p); });
          result = r.length ? `Showing ${r.length} picture(s) to the child: ${r.map(p => `${p.title} — ${p.caption}`).join('; ')}` : 'No suitable pictures found.';
        } else if (name === 'calculate') {
          onStatus?.('🧮 Working it out…');
          result = `${args.expression} = ${calculate(args.expression)}`;
        } else result = 'Unknown tool.';
      } catch { result = 'That did not work.'; }
      used.push({ name, query: args.query || args.expression });
      msgs.push({ role: 'tool', tool_call_id: call.id, content: String(result).slice(0, 6000) });
    }
  }
  return { content: "I found lots of things! Can you ask me again in a simpler way?", pictures, sources, used, webTools };
}
