import { store } from './store.js';
import { esc } from './util.js';
import { showLogin } from './login.js';
import { showSetup } from './setup.js';

export const root = () => document.getElementById('app');

export async function enter(me) {
  if (me.role === 'child') {
    const { mountDesktop } = await import('./desktop.js');
    mountDesktop(me);
  } else {
    const { mountParent } = await import('./parent/shell.js');
    mountParent(me);
  }
}

export async function logout() {
  try { (await import('./desktop.js')).unmountDesktop?.(); } catch { }
  await store.logout();
  history.replaceState(null, '', location.pathname);
  showLogin();
}

function fatal(err) {
  console.error(err);
  root().innerHTML = `<div class="splash"><div class="login-box"><h2>😕 Something went wrong</h2><p>${esc(err.message || err)}</p>
  <p class="muted small">If you have just set up cloud sync, check the Supabase URL/key in <code>js/config.js</code> and that you ran <code>supabase/schema.sql</code>.</p>
  <button class="btn btn-primary" onclick="location.reload()">Try again</button></div></div>`;
}

async function boot() {
  try {
    await store.init();
    if (await store.needsSetup()) return showSetup();
    const me = await store.restore();
    if (!me) return showLogin();
    await enter(me);
  } catch (e) { fatal(e); }
}

window.addEventListener('unhandledrejection', e => console.warn('Unhandled:', e.reason));
boot();
