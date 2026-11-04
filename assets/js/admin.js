/* Nagorewala admin: edits the menu and kitchen photos and publishes them by committing
   assets/js/data.js (and new photos) to the website's GitHub repository. */
(() => {
  const REPO = { owner: 'alimbacker', name: 'nagorewala-sweets', branch: 'main' };
  const GH = 'https://api.github.com';
  const DATA_PATH = 'assets/js/data.js';
  const SESSION_KEY = 'nagorewala-gh-key';    // the key, for this browser tab while logged in
  const VAULT = 'nagorewala-gh-vault';         // the key, encrypted with the admin password, on this device
  const DRAFT = 'nagorewala-admin-draft';

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const fmt = (v) => '₹' + Math.round(v).toLocaleString('en-IN');
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const read = (k) => { try { return sessionStorage.getItem(k) || localStorage.getItem(k); } catch (e) { return null; } };
  const local = {
    get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
    del: (k) => { try { localStorage.removeItem(k); } catch (e) { /* storage blocked */ } },
  };
  const session = {
    set: (v) => { try { sessionStorage.setItem(SESSION_KEY, v); } catch (e) { /* storage blocked */ } },
    del: () => { try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* storage blocked */ } },
  };

  local.del(SESSION_KEY); /* earlier versions kept the key unencrypted on the device; never again */
  let token = (() => { try { return sessionStorage.getItem(SESSION_KEY); } catch (e) { return null; } })();
  let original = null, data = null, dataSha = null;
  let dirty = false, tab = 'sweets', editing = null;
  /* photos just published: show them from memory until GitHub Pages has rebuilt */
  const justSaved = new Map();
  const shown = (src) => justSaved.get(src) || src;

  /* ---------- the key, locked with the admin password (PBKDF2 + AES-GCM, Web Crypto) ---------- */
  const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const unb64 = (str) => Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
  async function passwordKey(password, salt) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 600000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function lockKey(key, password) {
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await passwordKey(password, salt), new TextEncoder().encode(key));
    return local.set(VAULT, JSON.stringify({ v: 1, salt: b64(salt), iv: b64(iv), ct: b64(ct) }));
  }
  async function unlockKey(password) {
    const vault = JSON.parse(local.get(VAULT));
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(vault.iv) }, await passwordKey(password, unb64(vault.salt)), unb64(vault.ct));
    return new TextDecoder().decode(pt);
  }
  const hasVault = () => !!local.get(VAULT);

  /* ---------- GitHub ---------- */
  async function gh(path, opts = {}) {
    const res = await fetch(GH + path, {
      ...opts,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      },
      cache: 'no-store',
    });
    const json = await res.json().catch(() => ({}));
    if (res.status === 401) throw Object.assign(new Error('GitHub did not accept the access key. It may have expired. Please paste a new key.'), { auth: true });
    if (res.status === 403 || res.status === 404) throw Object.assign(new Error('This access key cannot edit the nagorewala-sweets repository. Check that it has Contents: Read and write for that repository.'), { perm: true });
    if (!res.ok) throw Object.assign(new Error(json.message || `GitHub said ${res.status}.`), { status: res.status });
    return json;
  }
  const repoPath = (p) => `/repos/${REPO.owner}/${REPO.name}${p}`;
  const decode = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), (c) => c.charCodeAt(0)));

  async function loadData() {
    const file = await gh(repoPath(`/contents/${DATA_PATH}?ref=${REPO.branch}`));
    const text = decode(file.content);
    const parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    if (!parsed || !parsed.menu) throw new Error('The menu file in the repository could not be read.');
    return { parsed, sha: file.sha };
  }

  /* ---------- screens: connect (first time), log in (password), editor ---------- */
  function showScreen(name) {
    $('#login').hidden = name !== 'login';
    $('#unlock').hidden = name !== 'unlock';
    $('#app').hidden = name !== 'app';
    const focus = { login: '#tokenInput', unlock: '#unlockPass' }[name];
    if (focus) setTimeout(() => $(focus).focus(), 50);
  }
  function dropKey() { token = null; session.del(); }

  /* loads the menu with the current key; returns true once the editor is open */
  async function start(errorEl) {
    try {
      const { parsed, sha } = await loadData();
      original = parsed; dataSha = sha; data = clone(parsed);
      try {
        const draft = JSON.parse(read(DRAFT));
        if (draft && draft.menu && JSON.stringify(draft) !== JSON.stringify(original)
          && confirm('You have unsaved changes from last time. Continue with them?\n\nChoose Cancel to start from the live website.')) {
          data = draft; dirty = true;
        }
      } catch (e) { /* no draft */ }
      session.set(token);
      showScreen('app');
      render();
      return true;
    } catch (e) {
      dropKey();
      if (e.auth) { local.del(VAULT); showScreen('login'); $('#loginError').textContent = e.message; }
      else errorEl.textContent = e.message;
      return false;
    }
  }
  function busy(btn, label) {
    const was = btn.textContent, form = btn.closest('form');
    btn.textContent = label; form.classList.add('ad-loading');
    return () => { btn.textContent = was; form.classList.remove('ad-loading'); };
  }

  /* first time on this device: access key + a new password */
  $('#remember').addEventListener('change', (e) => { $('#setPassword').hidden = !e.target.checked; });
  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#loginError');
    const key = $('#tokenInput').value.trim();
    const keep = $('#remember').checked, pass = $('#newPass').value;
    err.textContent = '';
    if (!/^(github_pat_|ghp_)[A-Za-z0-9_]{20,}$/.test(key)) { err.textContent = 'That does not look like a GitHub access key. It starts with github_pat_.'; return; }
    if (keep && pass.length < 8) { err.textContent = 'Please choose a password of at least 8 characters.'; return; }
    if (keep && pass !== $('#newPass2').value) { err.textContent = 'The two passwords do not match.'; return; }
    const done = busy($('#loginBtn'), 'Connecting…');
    token = key;
    const ok = await start(err);
    if (ok && keep && !(await lockKey(key, pass))) toast('This browser could not save the key, so you will need it again next time.', 6000);
    if (ok) { $('#tokenInput').value = ''; $('#newPass').value = ''; $('#newPass2').value = ''; }
    done();
  });

  /* next times: the password unlocks the saved key */
  let wrongTries = 0;
  $('#unlockForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#unlockError');
    err.textContent = '';
    const done = busy($('#unlockBtn'), 'Checking…');
    try {
      token = await unlockKey($('#unlockPass').value);
    } catch (ex) {
      wrongTries++;
      await new Promise((r) => setTimeout(r, Math.min(8000, 500 * 2 ** wrongTries)));
      err.textContent = 'That password is not right.';
      done();
      return;
    }
    $('#unlockPass').value = '';
    wrongTries = 0;
    await start(err);
    done();
  });
  $('#forgetKey').addEventListener('click', () => {
    if (!confirm('This removes the saved key from this device. You will need the GitHub access key to set a new password. Continue?')) return;
    local.del(VAULT); dropKey();
    showScreen('login');
  });
  $('#btnLogout').addEventListener('click', () => {
    if (dirty && !confirm('You have unsaved changes. Log out anyway? They stay saved in this browser.')) return;
    dropKey(); dirty = false;
    location.reload();
  });

  /* ---------- status, toast, draft ---------- */
  const toastEl = $('#toast');
  let toastTimer = 0;
  function toast(msg, ms = 3200, action) {
    toastEl.textContent = msg;
    if (action) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'ad-toast-btn'; b.textContent = action.label;
      b.addEventListener('click', () => { toastEl.classList.remove('show'); action.run(); });
      toastEl.append(' ', b);
    }
    toastEl.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
  }
  function keepDraft() {
    try { localStorage.setItem(DRAFT, JSON.stringify(data)); return true; } catch (e) { return false; }
  }
  function markDirty() {
    dirty = true;
    if (!keepDraft()) toast('Preview needs saving first: the new photos are too large to keep in the browser.');
    render();
  }
  function renderStatus() {
    const st = $('#status');
    st.textContent = dirty ? 'Unsaved changes' : 'All saved';
    st.classList.toggle('dirty', dirty);
  }
  addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

  /* ---------- images: crop in the browser, keep as data URL until saved ---------- */
  const MAX_UPLOAD = 15 * 1024 * 1024;
  function loadImage(file) {
    return new Promise((resolve, reject) => {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return reject(new Error('Please choose a JPG, PNG or WebP photo.'));
      if (file.size > MAX_UPLOAD) return reject(new Error('That photo is over 15 MB. Please choose a smaller one.'));
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file could not be read as a photo.')); };
      img.src = url;
    });
  }
  function cropTo(img, w, h, type, quality) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    const sw = w / scale, sh = h / scale;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, 0, 0, w, h);
    let out = c.toDataURL(type, quality);
    if (!out.startsWith(`data:${type}`)) out = c.toDataURL('image/jpeg', quality);
    return out;
  }

  /* ---------- tabs ---------- */
  $$('.ad-tabs button').forEach((b) => b.addEventListener('click', () => {
    tab = b.dataset.tab;
    $$('.ad-tabs button').forEach((x) => { x.classList.toggle('is-on', x === b); x.setAttribute('aria-selected', x === b); });
    render();
  }));

  /* ---------- menu list ---------- */
  const list = $('#itemList');
  function thumb(it) {
    return `<span class="ad-thumb" style="--c:${/^#[0-9a-f]{3,8}$/i.test(it.c || '') ? it.c : '#c48a22'}">${it.img ? `<img src="${esc(shown(it.img))}" alt="">` : ''}</span>`;
  }
  function render() {
    renderStatus();
    $('[data-count="sweets"]').textContent = data.menu.sweets.length;
    $('[data-count="savouries"]').textContent = data.menu.savouries.length;
    $('[data-count="gallery"]').textContent = data.gallery.length;
    $('#paneMenu').hidden = tab === 'gallery';
    $('#paneGallery').hidden = tab !== 'gallery';
    if (tab === 'gallery') return renderGallery();

    const q = $('#search').value.trim().toLowerCase();
    const items = data.menu[tab];
    const shown = items.map((it, i) => ({ it, i })).filter(({ it }) => !q || it.n.toLowerCase().includes(q) || (it.sub || '').toLowerCase().includes(q));
    list.innerHTML = shown.map(({ it, i }) => `
      <li class="ad-item">
        <span class="ad-order">
          <button type="button" data-move="-1" data-i="${i}" aria-label="Move ${esc(it.n)} up" ${i === 0 || q ? 'disabled' : ''}>▲</button>
          <button type="button" data-move="1" data-i="${i}" aria-label="Move ${esc(it.n)} down" ${i === items.length - 1 || q ? 'disabled' : ''}>▼</button>
        </span>
        ${thumb(it)}
        <span class="ad-name"><b>${esc(it.n)}</b>${it.tag ? `<span class="ad-tag">${esc(it.tag)}</span>` : ''}${it.img && it.img.startsWith('data:') ? '<span class="ad-tag ad-new">New photo</span>' : ''}${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</span>
        <span class="ad-price">${fmt(it.p)}<small>${fmt(it.p / 2)} for ½ kg</small></span>
        <span class="ad-row-actions">
          <button type="button" class="ad-btn ghost ad-edit" data-edit="${i}">Edit</button>
          <button type="button" class="ad-btn ghost ad-del" data-del="${i}" aria-label="Delete ${esc(it.n)}">Delete</button>
        </span>
      </li>`).join('');
    $('#itemEmpty').hidden = shown.length > 0;
    $('#btnAdd').textContent = tab === 'savouries' ? '+ Add savoury' : '+ Add sweet';
  }
  list.addEventListener('click', (e) => {
    const mv = e.target.closest('[data-move]'), ed = e.target.closest('[data-edit]'), del = e.target.closest('[data-del]');
    if (del) deleteItem(tab, +del.dataset.del);
    if (mv) {
      const arr = data.menu[tab], i = +mv.dataset.i, j = i + +mv.dataset.move;
      if (j < 0 || j >= arr.length) return;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      markDirty();
      $(`[data-move="${mv.dataset.move}"][data-i="${j}"]`, list)?.focus();
    }
    if (ed) openEditor(tab, +ed.dataset.edit);
  });
  $('#search').addEventListener('input', render);

  /* ---------- item editor ---------- */
  const dlg = $('#itemDlg'), form = $('#itemForm'), photoView = $('#photoView');
  let draftImg = null;
  function showPhoto(colour) {
    photoView.style.setProperty('--c', colour);
    photoView.innerHTML = draftImg ? `<img src="${esc(shown(draftImg))}" alt="">` : '';
    $('#photoRemove').hidden = !draftImg;
  }
  function updateHalf() {
    const p = parseInt(form.p.value, 10);
    $('#halfPrice').textContent = p > 0 ? `½ kg will show as ${fmt(p / 2)}.` : '';
  }
  function openEditor(cat, index) {
    editing = { cat, index };
    const it = index == null ? { n: '', p: '', sub: '', tag: '', c: '#c48a22' } : data.menu[cat][index];
    $('#dlgTitle').textContent = index == null ? (cat === 'savouries' ? 'Add savoury' : 'Add sweet') : `Edit ${it.n}`;
    form.n.value = it.n; form.p.value = it.p; form.sub.value = it.sub || ''; form.tag.value = it.tag || '';
    form.cat.value = cat; form.c.value = /^#[0-9a-f]{6}$/i.test(it.c || '') ? it.c : '#c48a22';
    draftImg = it.img || null;
    $('#formError').textContent = '';
    $('#btnDelete').hidden = index == null;
    showPhoto(form.c.value); updateHalf();
    dlg.showModal();
    form.n.focus();
  }
  $('#btnAdd').addEventListener('click', () => openEditor(tab === 'gallery' ? 'sweets' : tab, null));
  $$('[data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));
  form.p.addEventListener('input', updateHalf);
  form.c.addEventListener('input', () => showPhoto(form.c.value));
  $('#photoInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try { draftImg = cropTo(await loadImage(file), 480, 480, 'image/webp', .8); showPhoto(form.c.value); }
    catch (err) { $('#formError').textContent = err.message; }
  });
  $('#photoRemove').addEventListener('click', () => { draftImg = null; showPhoto(form.c.value); });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const n = form.n.value.trim().replace(/\s+/g, ' ');
    const p = Number(form.p.value);
    const all = [...data.menu.sweets, ...data.menu.savouries];
    const self = editing.index == null ? null : data.menu[editing.cat][editing.index];
    let err = '';
    if (!n) err = 'Please enter a name.';
    else if (all.some((x) => x !== self && x.n.toLowerCase() === n.toLowerCase())) err = `"${n}" is already on the menu.`;
    else if (!Number.isInteger(p) || p < 1 || p > 100000) err = 'Please enter the price for 1 kg as a whole number of rupees.';
    if (err) { $('#formError').textContent = err; return; }

    const item = { n, p };
    const sub = form.sub.value.trim(), tag = form.tag.value;
    if (sub) item.sub = sub;
    if (tag) item.tag = tag;
    item.c = form.c.value;
    if (draftImg) {
      item.img = draftImg;
      if (self && self.img === draftImg && self.sq) item.sq = self.sq;
    }
    const cat = form.cat.value;
    if (self) {
      data.menu[editing.cat].splice(editing.index, 1, item);
      if (cat !== editing.cat) { data.menu[editing.cat].splice(editing.index, 1); data.menu[cat].push(item); }
    } else data.menu[cat].push(item);
    dlg.close();
    if (cat !== tab) $(`.ad-tabs [data-tab="${cat}"]`).click();
    markDirty();
    toast(self ? `${n} updated. Click Save changes to publish.` : `${n} added. Click Save changes to publish.`);
  });
  /* delete from the list or the editor; Undo puts it back where it was */
  function deleteItem(cat, index) {
    const it = data.menu[cat][index];
    if (!it || !confirm(`Delete ${it.n} from the menu?`)) return false;
    data.menu[cat].splice(index, 1);
    markDirty();
    toast(`${it.n} deleted. Click Save changes to publish.`, 7000, {
      label: 'Undo',
      run: () => { data.menu[cat].splice(Math.min(index, data.menu[cat].length), 0, it); markDirty(); toast(`${it.n} is back.`); },
    });
    return true;
  }
  $('#btnDelete').addEventListener('click', () => { if (deleteItem(editing.cat, editing.index)) dlg.close(); });

  /* ---------- kitchen gallery ---------- */
  const gal = $('#galList');
  function renderGallery() {
    gal.innerHTML = data.gallery.map((g, i) => `
      <li class="ad-gcard">
        <img src="${esc(shown(g.src))}" alt="${esc(g.alt || g.caption)}">
        <input type="text" value="${esc(g.caption)}" data-cap="${i}" maxlength="60" placeholder="Caption (optional)" aria-label="Caption for photo ${i + 1}">
        <div class="ad-gbar">
          <button type="button" data-gmove="-1" data-i="${i}" aria-label="Move photo ${i + 1} earlier" ${i === 0 ? 'disabled' : ''}>◀</button>
          <button type="button" data-gmove="1" data-i="${i}" aria-label="Move photo ${i + 1} later" ${i === data.gallery.length - 1 ? 'disabled' : ''}>▶</button>
          <button type="button" class="ad-link danger" data-gdel="${i}">Remove</button>
        </div>
      </li>`).join('');
    $('#galEmpty').hidden = data.gallery.length > 0;
  }
  gal.addEventListener('input', (e) => {
    const i = e.target.dataset.cap;
    if (i == null) return;
    data.gallery[i].caption = e.target.value;
    data.gallery[i].alt = e.target.value;
    dirty = true;
    keepDraft();
    renderStatus();
  });
  gal.addEventListener('click', (e) => {
    const mv = e.target.closest('[data-gmove]'), del = e.target.closest('[data-gdel]');
    if (mv) {
      const i = +mv.dataset.i, j = i + +mv.dataset.gmove;
      [data.gallery[i], data.gallery[j]] = [data.gallery[j], data.gallery[i]];
      markDirty();
    }
    if (del && confirm('Remove this photo from the kitchen section?')) { data.gallery.splice(+del.dataset.gdel, 1); markDirty(); }
  });
  $('#galInput').addEventListener('change', async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    let added = 0;
    for (const f of files) {
      try { data.gallery.push({ src: cropTo(await loadImage(f), 800, 1000, 'image/jpeg', .82), caption: '', alt: 'Halwa from the Nagorewala kitchen' }); added++; }
      catch (err) { toast(`${f.name}: ${err.message}`); }
    }
    if (added) { markDirty(); toast(`${added} photo${added > 1 ? 's' : ''} added. Add a caption if you like.`); }
  });

  /* ---------- save: one commit with data.js and any new photos ---------- */
  const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'photo';
  const extOf = (dataUrl) => (dataUrl.startsWith('data:image/webp') ? 'webp' : dataUrl.startsWith('data:image/png') ? 'png' : 'jpg');
  const rand = () => Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(16).padStart(2, '0')).join('');
  function serialise(d) {
    return '/* Nagorewala Sweets: site content (menu and kitchen gallery).\n   Managed from /admin/. Prices are per 1 kg; ½ kg is half. */\n'
      + 'window.NAGOREWALA_DATA = ' + JSON.stringify(d, null, 2) + ';\n';
  }
  $('#btnSave').addEventListener('click', async () => {
    if (!dirty) { toast('Nothing to save. Everything is already live.'); return; }
    const btn = $('#btnSave');
    btn.disabled = true;
    try {
      btn.textContent = 'Checking…';
      const current = await gh(repoPath(`/contents/${DATA_PATH}?ref=${REPO.branch}`));
      if (current.sha !== dataSha) throw new Error('The menu was changed somewhere else since you opened the admin. Reload the page to get the latest; your changes stay saved in this browser.');

      const out = clone(data);
      const pending = [];
      for (const cat of ['sweets', 'savouries']) for (const it of out.menu[cat]) if (it.img && it.img.startsWith('data:')) pending.push([it, 'img', it.n, true]);
      for (const g of out.gallery) if (g.src.startsWith('data:')) pending.push([g, 'src', g.caption || 'kitchen', false]);

      const tree = [];
      let done = 0;
      for (const [obj, key, name, isSweet] of pending) {
        btn.textContent = `Uploading photo ${++done} of ${pending.length}…`;
        const dataUrl = obj[key];
        const blob = await gh(repoPath('/git/blobs'), { method: 'POST', body: JSON.stringify({ content: dataUrl.slice(dataUrl.indexOf(',') + 1), encoding: 'base64' }) });
        const path = `assets/img/uploads/${slug(name)}-${rand()}.${extOf(dataUrl)}`;
        tree.push({ path, mode: '100644', type: 'blob', sha: blob.sha });
        obj[key] = path;
        justSaved.set(path, dataUrl);
        if (isSweet) delete obj.sq;
      }
      btn.textContent = 'Publishing…';
      const dataBlob = await gh(repoPath('/git/blobs'), { method: 'POST', body: JSON.stringify({ content: serialise(out), encoding: 'utf-8' }) });
      tree.push({ path: DATA_PATH, mode: '100644', type: 'blob', sha: dataBlob.sha });

      /* uploaded photos no longer used by any sweet or kitchen photo are removed (built-in photos are kept) */
      const used = new Set([...out.menu.sweets, ...out.menu.savouries].map((it) => it.img).concat(out.gallery.map((g) => g.src)));
      const before = [...original.menu.sweets, ...original.menu.savouries].map((it) => it.img).concat(original.gallery.map((g) => g.src));
      for (const path of new Set(before)) {
        if (path && path.startsWith('assets/img/uploads/') && !used.has(path)) tree.push({ path, mode: '100644', type: 'blob', sha: null });
      }

      const ref = await gh(repoPath(`/git/ref/heads/${REPO.branch}`));
      const head = await gh(repoPath(`/git/commits/${ref.object.sha}`));
      const newTree = await gh(repoPath('/git/trees'), { method: 'POST', body: JSON.stringify({ base_tree: head.tree.sha, tree }) });
      const commit = await gh(repoPath('/git/commits'), { method: 'POST', body: JSON.stringify({ message: 'Update menu from the admin page', tree: newTree.sha, parents: [ref.object.sha] }) });
      await gh(repoPath(`/git/refs/heads/${REPO.branch}`), { method: 'PATCH', body: JSON.stringify({ sha: commit.sha, force: false }) });

      data = out; original = clone(out); dataSha = dataBlob.sha;
      dirty = false;
      try { localStorage.removeItem(DRAFT); } catch (e) { /* storage blocked */ }
      render();
      toast('Saved. The website shows your changes within a few minutes.', 6000);
    } catch (e) {
      if (e.auth) { toast(e.message, 8000); dropKey(); local.del(VAULT); dirty = false; setTimeout(() => location.reload(), 2500); }
      else toast(`Not saved: ${e.message}`, 8000);
    } finally {
      btn.disabled = false; btn.textContent = 'Save changes';
    }
  });

  /* preview opens the website with this draft */
  $('#btnPreview').addEventListener('click', () => { if (!keepDraft()) toast('Large new photos only show in preview after saving.'); });

  if (token) start($('#loginError')).then((ok) => { if (!ok && hasVault()) showScreen('unlock'); });
  else showScreen(hasVault() ? 'unlock' : 'login');
})();
