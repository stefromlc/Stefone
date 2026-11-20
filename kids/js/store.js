// Data + auth layer. Two interchangeable backends:
//   LocalBackend  – IndexedDB in this browser (zero setup, one device)
//   CloudBackend  – Supabase (real logins, sync across devices)
import CONFIG from './config.js';
import { uid, sha256 } from './util.js';

const NS = 'kl1';
const LS = {
  get(k, d = null) { try { const v = localStorage.getItem(`${NS}:${k}`); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(`${NS}:${k}`, JSON.stringify(v)); } catch { /* storage full or blocked */ } },
  del(k) { try { localStorage.removeItem(`${NS}:${k}`); } catch { } },
};
export { LS };

export const DEFAULT_SETTINGS = {
  id: 'global',
  apiKey: '',
  models: {
    lessons: 'anthropic/claude-sonnet-5.5',
    analysis: 'anthropic/claude-sonnet-5.5',
    tutor: 'anthropic/claude-haiku-5.5',
    marking: 'anthropic/claude-haiku-5.5',
    vision: 'anthropic/claude-haiku-5.5',
    image: 'google/gemini-2.5-flash-image',
    tts: 'mistralai/voxtral-mini-tts-2603',
    stt: 'openai/whisper-large-v3',
  },
  voice: { aiVoice: true, ttsVoice: 'en_paul_neutral', aiTranscribe: true, speed: 1 },
  media: { kidPictures: true, kidPicturesPerDay: 15, lessonImages: true, lessonImageCount: 3 },
  sounds: true,
  search: { enabled: true, web: true, pictures: true, maxResults: 4, excludedDomains: ['reddit.com', '4chan.org', 'x.com', 'twitter.com', 'tiktok.com', 'facebook.com', 'instagram.com', 'youtube.com'] },
  widgets: { allowHide: true },
  apps: { disabled: {} },
  curriculum: 'National Curriculum for England (Key Stage 2)',
  helper: { mode: 'balanced', dailyMessageLimit: 120, name: 'Ollie the Owl', allowVoice: true },
  safety: {
    blockedWords: ['kill', 'suicide', 'porn', 'sex', 'naked', 'drugs', 'gun', 'murder', 'nazi'],
    allowedSites: [
      { name: 'BBC Bitesize', url: 'https://www.bbc.co.uk/bitesize/primary', icon: '📘' },
      { name: 'NASA Space Place', url: 'https://spaceplace.nasa.gov/', icon: '🚀' },
      { name: 'National Geographic Kids', url: 'https://www.natgeokids.com/uk/', icon: '🐾' },
      { name: 'Topmarks Maths', url: 'https://www.topmarks.co.uk/maths-games/7-11-years/', icon: '➗' },
    ],
  },
  schedule: { enabled: false, start: '08:30', end: '15:30', days: [1, 2, 3, 4, 5], dailyLimitMins: 0 },
  rewards: { starsPerLesson: 3 },
};

function mergeDeep(base, over) {
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const [k, v] of Object.entries(over || {})) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])
      ? mergeDeep(base[k], v) : v;
  }
  return out;
}

const publicProfile = p => { if (!p) return p; const { secretHash, salt, ...rest } = p; return rest; };
const kidSecret = (role, s) => (role === 'child' ? `kl-${s}-pin` : s);

// ─────────────────────────── Local (IndexedDB) ───────────────────────────
class LocalBackend {
  mode = 'local';
  async init() {
    this.db = await new Promise((res, rej) => {
      const r = indexedDB.open(`${NS}-db`, 1);
      r.onupgradeneeded = () => {
        const s = r.result.createObjectStore('records', { keyPath: 'key' });
        s.createIndex('collection', 'collection');
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  _tx(mode = 'readonly') { return this.db.transaction('records', mode).objectStore('records'); }
  _req(r) { return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
  async list(collection, where = {}) {
    const rows = await this._req(this._tx().index('collection').getAll(collection));
    const keys = Object.entries(where);
    return rows.map(r => r.data).filter(d => keys.every(([k, v]) => d[k] === v));
  }
  async get(collection, id) { const r = await this._req(this._tx().get(`${collection}/${id}`)); return r ? r.data : null; }
  async put(collection, doc) { await this._req(this._tx('readwrite').put({ key: `${collection}/${doc.id}`, collection, data: doc })); return doc; }
  async remove(collection, id) { await this._req(this._tx('readwrite').delete(`${collection}/${id}`)); }
  async clearAll() { await this._req(this._tx('readwrite').clear()); }

  // auth
  async needsSetup() { return (await this.list('profiles')).length === 0; }
  async roster() { return (await this.list('profiles')).map(publicProfile); }
  async listProfiles() { return this.roster(); }
  async _hash(secret, salt) { return sha256(`${salt}:${secret}`); }
  async createUser({ secret, ...p }) {
    const salt = uid();
    const doc = { id: p.id || uid('u_'), createdAt: Date.now(), ...p, salt, secretHash: await this._hash(secret, salt) };
    await this.put('profiles', doc);
    return publicProfile(doc);
  }
  async setupAdmin(p) { return this.createUser({ ...p, role: 'admin' }); }
  async login({ id, secret }) {
    const p = await this.get('profiles', id);
    if (!p) throw new Error('User not found');
    if ((await this._hash(secret, p.salt)) !== p.secretHash) throw new Error(p.role === 'child' ? 'Oops! That PIN is not right. Try again.' : 'Incorrect password');
    LS.set('session', { id, at: Date.now() });
    return publicProfile(p);
  }
  async restore() {
    const s = LS.get('session');
    if (!s) return null;
    if (Date.now() - s.at > 12 * 3600_000) { LS.del('session'); return null; } // sign out after 12 hours
    const p = await this.get('profiles', s.id);
    return p ? publicProfile(p) : null;
  }
  async logout() { LS.del('session'); }
  async updateProfile(p) {
    const cur = await this.get('profiles', p.id);
    if (!cur) throw new Error('Profile not found');
    await this.put('profiles', { ...cur, ...p, salt: cur.salt, secretHash: cur.secretHash });
  }
  async setSecret(id, newSecret) {
    const cur = await this.get('profiles', id);
    const salt = uid();
    await this.put('profiles', { ...cur, salt, secretHash: await this._hash(newSecret, salt) });
  }
  async deleteUser(id) { await this.remove('profiles', id); }
}

// ─────────────────────────── Cloud (Supabase) ───────────────────────────
function loadScript(src) {
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src)); document.head.append(s); });
}

class CloudBackend {
  mode = 'cloud';
  constructor(url, key) { this.url = url; this.key = key; }
  async init() {
    if (!window.supabase) await loadScript('vendor/supabase.js');
    this.sb = window.supabase.createClient(this.url, this.key, { auth: { persistSession: true, storageKey: `${NS}-auth` } });
  }
  _check({ data, error }) { if (error) throw new Error(error.message); return data; }
  async list(collection, where = {}) {
    const { childId, ...rest } = where;
    const out = [];
    for (let from = 0; ; from += 1000) {
      let q = this.sb.from('records').select('data').eq('collection', collection);
      if (childId) q = q.eq('child_id', childId);
      if (Object.keys(rest).length) q = q.contains('data', rest);
      const rows = this._check(await q.order('updated_at', { ascending: true }).range(from, from + 999));
      out.push(...rows.map(r => r.data));
      if (rows.length < 1000) break;
    }
    return out;
  }
  async get(collection, id) {
    const r = this._check(await this.sb.from('records').select('data').eq('collection', collection).eq('id', id).maybeSingle());
    return r ? r.data : null;
  }
  async put(collection, doc) {
    this._check(await this.sb.from('records').upsert({ collection, id: doc.id, child_id: doc.childId || null, data: doc, updated_at: new Date().toISOString() }));
    return doc;
  }
  async remove(collection, id) { this._check(await this.sb.from('records').delete().eq('collection', collection).eq('id', id)); }

  _toProfile(r) { return r && { ...(r.data || {}), id: r.id, name: r.name, role: r.role, email: r.email }; }
  async needsSetup() {
    const { data, error } = await this.sb.rpc('family_exists');
    if (error) throw new Error('Supabase is not set up yet — run supabase/schema.sql (' + error.message + ')');
    return !data;
  }
  async roster() { return LS.get('roster', []); }
  async listProfiles() {
    const rows = this._check(await this.sb.from('profiles').select('*').order('created_at'));
    const list = rows.map(r => this._toProfile(r));
    LS.set('roster', list.map(p => ({ id: p.id, name: p.name, role: p.role, email: p.email, avatar: p.avatar, color: p.color })));
    return list;
  }
  async _me() {
    const { data: { user } } = await this.sb.auth.getUser();
    if (!user) return null;
    const r = this._check(await this.sb.from('profiles').select('*').eq('id', user.id).maybeSingle());
    return this._toProfile(r);
  }
  async setupAdmin({ name, email, secret, ...data }) {
    let { data: d, error } = await this.sb.auth.signUp({ email, password: secret });
    if (error) throw new Error(error.message);
    if (!d.session) {
      const r = await this.sb.auth.signInWithPassword({ email, password: secret });
      if (r.error) throw new Error('Account created, but sign-in failed: ' + r.error.message + '. In Supabase → Authentication → Providers → Email, turn OFF "Confirm email" and try again.');
    }
    this._check(await this.sb.rpc('claim_admin', { p_name: name, p_email: email, p_data: data }));
    await this.listProfiles();
    return this._me();
  }
  _tempClient() { return window.supabase.createClient(this.url, this.key, { auth: { persistSession: false, autoRefreshToken: false, storageKey: `${NS}-tmp-${uid()}` } }); }
  async createUser({ name, role, email, secret, ...data }) {
    const tmp = this._tempClient();
    const { data: d, error } = await tmp.auth.signUp({ email, password: kidSecret(role, secret) });
    if (error) throw new Error(error.message);
    if (!d.user) throw new Error('Could not create the login');
    this._check(await this.sb.from('profiles').insert({ id: d.user.id, name, role, email, data }));
    await tmp.auth.signOut().catch(() => { });
    return { id: d.user.id, name, role, email, ...data };
  }
  async login({ email, secret, role }) {
    const { error } = await this.sb.auth.signInWithPassword({ email, password: kidSecret(role, secret) });
    if (error) {
      // Kids' tiles pass role=child; a grown-up typing their password into the plain form has no role hint.
      if (!role) { const r2 = await this.sb.auth.signInWithPassword({ email, password: kidSecret('child', secret) }); if (!r2.error) return this._afterLogin(); }
      throw new Error(role === 'child' ? 'Oops! That PIN is not right. Try again.' : error.message);
    }
    return this._afterLogin();
  }
  async _afterLogin() {
    const me = await this._me();
    if (!me) { await this.sb.auth.signOut(); throw new Error('This login is not part of the family yet. Ask Dad to add you in Settings → Family.'); }
    await this.listProfiles().catch(() => { });
    return me;
  }
  async restore() {
    const { data: { session } } = await this.sb.auth.getSession();
    if (!session) return null;
    return this._me();
  }
  async logout() { await this.sb.auth.signOut(); }
  async updateProfile(p) {
    const { id, name, role, email, ...data } = p;
    this._check(await this.sb.from('profiles').update({ name, role, data }).eq('id', id));
  }
  async setSecret(id, newSecret, oldSecret, role, email) {
    const me = (await this.sb.auth.getUser()).data.user;
    if (me && me.id === id) { this._check(await this.sb.auth.updateUser({ password: kidSecret(role, newSecret) })); return; }
    const tmp = this._tempClient();
    const r = await tmp.auth.signInWithPassword({ email, password: kidSecret(role, oldSecret) });
    if (r.error) throw new Error('The current PIN/password is not right. (You can also reset it in the Supabase dashboard.)');
    const u = await tmp.auth.updateUser({ password: kidSecret(role, newSecret) });
    await tmp.auth.signOut().catch(() => { });
    if (u.error) throw new Error(u.error.message);
  }
  async deleteUser(id) { this._check(await this.sb.from('profiles').delete().eq('id', id)); }
  async clearAll() { throw new Error('In cloud mode, clear data from the Supabase dashboard.'); }
}

// ─────────────────────────── Public store ───────────────────────────
class Store {
  me = null;
  _settings = null;
  async init() {
    const url = CONFIG.supabaseUrl || LS.get('supabaseUrl', '');
    const key = CONFIG.supabaseAnonKey || LS.get('supabaseKey', '');
    this.backend = url && key ? new CloudBackend(url, key) : new LocalBackend();
    await this.backend.init();
    this.mode = this.backend.mode;
  }
  get isParent() { return this.me && (this.me.role === 'admin' || this.me.role === 'parent'); }
  get isAdmin() { return this.me && this.me.role === 'admin'; }

  list(c, w) { return this.backend.list(c, w); }
  get(c, id) { return this.backend.get(c, id); }
  async put(c, doc) {
    if (!doc.id) doc.id = uid(c.slice(0, 2) + '_');
    if (!doc.createdAt) doc.createdAt = Date.now();
    doc.updatedAt = Date.now();
    return this.backend.put(c, doc);
  }
  remove(c, id) { return this.backend.remove(c, id); }

  async settings(force = false) {
    if (!this._settings || force) {
      const s = await this.get('settings', 'global').catch(() => null);
      this._settings = mergeDeep(DEFAULT_SETTINGS, s || {});
    }
    return this._settings;
  }
  async saveSettings(s) {
    if (!this.isAdmin) throw new Error('Only Dad can change settings');
    this._settings = mergeDeep(DEFAULT_SETTINGS, s);
    await this.put('settings', { ...this._settings, id: 'global' });
  }

  needsSetup() { return this.backend.needsSetup(); }
  roster() { return this.backend.roster(); }
  async profiles() { return this.backend.listProfiles(); }
  async children() { return (await this.profiles()).filter(p => p.role === 'child'); }
  async setupAdmin(p) { this.me = await this.backend.setupAdmin(p); return this.me; }
  createUser(p) { return this.backend.createUser(p); }
  updateProfile(p) { return this.backend.updateProfile(p); }
  setSecret(...a) { return this.backend.setSecret(...a); }
  deleteUser(id) { return this.backend.deleteUser(id); }
  async login(args) { this.me = await this.backend.login(args); this._settings = null; return this.me; }
  async restore() { this.me = await this.backend.restore().catch(() => null); return this.me; }
  async logout() { await this.backend.logout(); this.me = null; this._settings = null; }

  // Activity feed for parents
  async log(type, detail = {}, childId) {
    const cid = childId || (this.me && this.me.role === 'child' ? this.me.id : null);
    if (!cid) return;
    try { await this.put('activity', { id: uid('ac_'), childId: cid, type, ...detail, ts: Date.now() }); } catch (e) { console.warn(e); }
  }
}

export const store = new Store();
