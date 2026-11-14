// Server address, login session and the account / admin dialogs.
// The server runs on a phone behind a Cloudflare quick tunnel whose address changes; a static
// pointer file always holds the current one, so it is looked up here instead of being hard-coded.
const POINTER_URL = 'https://aquibahmed21.github.io/server/server-url.json';
const SESSION_KEY = 'fam_session';
const ROOT_FAMILY_KEY = 'fam_root_family';
const CACHE_PREFIX = 'familyTreeData';

const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* storage blocked */ } }
};

// ---- server address -------------------------------------------------------------------------
let serverBase = null;

async function resolveServer(force)
{
  if (!force && serverBase) return serverBase;
  if (!force)
  {
    try { serverBase = sessionStorage.getItem('serverBase'); } catch (e) { /* ignore */ }
    if (serverBase) return serverBase;
  }
  const r = await fetch(POINTER_URL + '?t=' + Date.now(), { cache: 'no-store' });
  if (!r.ok) throw new Error('Could not find the server (pointer HTTP ' + r.status + ')');
  const p = await r.json();
  if (!p.server_url) throw new Error('The server is offline right now');
  serverBase = String(p.server_url).replace(/\/+$/, '');
  try { sessionStorage.setItem('serverBase', serverBase); } catch (e) { /* ignore */ }
  return serverBase;
}

// ---- session --------------------------------------------------------------------------------
export function getSession()
{
  try { return JSON.parse(store.get(SESSION_KEY)) || null; } catch (e) { return null; }
}
function setSession(s) { store.set(SESSION_KEY, JSON.stringify(s)); }
function clearSession() { store.del(SESSION_KEY); store.del(ROOT_FAMILY_KEY); }

/** The family whose tree is open: the account's own family, or the one root picked. */
export function currentFamily()
{
  const s = getSession();
  if (!s) return null;
  return s.role === 'root' ? store.get(ROOT_FAMILY_KEY) : s.family;
}
/** Role names used by the page's CSS: viewer is called "reader" there. */
export function uiRole()
{
  const s = getSession();
  return !s ? 'reader' : s.role === 'viewer' ? 'reader' : s.role;
}
export const canWrite = () => ['writer', 'admin', 'root'].includes(getSession()?.role);
export const familyPath = () => '/family/' + currentFamily();
/** Browser copy of the tree, one per family. */
export const localKey = () => CACHE_PREFIX + ':' + currentFamily();

// ---- talking to the server ------------------------------------------------------------------
/** fetch() against the current server with the login token; re-resolves the address once if it moved. */
export async function serverFetch(path, options = {}, { auth = true } = {})
{
  const attempt = async force =>
  {
    const base = await resolveServer(force);
    const headers = { ...(options.headers || {}) };
    const s = getSession();
    if (auth && s) headers.Authorization = 'Bearer ' + s.token;
    const res = await fetch(base + path, { ...options, headers });
    // Cloudflare answers 530/502 when the old tunnel address is gone
    if (res.status === 530 || res.status === 502) throw new Error('tunnel ' + res.status);
    return res;
  };
  let res;
  try { res = await attempt(false); } catch (e) { res = await attempt(true); }
  if (res.status === 401 && auth && getSession())
  {
    clearSession();
    showLogin('Your session ended. Please sign in again.');
    throw new Error('login required');
  }
  return res;
}

/** JSON in, JSON out; throws an Error carrying the server's message. */
async function api(path, method = 'GET', body)
{
  const res = await serverFetch(path, body === undefined ? { method } : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  let out = null;
  try { out = await res.json(); } catch (e) { /* no body */ }
  if (!res.ok) throw new Error(out?.error || 'server answered ' + res.status);
  return out;
}

// ---- tiny DOM helper (text is always set as text, never as HTML) -----------------------------
function h(tag, props, ...kids)
{
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {}))
  {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid));
  return el;
}

function overlay(title, body, { closable = true, onClose } = {})
{
  const close = () => { box.remove(); onClose?.(); };
  const box = h('div', { class: 'auth-overlay', role: 'dialog', 'aria-modal': 'true' },
    h('div', { class: 'auth-card' },
      h('div', { class: 'auth-head' }, h('h2', {}, title), closable ? h('button', { class: 'auth-x', type: 'button', 'aria-label': 'Close', onclick: close }, '×') : null),
      body));
  if (closable) box.addEventListener('click', e => { if (e.target === box) close(); });
  document.body.append(box);
  return { box, close };
}

const status = () => h('p', { class: 'auth-msg', role: 'status' });
const say = (el, text, bad = true) => { el.textContent = text; el.classList.toggle('ok', !bad); };

// ---- login ----------------------------------------------------------------------------------
let loginWaiters = [];
let loginBox = null;

function showLogin(message)
{
  if (loginBox) { loginBox.msg && say(loginBox.msg, message || ''); return; }
  const msg = status();
  const id = h('input', { class: 'auth-input', placeholder: 'Family ID, e.g. sc_majid', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', required: true });
  const pin = h('input', { class: 'auth-input', type: 'password', inputmode: 'numeric', placeholder: 'PIN', autocomplete: 'current-password', required: true });
  const go = h('button', { class: 'auth-btn', type: 'submit' }, 'Sign in');
  const form = h('form', { class: 'auth-form' }, h('p', { class: 'auth-hint' }, 'Enter your family ID and PIN.'), id, pin, go, msg);
  form.addEventListener('submit', async e =>
  {
    e.preventDefault();
    go.disabled = true; say(msg, '');
    try
    {
      const r = await serverFetch('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: id.value, pin: pin.value }) }, { auth: false });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(out.error || 'sign-in failed (' + r.status + ')');
      setSession({ token: out.token, role: out.role, family: out.family, familyName: out.familyName, label: out.label });
      loginBox.close(); loginBox = null;
      loginWaiters.forEach(f => f()); loginWaiters = [];
    }
    catch (err) { say(msg, err.message); go.disabled = false; pin.value = ''; pin.focus(); }
  });
  const o = overlay('Family tree', form, { closable: false });
  loginBox = { close: o.close, msg };
  if (message) say(msg, message);
  setTimeout(() => id.focus(), 50);
}

/** Resolves once somebody is signed in (shows the sign-in dialog if not). */
export function ensureLogin()
{
  if (getSession()) return Promise.resolve();
  return new Promise(resolve => { loginWaiters.push(resolve); showLogin(); });
}

export function logout()
{
  clearSession();
  location.reload();
}

// ---- header chip + dialogs ------------------------------------------------------------------
export function mountAccountUI()
{
  const s = getSession();
  const btn = document.getElementById('acctBtn');
  if (!btn || !s) return;
  const fam = s.role === 'root' ? (currentFamily() || 'all families') : (s.familyName || s.family);
  document.getElementById('acctLabel').textContent = `${s.label} · ${s.role}`;
  btn.title = `${fam} — account`;
  btn.hidden = false;
  btn.onclick = openAccount;
}

function row(...cells) { return h('div', { class: 'auth-row' }, ...cells); }
const btn = (text, fn, cls = '') => h('button', { type: 'button', class: 'auth-btn small ' + cls, onclick: fn }, text);

export function openAccount()
{
  const s = getSession();
  if (!s) return;
  const msg = status();
  const body = h('div', { class: 'auth-form' });
  const o = overlay('Account', body);
  const fam = s.role === 'root' ? currentFamily() : s.family;

  body.append(
    h('p', { class: 'auth-hint' }, `${s.label} · ${s.role}`, fam ? ` · ${fam}` : ''),
    s.role === 'root' ? btn('Families…', () => { o.close(); openFamilies(); }) : null,
    (s.role === 'admin' || (s.role === 'root' && fam)) ? btn('People with access…', () => { o.close(); openAccess(fam); }) : null,
    btn('Change my PIN…', () => { o.close(); openChangePin(); }),
    btn('Log out', logout, 'danger'),
    msg);
}

function openChangePin()
{
  const msg = status();
  const cur = h('input', { class: 'auth-input', type: 'password', inputmode: 'numeric', placeholder: 'Current PIN', autocomplete: 'current-password' });
  const nw = h('input', { class: 'auth-input', type: 'password', inputmode: 'numeric', placeholder: 'New PIN (4-12 digits)', autocomplete: 'new-password' });
  const form = h('form', { class: 'auth-form' }, cur, nw, h('button', { class: 'auth-btn', type: 'submit' }, 'Change PIN'), msg);
  const o = overlay('Change PIN', form);
  form.addEventListener('submit', async e =>
  {
    e.preventDefault();
    try
    {
      const out = await api('/auth/change-pin', 'POST', { current: cur.value, pin: nw.value });
      setSession({ ...getSession(), token: out.token });
      say(msg, 'PIN changed.', false);
      setTimeout(o.close, 900);
    }
    catch (err) { say(msg, err.message); }
  });
}

/** Root: all families. */
export async function openFamilies(blocking = false)
{
  const msg = status();
  const list = h('div', { class: 'auth-list' });
  const body = h('div', { class: 'auth-form' }, list, msg);
  const o = overlay('Families', body, { closable: !blocking });

  const refresh = async () =>
  {
    list.replaceChildren(h('p', { class: 'auth-hint' }, 'Loading…'));
    try
    {
      const fams = await api('/families');
      list.replaceChildren(...(fams.length ? fams.map(f => row(
        h('div', { class: 'auth-grow' }, h('strong', {}, f.name), h('small', {}, ` ${f.id} · ${f.users} PIN${f.users === 1 ? '' : 's'} · ${f.photos} photo${f.photos === 1 ? '' : 's'}`)),
        btn('Open', () => { store.set(ROOT_FAMILY_KEY, f.id); location.reload(); }),
        btn('Delete', async () =>
        {
          const typed = prompt(`This permanently deletes "${f.name}" with its tree, photos and PINs.\nType the family id (${f.id}) to confirm:`);
          if (typed !== f.id) return;
          try { await api('/family/' + f.id, 'DELETE'); if (currentFamily() === f.id) store.del(ROOT_FAMILY_KEY); refresh(); }
          catch (err) { say(msg, err.message); }
        }, 'danger'))) : [h('p', { class: 'auth-hint' }, 'No families yet. Create the first one below.')]));
    }
    catch (err) { list.replaceChildren(); say(msg, err.message); }
  };

  const id = h('input', { class: 'auth-input', placeholder: 'New family id, e.g. khan_family', autocapitalize: 'none', spellcheck: 'false' });
  const name = h('input', { class: 'auth-input', placeholder: 'Display name (optional)' });
  const pin = h('input', { class: 'auth-input', inputmode: 'numeric', placeholder: 'Admin PIN for this family (4-12 digits)' });
  const form = h('form', { class: 'auth-form sub' }, h('h3', {}, 'Create a family'), id, name, pin, h('button', { class: 'auth-btn', type: 'submit' }, 'Create'));
  form.addEventListener('submit', async e =>
  {
    e.preventDefault();
    try
    {
      await api('/families', 'POST', { id: id.value.trim(), name: name.value.trim() || undefined, adminPin: pin.value.trim() });
      id.value = name.value = pin.value = '';
      say(msg, 'Family created.', false);
      refresh();
    }
    catch (err) { say(msg, err.message); }
  });
  body.append(form, blocking ? btn('Log out', logout, 'danger') : null);
  refresh();
  return o;
}

/** Admin (or root inside a family): the PINs that may open this family. */
async function openAccess(family)
{
  const msg = status();
  const list = h('div', { class: 'auth-list' });
  const body = h('div', { class: 'auth-form' }, h('p', { class: 'auth-hint' }, 'Each person gets their own PIN and a role: viewer reads, writer edits, admin also manages access.'), list, msg);
  overlay('People with access · ' + family, body);
  const base = `/family/${family}/users`;

  const refresh = async () =>
  {
    try
    {
      const users = await api(base);
      list.replaceChildren(...users.map(u =>
      {
        const sel = h('select', { class: 'auth-input slim', 'aria-label': 'Role' }, ...['viewer', 'writer', 'admin'].map(r => h('option', { value: r, selected: r === u.role }, r)));
        sel.addEventListener('change', async () =>
        {
          try { await api(`${base}/${u.id}`, 'PATCH', { role: sel.value }); say(msg, 'Role updated.', false); }
          catch (err) { say(msg, err.message); refresh(); }
        });
        return row(
          h('div', { class: 'auth-grow' }, h('strong', {}, u.label)), sel,
          btn('New PIN', async () =>
          {
            const p = prompt(`New PIN for ${u.label} (4-12 digits):`);
            if (!p) return;
            try { await api(`${base}/${u.id}`, 'PATCH', { pin: p.trim() }); say(msg, 'PIN changed.', false); }
            catch (err) { say(msg, err.message); }
          }),
          btn('Remove', async () =>
          {
            if (!confirm(`Remove ${u.label}? Their PIN will stop working.`)) return;
            try { await api(`${base}/${u.id}`, 'DELETE'); refresh(); }
            catch (err) { say(msg, err.message); }
          }, 'danger'));
      }));
    }
    catch (err) { say(msg, err.message); }
  };

  const label = h('input', { class: 'auth-input', placeholder: 'Name, e.g. Cousin Ali' });
  const role = h('select', { class: 'auth-input', 'aria-label': 'Role' }, ...['viewer', 'writer', 'admin'].map(r => h('option', { value: r }, r)));
  const pin = h('input', { class: 'auth-input', inputmode: 'numeric', placeholder: 'PIN (4-12 digits)' });
  const form = h('form', { class: 'auth-form sub' }, h('h3', {}, 'Add a person'), label, role, pin, h('button', { class: 'auth-btn', type: 'submit' }, 'Add'));
  form.addEventListener('submit', async e =>
  {
    e.preventDefault();
    try
    {
      await api(base, 'POST', { label: label.value.trim(), role: role.value, pin: pin.value.trim() });
      label.value = pin.value = '';
      say(msg, 'Added.', false);
      refresh();
    }
    catch (err) { say(msg, err.message); }
  });
  body.append(form);
  refresh();
}
