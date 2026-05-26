(function () {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const GRID = document.getElementById('gallery-grid');
  const MARQUEE = document.getElementById('marquee');
  const THUMBS = document.getElementById('overview-thumbs');
  const FEATURED = document.getElementById('featured-img');
  const FEATURED_BTN = document.getElementById('featured-main');
  const HERO_BG = document.getElementById('hero-bg');
  const ABOUT_MAIN = document.getElementById('about-main');
  const ABOUT_ACCENT = document.getElementById('about-accent');
  const EMPTY = document.getElementById('gallery-empty');
  const FILTERS = document.getElementById('gallery-filters');

  const LIGHTBOX = document.getElementById('lightbox');
  const LB_IMG = document.getElementById('lightbox-img');
  const LB_CAP = document.getElementById('lightbox-caption');
  const LB_CNT = document.getElementById('lightbox-counter');
  const LB_CLOSE = document.getElementById('lightbox-close');
  const LB_PREV = document.getElementById('lightbox-prev');
  const LB_NEXT = document.getElementById('lightbox-next');

  let photos = [];
  let filtered = [];
  let lightboxIndex = 0;
  let featuredIndex = 0;

  const layouts = ['', 'gallery__item--wide', 'gallery__item--tall', 'gallery__item--wide', '', ''];

  async function loadPhotos() {
    try {
      const res = await fetch('images/manifest.json');
      if (!res.ok) throw new Error('no manifest');
      const data = await res.json();
      photos = (data.photos || data).filter((p) => p.src && !p.src.includes('logo'));
      if (!Array.isArray(photos)) photos = [];
      const local = await tryDiscoverImages();
      if (local.length > 0) photos = local;
    } catch (_) {
      photos = await tryDiscoverImages();
    }
    if (photos.length === 0) {
      EMPTY?.classList.remove('hidden');
      return;
    }
    EMPTY?.classList.add('hidden');
    filtered = [...photos];
    applySiteImages();
    buildMarquee();
    buildOverview();
    buildGrid();
    bindFilters();
  }

  async function tryDiscoverImages() {
    const found = [];
    for (let i = 1; i <= 40; i++) {
      const src = `images/${String(i).padStart(2, '0')}.jpg`;
      const ok = await imageExists(src);
      if (ok) {
        found.push({ src, title: `Dvin — фото ${i}`, category: 'all' });
      } else if (i > 3 && found.length > 0) break;
    }
    return found;
  }

  function imageExists(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = src;
    });
  }

  function url(src) {
    return encodeURI(src).replace(/#/g, '%23');
  }

  function applySiteImages() {
    const p = (i) => photos[i]?.src;
    if (HERO_BG && p(0)) {
      HERO_BG.style.backgroundImage = `url('${url(p(0))}')`;
    }
    if (ABOUT_MAIN && p(1)) {
      ABOUT_MAIN.style.backgroundImage = `url('${url(p(1))}')`;
    }
    if (ABOUT_ACCENT && p(2)) {
      ABOUT_ACCENT.style.backgroundImage = `url('${url(p(2))}')`;
    }
    const roomImgs = document.querySelectorAll('.room-card__img');
    roomImgs.forEach((el, i) => {
      const src = p(3 + i) || p(i % photos.length);
      if (src) el.style.backgroundImage = `url('${url(src)}')`;
    });
  }

  function buildMarquee() {
    if (!MARQUEE) return;
    const dup = [...photos, ...photos];
    MARQUEE.innerHTML = dup
      .map(
        (ph) =>
          `<div class="marquee__item"><img src="${url(ph.src)}" alt="${ph.title || 'Dvin'}" loading="lazy"></div>`
      )
      .join('');
  }

  function buildOverview() {
    if (!THUMBS || !FEATURED) return;
    FEATURED.src = url(photos[0].src);
    FEATURED.alt = photos[0].title || 'Dvin';

    THUMBS.innerHTML = photos
      .map(
        (ph, i) =>
          `<button type="button" class="overview__thumb${i === 0 ? ' active' : ''}" data-index="${i}" aria-label="Фото ${i + 1}">
            <img src="${url(ph.src)}" alt="" loading="lazy">
          </button>`
      )
      .join('');

    THUMBS.querySelectorAll('.overview__thumb').forEach((btn) => {
      btn.addEventListener('click', () => {
        const i = Number(btn.dataset.index);
        setFeatured(i);
      });
    });

    FEATURED_BTN?.addEventListener('click', () => openLightbox(featuredIndex));
  }

  function setFeatured(i) {
    featuredIndex = i;
    const ph = photos[i];
    if (!ph || !FEATURED) return;
    FEATURED.style.opacity = '0';
    setTimeout(() => {
      FEATURED.src = url(ph.src);
      FEATURED.alt = ph.title || 'Dvin';
      FEATURED.style.opacity = '1';
    }, 180);
    THUMBS?.querySelectorAll('.overview__thumb').forEach((b, j) => {
      b.classList.toggle('active', j === i);
    });
  }

  function buildGrid() {
    if (!GRID) return;
    GRID.innerHTML = '';
    filtered.forEach((ph, i) => {
      const layout = layouts[i % layouts.length];
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `gallery__item reveal ${layout}`.trim();
      el.dataset.index = String(photos.indexOf(ph));
      el.dataset.category = ph.category || 'all';
      el.innerHTML = `
        <img src="${url(ph.src)}" alt="${ph.title || 'Dvin'}" loading="lazy">
        <span class="gallery__item-overlay">
          <span class="gallery__item-icon">⊕</span>
          <span class="gallery__item-title">${ph.title || 'Dvin'}</span>
        </span>`;
      el.addEventListener('click', () => openLightbox(photos.indexOf(ph)));
      GRID.appendChild(el);
      observeReveal(el);
    });
  }

  function bindFilters() {
    FILTERS?.querySelectorAll('.gallery__filter').forEach((btn) => {
      btn.addEventListener('click', () => {
        FILTERS.querySelectorAll('.gallery__filter').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const f = btn.dataset.filter;
        filtered = f === 'all' ? [...photos] : photos.filter((p) => p.category === f);
        buildGrid();
      });
    });
  }

  function openLightbox(index) {
    lightboxIndex = index;
    updateLightbox();
    LIGHTBOX?.classList.add('lightbox--open');
    LIGHTBOX?.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeLightbox() {
    LIGHTBOX?.classList.remove('lightbox--open');
    LIGHTBOX?.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  function updateLightbox() {
    const ph = photos[lightboxIndex];
    if (!ph) return;
    LB_IMG.src = url(ph.src);
    LB_CAP.textContent = ph.title || 'Dvin';
    LB_CNT.textContent = `${lightboxIndex + 1} / ${photos.length}`;
  }

  function stepLightbox(dir) {
    lightboxIndex = (lightboxIndex + dir + photos.length) % photos.length;
    LB_IMG.classList.add('lightbox__img--fade');
    setTimeout(() => {
      updateLightbox();
      LB_IMG.classList.remove('lightbox__img--fade');
    }, 150);
  }

  LB_CLOSE?.addEventListener('click', closeLightbox);
  LB_PREV?.addEventListener('click', () => stepLightbox(-1));
  LB_NEXT?.addEventListener('click', () => stepLightbox(1));
  LIGHTBOX?.addEventListener('click', (e) => {
    if (e.target === LIGHTBOX) closeLightbox();
  });
  document.addEventListener('keydown', (e) => {
    if (!LIGHTBOX?.classList.contains('lightbox--open')) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') stepLightbox(-1);
    if (e.key === 'ArrowRight') stepLightbox(1);
  });

  let touchX = 0;
  LIGHTBOX?.addEventListener(
    'touchstart',
    (e) => {
      touchX = e.changedTouches[0].screenX;
    },
    { passive: true }
  );
  LIGHTBOX?.addEventListener(
    'touchend',
    (e) => {
      const dx = e.changedTouches[0].screenX - touchX;
      if (Math.abs(dx) > 50) stepLightbox(dx > 0 ? -1 : 1);
    },
    { passive: true }
  );

  function observeReveal(el) {
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            en.target.classList.add('reveal--visible');
            obs.unobserve(en.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );
    obs.observe(el);
  }

  window.DvinGallery = { openLightbox, getPhotos: () => photos };
  loadPhotos();
})();
