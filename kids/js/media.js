// Multimodal AI via OpenRouter: image generation, vision, text-to-speech and speech-to-text.
// Every feature falls back gracefully (browser voice / browser speech recognition) when not configured.
import { store } from './store.js';
import { AIError, friendly, complete } from './ai.js';
import { h, toast, speak as browserSpeak, sha256, uid } from './util.js';

const BASE = 'https://openrouter.ai/api/v1';

async function auth() {
  const s = await store.settings();
  if (!s.apiKey) throw new AIError('No AI key set up yet — ask a grown-up to add one in Settings → AI.');
  return { s, headers: { 'Authorization': `Bearer ${s.apiKey}`, 'Content-Type': 'application/json', 'HTTP-Referer': location.origin + location.pathname, 'X-Title': 'Stefone Kids Learning' } };
}
async function fail(res) {
  let msg; try { msg = (await res.json()).error?.message; } catch { }
  throw new AIError(friendly(res.status, msg));
}

// ───────────────────────── Images ─────────────────────────
export const KID_STYLE = 'Bright, friendly, colourful children\'s-book illustration, suitable for an 8-year-old. Wholesome and safe: nothing scary, violent, sad or grown-up. No words or letters in the picture.';

/** Resize/compress any image data URL to a JPEG data URL (keeps storage small). */
export function compressDataUrl(dataUrl, max = 960, q = 0.82) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      res(c.toDataURL('image/jpeg', q));
    };
    img.onerror = () => rej(new Error('Could not read that picture'));
    img.src = dataUrl;
  });
}
export function fileToDataUrl(file, max = 1024) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => compressDataUrl(r.result, max).then(res, rej);
    r.onerror = rej; r.readAsDataURL(file);
  });
}

/** Generate a picture. Returns a compressed JPEG data URL. */
export async function generateImage(prompt, { aspect = '1:1', kidSafe = true, quality = 'medium' } = {}) {
  const { s, headers } = await auth();
  const model = s.models.image;
  if (!model) throw new AIError('No picture model chosen — Dad can pick one in Settings → AI.');
  const full = kidSafe ? `${KID_STYLE}\nPicture: ${prompt}` : prompt;
  let res = await fetch(`${BASE}/images`, { method: 'POST', headers, body: JSON.stringify({ model, prompt: full, n: 1, aspect_ratio: aspect, quality, output_format: 'jpeg', output_compression: 82 }) })
    .catch(e => { throw new AIError('Could not reach the picture service. (' + e.message + ')'); });
  let url = null;
  if (res.ok) {
    const j = await res.json();
    const d = j.data?.[0];
    if (d?.b64_json) url = `data:${d.media_type || 'image/png'};base64,${d.b64_json}`;
    else if (d?.url) url = d.url;
  } else if (res.status === 404 || res.status === 400) {
    // Older chat-style image models: modalities on chat completions.
    res = await fetch(`${BASE}/chat/completions`, { method: 'POST', headers, body: JSON.stringify({ model, modalities: ['image', 'text'], messages: [{ role: 'user', content: full }] }) });
    if (!res.ok) await fail(res);
    const j = await res.json();
    url = j.choices?.[0]?.message?.images?.[0]?.image_url?.url || null;
  } else await fail(res);
  if (!url) throw new AIError('The picture model did not return a picture. Try different words.');
  return compressDataUrl(url, 960);
}

const imgCache = new Map();
export async function saveImage(data, meta = {}) {
  const doc = { id: uid('im_'), data, ...meta, ts: Date.now() };
  await store.put('images', doc);
  imgCache.set(doc.id, data);
  return doc.id;
}
export async function loadImage(id) {
  if (!id) return null;
  if (id.startsWith('data:')) return id;
  if (imgCache.has(id)) return imgCache.get(id);
  const d = await store.get('images', id).catch(() => null);
  if (d) imgCache.set(id, d.data);
  return d?.data || null;
}
/** <img> element that lazy-loads a stored image id (or data URL). */
export function storedImg(id, attrs = {}) {
  const img = h('img', { alt: attrs.alt || '', class: attrs.class || '', style: attrs.style || null, loading: 'lazy' });
  loadImage(id).then(src => { if (src) img.src = src; else img.remove(); });
  return img;
}
export async function picturesToday(childId) {
  const d = new Date().toDateString();
  return (await store.list('images', { childId })).filter(i => i.kind === 'kid' && new Date(i.ts).toDateString() === d).length;
}

// ───────────────────────── Vision ─────────────────────────
export async function lookAtImage({ dataUrl, question, system, maxTokens = 600, onToken }) {
  return complete({
    task: 'vision', maxTokens, temperature: 0.4, onToken,
    messages: [
      ...(system ? [{ role: 'system', content: system }] : []),
      { role: 'user', content: [{ type: 'text', text: question }, { type: 'image_url', image_url: { url: dataUrl } }] },
    ],
  });
}

// ───────────────────────── Text to speech ─────────────────────────
let current = null;      // currently playing Audio / source
let aiVoiceBroken = false;
export function stopAudio() {
  try { current?.stop?.(); current?.pause?.(); } catch { }
  current = null;
}
window.__klStopAudio = stopAudio;

function pcmToWav(buf, rate = 24000) {
  const data = new Uint8Array(buf);
  const out = new DataView(new ArrayBuffer(44 + data.length));
  const w = (o, s) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); out.setUint32(4, 36 + data.length, true); w(8, 'WAVE'); w(12, 'fmt ');
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true);
  out.setUint32(24, rate, true); out.setUint32(28, rate * 2, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true);
  w(36, 'data'); out.setUint32(40, data.length, true);
  new Uint8Array(out.buffer, 44).set(data);
  return new Blob([out.buffer], { type: 'audio/wav' });
}

async function ttsBlob(text) {
  const { s, headers } = await auth();
  const key = 'tts:' + await sha256(`${s.models.tts}|${s.voice.ttsVoice}|${text}`);
  let cache = null;
  try { cache = await caches.open('kl-tts'); const hit = await cache.match(new Request(location.origin + '/__tts/' + key)); if (hit) return hit.blob(); } catch { }
  const body = { model: s.models.tts, input: text, voice: s.voice.ttsVoice || undefined, response_format: 'mp3' };
  if (s.voice.speed && s.voice.speed !== 1) body.speed = s.voice.speed;
  let res = await fetch(`${BASE}/audio/speech`, { method: 'POST', headers, body: JSON.stringify(body) });
  let blob;
  if (res.status === 400) {
    // Some voices (e.g. Gemini TTS) only return raw PCM.
    delete body.speed; body.response_format = 'pcm';
    res = await fetch(`${BASE}/audio/speech`, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!res.ok) await fail(res);
    blob = pcmToWav(await res.arrayBuffer());
  } else {
    if (!res.ok) await fail(res);
    blob = await res.blob();
    if (/pcm/.test(res.headers.get('content-type') || '')) blob = pcmToWav(await blob.arrayBuffer());
  }
  try { cache && await cache.put(new Request(location.origin + '/__tts/' + key), new Response(blob.slice(), { headers: { 'content-type': blob.type } })); } catch { }
  return blob;
}

/** Read text aloud: AI voice when switched on (cached), otherwise the browser voice. Returns a promise that resolves when finished. */
export async function say(text, { onStart, onEnd } = {}) {
  stopAudio(); window.speechSynthesis?.cancel();
  const clean = String(text || '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/[#*_`>|~]/g, ' ').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\s+/g, ' ').trim().slice(0, 3000);
  if (!clean) return;
  const s = await store.settings();
  if (s.voice?.aiVoice && s.apiKey && s.models.tts && !aiVoiceBroken) {
    try {
      onStart?.('loading');
      const blob = await ttsBlob(clean);
      const a = new Audio(URL.createObjectURL(blob));
      current = a;
      onStart?.('playing');
      await a.play();
      await new Promise(r => { a.onended = r; a.onpause = r; });
      onEnd?.();
      return;
    } catch (e) {
      console.warn('AI voice failed, using browser voice', e);
      if (e instanceof AIError && /key|credit|model/.test(e.message)) aiVoiceBroken = true;
    }
  }
  onStart?.('playing');
  browserSpeak(clean);
  onEnd?.();
}

/** A "🔊 Read to me" button that toggles play/stop. */
export function sayButton(getText, label = '🔊 Read to me', cls = 'btn') {
  let playing = false;
  const b = h('button', { class: cls, type: 'button' }, label);
  b.onclick = async () => {
    if (playing) { stopAudio(); window.speechSynthesis?.cancel(); playing = false; b.textContent = label; return; }
    playing = true; b.innerHTML = '<span class="spinner"></span>';
    await say(typeof getText === 'function' ? getText() : getText, { onStart: st => { if (st === 'playing') b.textContent = '⏹ Stop'; } });
    playing = false; b.textContent = label;
  };
  return b;
}

// ───────────────────────── Speech to text ─────────────────────────
function encodeWav(samples, rate) {
  const buf = new ArrayBuffer(44 + samples.length * 2); const v = new DataView(buf);
  const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) { const x = Math.max(-1, Math.min(1, samples[i])); v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true); }
  return new Blob([buf], { type: 'audio/wav' });
}

/** Records the microphone to a 16 kHz mono WAV blob. */
export async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  const ac = new (window.AudioContext || window.webkitAudioContext)();
  const src = ac.createMediaStreamSource(stream);
  const proc = ac.createScriptProcessor(4096, 1, 1);
  const chunks = []; let level = 0;
  proc.onaudioprocess = e => { const d = e.inputBuffer.getChannelData(0); chunks.push(new Float32Array(d)); let m = 0; for (let i = 0; i < d.length; i += 64) m = Math.max(m, Math.abs(d[i])); level = m; };
  src.connect(proc); proc.connect(ac.destination);
  return {
    get level() { return level; },
    async stop() {
      proc.disconnect(); src.disconnect(); stream.getTracks().forEach(t => t.stop());
      const rate = ac.sampleRate; await ac.close();
      const len = chunks.reduce((n, c) => n + c.length, 0); const all = new Float32Array(len); let o = 0; chunks.forEach(c => { all.set(c, o); o += c.length; });
      const ratio = rate / 16000, outLen = Math.floor(len / ratio), out = new Float32Array(outLen);
      for (let i = 0; i < outLen; i++) out[i] = all[Math.floor(i * ratio)];
      return { blob: encodeWav(out, 16000), seconds: len / rate };
    },
  };
}

export async function transcribe(blob) {
  const { s, headers } = await auth();
  const b64 = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(',')[1]); fr.readAsDataURL(blob); });
  const res = await fetch(`${BASE}/audio/transcriptions`, { method: 'POST', headers, body: JSON.stringify({ model: s.models.stt, input_audio: { data: b64, format: 'wav' }, language: 'en' }) });
  if (!res.ok) await fail(res);
  return ((await res.json()).text || '').trim();
}

export async function canListen() {
  const s = await store.settings();
  return !!((s.voice?.aiTranscribe && s.apiKey && s.models.stt && navigator.mediaDevices?.getUserMedia) || window.SpeechRecognition || window.webkitSpeechRecognition);
}

/**
 * 🎤 button: tap to start talking, tap again to finish. Uses the AI transcription model when
 * switched on, otherwise the browser's speech recognition. Calls onText(text).
 */
export function micButton(onText, { label = '🎤', cls = 'btn', maxSeconds = 45, title = 'Talk instead of typing' } = {}) {
  const b = h('button', { class: cls, type: 'button', title }, label);
  let rec = null, sr = null, timer = null;
  canListen().then(ok => { if (!ok) b.style.display = 'none'; });
  const reset = () => { clearTimeout(timer); b.classList.remove('recording'); b.textContent = label; rec = null; sr = null; };
  b.onclick = async () => {
    if (rec) { // stop & transcribe
      const r = rec; reset(); b.innerHTML = '<span class="spinner"></span>'; b.disabled = true;
      try { const { blob, seconds } = await r.stop(); if (seconds > 0.6) { const t = await transcribe(blob); if (t) onText(t); else toast("I didn't catch that — try again", 'warn'); } }
      catch (e) { toast(e.message, 'error'); }
      b.disabled = false; b.textContent = label; return;
    }
    if (sr) { sr.stop(); return; }
    const s = await store.settings();
    if (s.voice?.aiTranscribe && s.apiKey && s.models.stt && navigator.mediaDevices?.getUserMedia) {
      try { rec = await startRecording(); b.classList.add('recording'); b.textContent = '⏹ Done'; timer = setTimeout(() => b.click(), maxSeconds * 1000); return; }
      catch (e) { toast('Microphone not available: ' + e.message, 'warn'); rec = null; }
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return toast('Talking is not available on this device', 'warn');
    sr = new SR(); sr.lang = 'en-GB'; sr.interimResults = false;
    b.classList.add('recording'); b.textContent = '⏹ Done';
    sr.onresult = e => onText([...e.results].map(x => x[0].transcript).join(' '));
    sr.onerror = () => toast("I couldn't hear you — try again", 'warn');
    sr.onend = reset;
    sr.start();
  };
  return b;
}

// ───────────────────────── Fun sounds (Web Audio, no files) ─────────────────────────
let actx = null;
export async function sfx(kind = 'click') {
  const s = store._settings;
  if (s && s.sounds === false) return;
  try {
    actx ||= new (window.AudioContext || window.webkitAudioContext)();
    const notes = { click: [[660, .05]], open: [[523, .06], [784, .08]], close: [[784, .05], [523, .07]], good: [[523, .08], [659, .08], [784, .14]], bad: [[330, .12], [262, .18]], star: [[784, .07], [988, .07], [1319, .16]], pop: [[880, .04]] }[kind] || [[600, .05]];
    let t = actx.currentTime;
    for (const [f, d] of notes) {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = 'sine'; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g).connect(actx.destination); o.start(t); o.stop(t + d + 0.02); t += d * 0.9;
    }
  } catch { }
}

// ───────────────────────── Lesson illustrations ─────────────────────────
/** Generates a cover + section pictures for a lesson (mutates it). Failures are non-fatal. */
export async function illustrateLesson(lesson, { max, onStage } = {}) {
  const s = await store.settings();
  if (!s.media?.lessonImages || !s.models.image || !s.apiKey) return 0;
  const limit = max ?? s.media.lessonImageCount ?? 3;
  const jobs = [];
  if (lesson.coverImagePrompt && !lesson.coverImageId) jobs.push({ prompt: lesson.coverImagePrompt, aspect: '16:9', set: id => { lesson.coverImageId = id; } });
  for (const sec of lesson.sections) if (sec.imagePrompt && !sec.imageId) jobs.push({ prompt: sec.imagePrompt, aspect: '4:3', set: id => { sec.imageId = id; } });
  let made = 0;
  for (const j of jobs.slice(0, limit)) {
    onStage?.(`Painting picture ${made + 1} of ${Math.min(limit, jobs.length)}…`);
    try { const data = await generateImage(`${j.prompt} (for a lesson about ${lesson.topic || lesson.title})`, { aspect: j.aspect }); j.set(await saveImage(data, { kind: 'lesson', prompt: j.prompt })); made++; }
    catch (e) { console.warn('illustration failed', e); if (/key|credit|model/i.test(e.message)) break; }
  }
  return made;
}
