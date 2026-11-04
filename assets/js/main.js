/* Nagorewala Sweets */
(() => {
  const WA = '919865031779';
  const waLink = (msg) => `https://wa.me/${WA}?text=${encodeURIComponent(msg)}`;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const hasGsap = typeof window.gsap !== 'undefined' && typeof window.ScrollTrigger !== 'undefined';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const animate = hasGsap && !reduce;

  $('#yr').textContent = new Date().getFullYear();

  /* ---------- content from assets/js/data.js (edited with admin.html) ---------- */
  /* ?preview shows the admin's unsaved draft, kept in this browser only */
  let DATA = window.NAGOREWALA_DATA || { menu: { sweets: [], savouries: [] }, gallery: [] };
  if (new URLSearchParams(location.search).has('preview')) {
    try { const draft = JSON.parse(localStorage.getItem('nagorewala-admin-draft')); if (draft && draft.menu) DATA = draft; } catch (e) { /* no draft */ }
  }
  const MENU = { sweets: DATA.menu.sweets || [], savouries: DATA.menu.savouries || [] };
  const ITEMS = new Map([...MENU.sweets, ...MENU.savouries].map((it) => [it.n, it]));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const safeSrc = (s) => (/^(assets\/|data:image\/(png|jpeg|webp);base64,)/.test(s || '') ? esc(s) : '');
  const safeColour = (c) => (/^#[0-9a-f]{3,8}$/i.test(c || '') ? c : '#c48a22');
  const fmt = (v) => '₹' + Math.round(v).toLocaleString('en-IN');
  const wLabel = (w) => (w === 1 ? '1 kg' : '½ kg');
  const piece = (it) => safeSrc(it.img)
    ? `<span class="piece photo"><img src="${safeSrc(it.img)}" alt="" loading="lazy"></span>`
    : `<span class="piece" style="--c:${safeColour(it.c)}"></span>`;

  /* kitchen gallery */
  const kTrack = $('#kTrack');
  kTrack.insertAdjacentHTML('beforeend', (DATA.gallery || []).filter((g) => safeSrc(g.src)).map((g) =>
    `<figure class="k-card"><img src="${safeSrc(g.src)}" alt="${esc(g.alt || g.caption)}" loading="lazy">${g.caption ? `<figcaption>${esc(g.caption)}</figcaption>` : ''}</figure>`).join(''));

  /* ================= SWEET BOX ================= */
  const KEY = 'nagorewala-box-v1';
  let box = [];
  try { box = (JSON.parse(localStorage.getItem(KEY)) || []).filter((l) => ITEMS.has(l.n) && (l.w === 1 || l.w === .5) && l.q > 0); } catch (e) { box = []; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(box)); } catch (e) { /* storage unavailable */ } };
  const countAll = () => box.reduce((s, l) => s + l.q, 0);
  const total = () => box.reduce((s, l) => s + ITEMS.get(l.n).p * l.w * l.q, 0);

  const fab = $('#boxFab'), drawer = $('#boxDrawer'), overlay = $('#boxOverlay'), grid = $('#gbGrid'), linesEl = $('#bdLines');
  const packBtn = $('#boxPack'), sendBtn = $('#boxSend'), unpackBtn = $('#boxUnpack'), toast = $('#boxToast'), hero = $('.hero');
  let packed = false, lastKey = null, toastTimer = 0;

  function renderBox() {
    const n = countAll();
    $$('[data-box-count]').forEach((el) => (el.textContent = n));
    updateFab();

    const slots = box.map((l) => {
      const it = ITEMS.get(l.n);
      return `<div class="gb-slot" data-key="${esc(l.n)}|${l.w}" title="${esc(l.n)}, ${wLabel(l.w)}">${piece(it)}${l.q > 1 ? `<span class="gb-qty">×${l.q}</span>` : ''}<span class="gb-w">${wLabel(l.w)}</span></div>`;
    });
    const size = Math.max(6, Math.ceil(box.length / 3) * 3);
    while (slots.length < size) slots.push('<div class="gb-slot empty"></div>');
    grid.innerHTML = slots.join('');
    $('#gbEmpty').hidden = box.length > 0;

    linesEl.innerHTML = box.map((l, i) => {
      const it = ITEMS.get(l.n);
      return `<li class="bd-line">
        ${piece(it)}
        <div><p class="bd-name">${esc(l.n)}</p>
          <div class="bd-sub"><span class="bd-w" role="group" aria-label="Weight for ${esc(l.n)}">
            <button type="button" class="${l.w === .5 ? 'on' : ''}" data-act="w" data-i="${i}" data-w="0.5">½ kg</button>
            <button type="button" class="${l.w === 1 ? 'on' : ''}" data-act="w" data-i="${i}" data-w="1">1 kg</button>
          </span></div></div>
        <div class="bd-right"><span class="bd-price">${fmt(it.p * l.w * l.q)}</span>
          <span class="bd-step"><button type="button" data-act="dec" data-i="${i}" aria-label="One less ${esc(l.n)}">−</button><span>${l.q}</span><button type="button" data-act="inc" data-i="${i}" aria-label="One more ${esc(l.n)}">+</button></span></div>
      </li>`;
    }).join('');
    $('#bdTotal').textContent = fmt(total());
    packBtn.disabled = box.length === 0;

    /* how many of each sweet are already in the box, on the menu */
    $$('.mi-row', list).forEach((row) => {
      const q = box.filter((l) => l.n === row.dataset.add).reduce((s, l) => s + l.q, 0);
      $('.mi-count', row).textContent = q || '';
    });

    if (lastKey && animate && drawer.classList.contains('open')) {
      const slot = grid.querySelector(`[data-key="${CSS.escape(lastKey)}"] .piece`);
      if (slot) gsap.from(slot, { y: -50, scale: .4, rotate: -25, duration: .7, ease: 'bounce.out' });
    }
    lastKey = null;
  }

  function updateFab() {
    const past = scrollY > hero.offsetHeight * .6;
    fab.classList.toggle('is-hidden', !(past || countAll() > 0));
  }

  function showToast(html) {
    toast.innerHTML = html;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
  }

  function addToBox(name, w, fromEl) {
    const it = ITEMS.get(name);
    if (!it) return;
    if (packed) unpack(true);
    const line = box.find((l) => l.n === name && l.w === w);
    if (line) line.q += 1; else box.push({ n: name, w, q: 1 });
    lastKey = `${name}|${w}`;
    save();
    fab.classList.remove('is-hidden');
    const done = () => {
      renderBox();
      showToast(`Packed <b>${wLabel(w)} ${esc(name)}</b> into your box`);
    };
    if (animate && fromEl && !drawer.classList.contains('open')) flyToBox(it, fromEl, done); else done();
  }

  /* the sweet arcs from where it was tapped into the box button */
  function flyToBox(it, fromEl, done) {
    const a = fromEl.getBoundingClientRect(), b = $('.fab-box', fab).getBoundingClientRect();
    const el = document.createElement('div');
    el.className = 'fly';
    el.innerHTML = piece(it);
    document.body.appendChild(el);
    const sx = a.left + a.width / 2 - 32, sy = a.top + a.height / 2 - 32;
    const tx = b.left + b.width / 2 - 32, ty = b.top + b.height / 2 - 32;
    gsap.set(el, { x: sx, y: sy, scale: .6, rotate: 0 });
    const tl = gsap.timeline({ onComplete: () => { el.remove(); done(); } });
    tl.to(el, { scale: 1.1, duration: .2, ease: 'back.out(3)' })
      .add(() => fab.classList.add('is-catching'), .35)
      .to(el, { x: tx, duration: .75, ease: 'power1.inOut' }, .15)
      .to(el, { keyframes: [{ y: Math.min(sy, ty) - 120, duration: .32, ease: 'power2.out' }, { y: ty, duration: .43, ease: 'power2.in' }] }, .15)
      .to(el, { scale: .3, rotate: 220, duration: .75, ease: 'power1.in' }, .15)
      .to(el, { opacity: 0, duration: .1 }, .82)
      .add(() => {
        fab.classList.remove('is-catching');
        gsap.fromTo(fab, { scale: 1 }, { keyframes: [{ scale: 1.14, duration: .12 }, { scale: .95, duration: .12 }, { scale: 1, duration: .25, ease: 'back.out(3)' }] });
      }, .9);
  }

  linesEl.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-act]');
    if (!b || packed) return;
    const i = +b.dataset.i, l = box[i];
    if (b.dataset.act === 'inc') l.q += 1;
    if (b.dataset.act === 'dec') { l.q -= 1; if (l.q <= 0) box.splice(i, 1); }
    if (b.dataset.act === 'w') {
      const w = parseFloat(b.dataset.w);
      const twin = box.find((x) => x !== l && x.n === l.n && x.w === w);
      if (twin) { twin.q += l.q; box.splice(i, 1); } else l.w = w;
    }
    save();
    renderBox();
  });

  /* open / close */
  let lastFocus = null;
  function openBox() {
    lastFocus = document.activeElement;
    drawer.classList.add('open'); overlay.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    document.body.classList.add('box-open');
    setTimeout(() => $('#boxClose').focus(), 300);
    if (animate) gsap.from($$('.gb-slot:not(.empty) .piece', grid), { y: -30, scale: .5, opacity: 0, duration: .6, stagger: .06, delay: .25, ease: 'back.out(2)' });
  }
  function closeBox() {
    drawer.classList.remove('open'); overlay.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('box-open');
    if (lastFocus) lastFocus.focus({ preventScroll: true });
  }
  $$('[data-open-box]').forEach((b) => b.addEventListener('click', openBox));
  $('#boxClose').addEventListener('click', closeBox);
  overlay.addEventListener('click', closeBox);
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && drawer.classList.contains('open')) closeBox(); });

  /* packing: lid drops on, ribbon wraps, bow and tag pop */
  const packParts = ['.gb-lid', '.gb-ribbon-v', '.gb-ribbon-h', '.gb-bow', '.gb-tag'];
  function orderMessage() {
    const lines = box.map((l) => { const it = ITEMS.get(l.n); return `• ${l.n}, ${wLabel(l.w)} × ${l.q} = ${fmt(it.p * l.w * l.q)}`; });
    return `Hi Nagorewala, I'd like to order this sweet box:\n\n${lines.join('\n')}\n\nTotal: ${fmt(total())} (plus shipping)\n\nName:\nDelivery address:`;
  }
  function setPacked(on) {
    packed = on;
    drawer.classList.toggle('is-packed', on);
    packBtn.hidden = on; sendBtn.hidden = !on; unpackBtn.hidden = !on;
    if (on) sendBtn.href = waLink(orderMessage());
  }
  packBtn.addEventListener('click', () => {
    if (!box.length) return;
    $('.bd-body').scrollTo({ top: 0, behavior: 'smooth' });
    if (!animate) { packParts.forEach((s) => ($(s).style.visibility = 'visible')); setPacked(true); return; }
    packBtn.disabled = true;
    gsap.set(packParts, { visibility: 'visible' });
    gsap.timeline({ onComplete: () => { setPacked(true); gsap.from(sendBtn, { y: 10, opacity: 0, duration: .4 }); } })
      .fromTo('.gb-lid', { yPercent: -130, rotate: -8, opacity: 0 }, { yPercent: 0, rotate: 0, opacity: 1, duration: .75, ease: 'bounce.out' })
      .to('#giftbox', { keyframes: [{ scaleY: .95, scaleX: 1.02, duration: .1 }, { scaleY: 1, scaleX: 1, duration: .3, ease: 'back.out(3)' }] }, .42)
      .fromTo('.gb-ribbon-v', { scaleY: 0 }, { scaleY: 1, duration: .45, ease: 'power2.inOut' }, .75)
      .fromTo('.gb-ribbon-h', { scaleX: 0 }, { scaleX: 1, duration: .45, ease: 'power2.inOut' }, 1.05)
      .fromTo('.gb-bow', { scale: 0, rotate: -40 }, { scale: 1, rotate: 0, duration: .6, ease: 'back.out(2.2)' }, 1.4)
      .fromTo('.gb-tag', { y: -20, opacity: 0 }, { y: 0, opacity: 1, duration: .5, ease: 'back.out(2)' }, 1.65);
  });
  function unpack(instant) {
    const finish = () => { gsap.set(packParts, { clearProps: 'all' }); setPacked(false); packBtn.disabled = box.length === 0; };
    if (!animate || instant) { packParts.forEach((s) => ($(s).style.cssText = '')); setPacked(false); packBtn.disabled = box.length === 0; return; }
    gsap.timeline({ onComplete: finish })
      .to(['.gb-tag', '.gb-bow'], { scale: 0, opacity: 0, duration: .25, ease: 'power2.in' })
      .to(['.gb-ribbon-v', '.gb-ribbon-h'], { opacity: 0, duration: .2 }, '<.1')
      .to('.gb-lid', { yPercent: -130, rotate: 6, opacity: 0, duration: .5, ease: 'power3.in' });
  }
  unpackBtn.addEventListener('click', () => unpack(false));

  /* signature halwa size buttons */
  $$('[data-add]').forEach((b) => {
    if (b.classList.contains('mi-row')) return;
    b.addEventListener('click', () => {
      const art = b.closest('.sig-item');
      const from = (art && $('.sig-mob', art).offsetParent ? $('.sig-mob', art) : $('.sig-frame')) || b;
      addToBox(b.dataset.add, parseFloat(b.dataset.w), from);
    });
  });

  /* ---------- menu list ---------- */
  let cat = 'sweets', qty = 1;
  const list = $('#menuList');

  function renderMenu(animateIn) {
    list.innerHTML = MENU[cat].map((it) => `
      <li class="mi">
        <button type="button" class="mi-row" data-add="${esc(it.n)}" ${safeSrc(it.sq || it.img) ? `data-img="${safeSrc(it.sq || it.img)}"` : ''} aria-label="Add ${esc(it.n)} to your box">
          <span class="mi-thumb">${piece(it)}<span class="mi-count"></span></span>
          <span class="mi-name">${esc(it.n)}${it.sub ? ` <small>${esc(it.sub)}</small>` : it.tag ? ` <small>${esc(it.tag)}</small>` : ''}</span>
          <span class="mi-dots"></span>
          <span class="mi-price">${fmt(it.p * qty)}</span>
          <span class="mi-go" aria-hidden="true">+</span>
        </button>
      </li>`).join('');
    $$('.mi-row', list).forEach((row) => row.addEventListener('click', () => addToBox(row.dataset.add, qty, $('.mi-thumb', row))));
    if (animateIn && animate) gsap.from($$('.mi', list), { y: 20, opacity: 0, duration: .5, stagger: .03, ease: 'power3.out' });
    bindPreview();
    renderBox();
  }

  function updatePrices() {
    $$('.mi', list).forEach((li, i) => {
      const it = MENU[cat][i];
      const price = $('.mi-price', li);
      if (animate) {
        const o = { v: parseFloat(price.textContent.replace(/[^\d]/g, '')) };
        gsap.to(o, { v: it.p * qty, duration: .5, ease: 'power2.out', onUpdate: () => (price.textContent = fmt(o.v)) });
      } else price.textContent = fmt(it.p * qty);
    });
  }

  function placePill(seg) {
    const on = $('.seg-btn.is-on', seg), pill = $('.seg-pill', seg);
    pill.style.width = on.offsetWidth + 'px';
    pill.style.transform = `translateX(${on.offsetLeft - 4}px)`;
  }
  $$('.seg').forEach((seg) => {
    placePill(seg);
    $$('.seg-btn', seg).forEach((b) => b.addEventListener('click', () => {
      if (b.classList.contains('is-on')) return;
      $$('.seg-btn', seg).forEach((x) => { x.classList.toggle('is-on', x === b); if (x.hasAttribute('aria-selected')) x.setAttribute('aria-selected', x === b); });
      placePill(seg);
      if (b.dataset.cat) { cat = b.dataset.cat; renderMenu(true); if (hasGsap) ScrollTrigger.refresh(); }
      if (b.dataset.qty) { qty = parseFloat(b.dataset.qty); updatePrices(); }
    }));
  });
  addEventListener('resize', () => $$('.seg').forEach(placePill));
  document.fonts && document.fonts.ready.then(() => $$('.seg').forEach(placePill));

  /* menu hover preview that follows the cursor */
  const prev = $('#menuPreview'), prevImg = $('img', prev);
  let px = 0, py = 0, cx = 0, cy = 0, raf = 0;
  function loopPreview() {
    cx += (px - cx) * .16; cy += (py - cy) * .16;
    prev.style.transform = `translate(${cx + 30}px, ${cy - 140}px)`;
    raf = requestAnimationFrame(loopPreview);
  }
  function bindPreview() {
    if (!fine) return;
    $$('[data-img]', list).forEach((a) => {
      a.addEventListener('mouseenter', (e) => {
        prevImg.src = a.dataset.img; prev.classList.add('show');
        if (!raf) { cx = px = e.clientX; cy = py = e.clientY; loopPreview(); }
      });
      a.addEventListener('mouseleave', () => prev.classList.remove('show'));
    });
  }
  if (fine) addEventListener('mousemove', (e) => { px = e.clientX; py = e.clientY; });
  renderMenu(false);

  /* ---------- nav ---------- */
  const nav = $('#nav'), burger = $('#burger'), mnav = $('#mnav');

  /* shop staff: tap the logo three times quickly to open the admin login
     (only where the admin is installed; static hosts such as GitHub Pages have none) */
  let logoTaps = 0, logoTimer = 0;
  $('.nav-brand').addEventListener('click', () => {
    clearTimeout(logoTimer);
    if (++logoTaps >= 3) {
      logoTaps = 0;
      fetch('admin/', { method: 'HEAD', cache: 'no-store' })
        .then((r) => { if (r.ok) location.href = 'admin/'; })
        .catch(() => {});
      return;
    }
    logoTimer = setTimeout(() => (logoTaps = 0), 700);
  });
  burger.addEventListener('click', () => {
    const open = burger.getAttribute('aria-expanded') !== 'true';
    burger.setAttribute('aria-expanded', open);
    mnav.classList.toggle('open', open);
    document.body.style.overflow = open ? 'hidden' : '';
    if (open && animate) gsap.from($$('a', mnav), { y: 30, opacity: 0, stagger: .05, duration: .6, delay: .2, ease: 'power3.out' });
  });
  $$('a', mnav).forEach((a) => a.addEventListener('click', () => {
    burger.setAttribute('aria-expanded', 'false'); mnav.classList.remove('open'); document.body.style.overflow = '';
  }));
  let lastY = 0;
  const onScroll = () => {
    const y = scrollY;
    nav.classList.toggle('scrolled', y > 40);
    nav.classList.toggle('hide', y > lastY && y > 400 && !mnav.classList.contains('open'));
    updateFab();
    lastY = y;
  };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* smooth anchor scrolling (kept out of CSS so ScrollTrigger can measure pins) */
  $$('a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => {
    const t = a.getAttribute('href') === '#home' ? document.body : $(a.getAttribute('href'));
    if (!t) return;
    e.preventDefault();
    scrollTo({ top: t === document.body ? 0 : t.getBoundingClientRect().top + scrollY, behavior: reduce ? 'auto' : 'smooth' });
  }));

  /* active nav link */
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting) $$('.nav-links a').forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#' + e.target.id));
  }), { rootMargin: '-45% 0px -50% 0px' });
  $$('main section[id]').forEach((s) => io.observe(s));

  /* marquee: second copy of the track for a seamless loop */
  $$('.mq-row').forEach((row) => row.appendChild($('.mq-track', row).cloneNode(true)));

  /* ---------- signatures: swap sticky image ---------- */
  const sigSec = $('#signatures'), sigImgs = $$('.sig-img'), sigItems = $$('.sig-item'), sigNum = $('#sigNum');
  let sigOn = 0;
  function setSig(i) {
    if (i === sigOn) return;
    sigImgs.forEach((im, k) => { im.classList.toggle('was-on', k === sigOn); im.classList.toggle('is-on', k === i); });
    sigItems.forEach((it, k) => it.classList.toggle('is-on', k === i));
    sigOn = i;
    sigNum.textContent = String(i + 1).padStart(2, '0');
    sigSec.style.setProperty('--accent', sigItems[i].dataset.color);
  }
  sigItems[0].classList.add('is-on');
  sigSec.style.setProperty('--accent', sigItems[0].dataset.color);
  const sio = new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting) setSig(sigItems.indexOf(e.target));
  }), { rootMargin: '-48% 0px -48% 0px' });
  sigItems.forEach((it) => sio.observe(it));

  /* ---------- no-animation fallback ---------- */
  const loader = $('#loader');
  if (!animate) { loader.classList.add('done'); return; }

  /* ================= GSAP ================= */
  gsap.registerPlugin(ScrollTrigger);

  /* split headings into words */
  $$('.split').forEach((el) => {
    const walk = (node) => {
      [...node.childNodes].forEach((n) => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach((t) => {
            if (!t) return;
            if (/^\s+$/.test(t)) frag.appendChild(document.createTextNode(' '));
            else { const w = document.createElement('span'); w.className = 'w'; w.innerHTML = `<span>${t}</span>`; frag.appendChild(w); }
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1) walk(n);
      });
    };
    walk(el);
  });

  /* intro: loader opens onto the Dargah */
  const heroWords = $$('.hero-title .w > span');
  gsap.set(heroWords, { yPercent: 110 });
  gsap.set(['.hero-eyebrow', '.hero-sub', '.hero-ctas > *', '.hero-facts > div', '.hero-caption'], { y: 24, opacity: 0 });
  gsap.set('.hero-img', { scale: 1.18 });
  gsap.set('.hero-shade', { opacity: .6 });
  gsap.set('.nav', { y: -20, opacity: 0 });

  const intro = gsap.timeline({ paused: true, defaults: { ease: 'power4.out' } });
  intro
    .to('.loader-inner', { y: -24, opacity: 0, duration: .45, ease: 'power2.in' })
    .to('.loader-panel.top', { yPercent: -100, duration: 1.1, ease: 'expo.inOut' }, '-=.1')
    .to('.loader-panel.bottom', { yPercent: 100, duration: 1.1, ease: 'expo.inOut' }, '<')
    .to('.hero-img', { scale: 1.04, duration: 2.6, ease: 'power3.out' }, '<')
    .to('.hero-shade', { opacity: 1, duration: 1.6, ease: 'power2.out' }, '<.3')
    .set(loader, { className: 'done' })
    .to('.nav', { y: 0, opacity: 1, duration: .8 }, '-=1.6')
    .to('.hero-eyebrow', { y: 0, opacity: 1, duration: .8 }, '-=1.5')
    .to(heroWords, { yPercent: 0, duration: 1.1, stagger: .05 }, '-=1.4')
    .to('.hero-sub', { y: 0, opacity: 1, duration: .9 }, '-=.9')
    .to('.hero-ctas > *', { y: 0, opacity: 1, duration: .8, stagger: .08 }, '-=.75')
    .to(['.hero-facts > div', '.hero-caption'], { y: 0, opacity: 1, duration: .8, stagger: .07 }, '-=.6');

  const load = gsap.timeline();
  load.from('.loader-logo', { scale: .5, opacity: 0, duration: .7, ease: 'back.out(1.6)' })
      .from(['.loader-ta', '.loader-en'], { y: 14, opacity: 0, duration: .5, stagger: .08, ease: 'power3.out' }, '-=.35')
      .to('.loader-bar span', { scaleX: 1, duration: .8, ease: 'power2.inOut' }, '-=.25')
      .add(() => intro.play());
  setTimeout(() => { if (!loader.classList.contains('done')) { load.progress(1); intro.progress(1); } }, 5000);

  /* hero: Dargah drifts as you scroll away */
  gsap.to('.hero-img', { yPercent: 10, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });
  gsap.to(['.hero-inner', '.hero-foot'], { y: -60, opacity: 0, ease: 'none', scrollTrigger: { trigger: '.hero', start: '30% top', end: 'bottom top', scrub: true } });

  /* split headings reveal (not hero) */
  $$('.split').forEach((el) => {
    if (el.classList.contains('hero-title')) return;
    gsap.from($$('.w > span', el), { yPercent: 110, duration: 1, stagger: .04, ease: 'power4.out', scrollTrigger: { trigger: el, start: 'top 86%' } });
  });

  /* generic reveals */
  gsap.set('.reveal', { opacity: 0 });
  ScrollTrigger.batch('.reveal', {
    start: 'top 90%',
    onEnter: (els) => gsap.fromTo(els, { y: 32, opacity: 0 }, { y: 0, opacity: 1, duration: .9, stagger: .08, ease: 'power3.out', overwrite: true }),
  });
  $$('.eyebrow').forEach((el) => {
    if (el.closest('.hero')) return;
    gsap.from(el, { x: -16, opacity: 0, duration: .8, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 90%' } });
  });

  /* story */
  const storyIn = { trigger: '.story', start: 'top 70%' };
  gsap.from('.story-frame', { y: 40, opacity: 0, duration: 1.2, ease: 'power3.out', scrollTrigger: storyIn });
  gsap.from('.story-frame img', { scale: 1.12, duration: 1.8, ease: 'power3.out', scrollTrigger: storyIn });
  gsap.from('.frame-cap', { y: 16, opacity: 0, duration: .9, delay: .4, ease: 'power3.out', scrollTrigger: storyIn });

  /* counters */
  $$('[data-count]').forEach((el) => {
    const o = { v: 0 };
    el.textContent = '0';
    gsap.to(o, { v: +el.dataset.count, duration: 1.8, ease: 'power2.out', scrollTrigger: { trigger: el, start: 'top 90%' }, onUpdate: () => (el.textContent = Math.round(o.v)) });
  });

  /* promise cards */
  gsap.from('.pcard', { y: 60, opacity: 0, duration: 1, stagger: .12, ease: 'power3.out', scrollTrigger: { trigger: '.promise-grid', start: 'top 84%' } });

  /* menu */
  gsap.from('.menu-controls', { y: 16, opacity: 0, duration: .8, ease: 'power3.out', scrollTrigger: { trigger: '.menu', start: 'top 75%' } });
  ScrollTrigger.create({ trigger: '#menuList', start: 'top 86%', once: true, onEnter: () => gsap.from($$('.mi', list), { y: 24, opacity: 0, duration: .6, stagger: .03, ease: 'power3.out' }) });

  /* kitchen: horizontal scroll on desktop */
  const mm = gsap.matchMedia();
  mm.add('(min-width: 901px)', () => {
    const track = $('#kTrack');
    const dist = () => track.scrollWidth - innerWidth;
    gsap.to(track, {
      x: () => -dist(), ease: 'none',
      scrollTrigger: { trigger: '.kitchen', start: 'top top', end: () => '+=' + dist(), pin: '.kitchen-pin', scrub: 1, invalidateOnRefresh: true, anticipatePin: 1 },
    });
  });
  mm.add('(max-width: 900px)', () => {
    gsap.from('.k-card', { x: 50, opacity: 0, duration: .9, stagger: .07, ease: 'power3.out', scrollTrigger: { trigger: '.kitchen', start: 'top 70%' } });
  });

  /* cta */
  $$('.cp').forEach((p, i) => {
    gsap.to(p, { y: i % 2 ? -18 : 18, duration: 3.5 + i * .5, ease: 'sine.inOut', repeat: -1, yoyo: true });
    gsap.from(p, { scale: 0, duration: 1.1, ease: 'back.out(1.5)', delay: i * .08, scrollTrigger: { trigger: '.cta', start: 'top 70%' } });
  });
  gsap.from('.footer-word', { yPercent: 50, opacity: 0, duration: 1.3, ease: 'power3.out', scrollTrigger: { trigger: '.footer', start: 'top 80%' } });

  addEventListener('load', () => ScrollTrigger.refresh());
})();
