/* Nagorewala admin: edits the menu and kitchen photos, saved to the website through admin/api.php. */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const fmt = (v) => '₹' + Math.round(v).toLocaleString('en-IN');
  const DRAFT = 'nagorewala-admin-draft';
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const API = $('meta[name="nw-api"]').content;
  const CSRF = $('meta[name="nw-csrf"]').content;

  let original = clone(window.NAGOREWALA_DATA || { menu: { sweets: [], savouries: [] }, gallery: [] });
  let data = clone(original);
  let dirty = false, tab = 'sweets', editing = null;

  /* resume an unsaved draft from this browser */
  try {
    const draft = JSON.parse(localStorage.getItem(DRAFT));
    if (draft && draft.menu && JSON.stringify(draft) !== JSON.stringify(original)
      && confirm('You have unsaved changes from last time. Continue with them?\n\nChoose Cancel to start from the live website.')) {
      data = draft; dirty = true;
    }
  } catch (e) { /* no draft */ }

  /* ---------- server ---------- */
  async function api(action, body) {
    const headers = { 'X-CSRF-Token': CSRF };
    if (!(body instanceof FormData)) headers['Content-Type'] = 'application/json';
    const res = await fetch(`${API}?action=${action}`, { method: 'POST', headers, body: body instanceof FormData ? body : JSON.stringify(body), credentials: 'same-origin' });
    const json = await res.json().catch(() => ({}));
    if (res.status === 401) {
      try { localStorage.setItem(DRAFT, JSON.stringify(data)); } catch (e) { /* too large */ }
      alert(json.error || 'Please log in again. Your changes are kept in this browser.');
      location.reload();
    }
    if (!res.ok || !json.ok) throw new Error(json.error || `The server said ${res.status}.`);
    return json;
  }

  /* ---------- status, toast, draft ---------- */
  const toastEl = $('#toast');
  let toastTimer = 0;
  function toast(msg, ms = 3200) {
    toastEl.textContent = msg; toastEl.classList.add('show');
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
    return `<span class="ad-thumb" style="--c:${/^#[0-9a-f]{3,8}$/i.test(it.c || '') ? it.c : '#c48a22'}">${it.img ? `<img src="${esc(it.img)}" alt="">` : ''}</span>`;
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
        <button type="button" class="ad-btn ghost ad-edit" data-edit="${i}">Edit</button>
      </li>`).join('');
    $('#itemEmpty').hidden = shown.length > 0;
    $('#btnAdd').textContent = tab === 'savouries' ? '+ Add savoury' : '+ Add sweet';
  }
  list.addEventListener('click', (e) => {
    const mv = e.target.closest('[data-move]'), ed = e.target.closest('[data-edit]');
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
    photoView.innerHTML = draftImg ? `<img src="${esc(draftImg)}" alt="">` : '';
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
  $('#btnDelete').addEventListener('click', () => {
    const it = data.menu[editing.cat][editing.index];
    if (!confirm(`Delete ${it.n} from the menu?`)) return;
    data.menu[editing.cat].splice(editing.index, 1);
    dlg.close();
    markDirty();
    toast(`${it.n} deleted. Click Save changes to publish.`);
  });

  /* ---------- kitchen gallery ---------- */
  const gal = $('#galList');
  function renderGallery() {
    gal.innerHTML = data.gallery.map((g, i) => `
      <li class="ad-gcard">
        <img src="${esc(g.src)}" alt="${esc(g.alt || g.caption)}">
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

  /* ---------- save: upload new photos, then the menu ---------- */
  async function upload(dataUrl, kind, name) {
    const fd = new FormData();
    fd.append('photo', await (await fetch(dataUrl)).blob(), 'photo');
    fd.append('kind', kind);
    fd.append('name', name);
    return (await api('upload', fd)).path;
  }
  $('#btnSave').addEventListener('click', async () => {
    if (!dirty) { toast('Nothing to save. Everything is already live.'); return; }
    const btn = $('#btnSave');
    btn.disabled = true;
    try {
      const out = clone(data);
      const pending = [];
      for (const cat of ['sweets', 'savouries']) for (const it of out.menu[cat]) if (it.img && it.img.startsWith('data:')) pending.push(['sweet', it, 'img', it.n]);
      for (const g of out.gallery) if (g.src.startsWith('data:')) pending.push(['gallery', g, 'src', g.caption || 'kitchen']);
      let done = 0;
      for (const [kind, obj, key, name] of pending) {
        btn.textContent = `Uploading photo ${++done} of ${pending.length}…`;
        obj[key] = await upload(obj[key], kind, name);
        if (kind === 'sweet') delete obj.sq;
      }
      btn.textContent = 'Saving…';
      const res = await api('save', out);
      data = res.data; original = clone(res.data);
      dirty = false;
      localStorage.removeItem(DRAFT);
      render();
      toast('Saved. The website now shows your changes.', 4500);
    } catch (e) {
      toast(`Not saved: ${e.message}`, 7000);
    } finally {
      btn.disabled = false; btn.textContent = 'Save changes';
    }
  });

  /* preview opens the website with this draft */
  $('#btnPreview').addEventListener('click', () => { if (!keepDraft()) toast('Large new photos only show in preview after saving.'); });

  /* ---------- change password ---------- */
  const pwDlg = $('#pwDlg'), pwForm = $('#pwForm');
  $('#btnPassword').addEventListener('click', () => { pwForm.reset(); $('#pwError').textContent = ''; pwDlg.showModal(); });
  pwForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#pwError');
    if (pwForm.new.value.length < 10) { err.textContent = 'The new password needs at least 10 characters.'; return; }
    if (pwForm.new.value !== pwForm.confirm.value) { err.textContent = 'The two new passwords do not match.'; return; }
    try {
      await api('password', { current: pwForm.current.value, new: pwForm.new.value });
      pwDlg.close();
      toast('Password changed.');
    } catch (ex) { err.textContent = ex.message; }
  });

  render();
})();
