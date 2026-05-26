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
      const apiRes = await fetch('/api/gallery');
      if (apiRes.ok) {
        const data = await apiRes.json();
        photos = (data.photos || []).filter((p) => p.src);
      }
      if (!photos.length) {
        const res = await fetch('/images/manifest.json');
        if (res.ok) {
          const data = await res.json();
          photos = (data.photos || data).filter((p) => p.src && !String(p.src).includes('logo'));
        }
      }
      const local = await tryDiscoverImages();
      if (local.length > 0) photos = local;
    } catch (_) {
      photos = await tryDiscoverImages();
    }
    if (!photos.length) {
      EMPTY?.classList.remove('hidden');
      if (EMPTY) EMPTY.textContent = 'Добавьте фото в админ-панели /admin';
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
      const src = `/images/${String(i).padStart(2, '0')}.jpg`;
      if (await imageExists(src)) found.push({ src, title: `DVIN ${i}`, category: 'all' });
      else if (i > 3 && found.length) break;
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
    if (HERO_BG && p(0)) HERO_BG.style.backgroundImage = `url('${url(p(0))}')`;
    if (ABOUT_MAIN && p(1)) ABOUT_MAIN.style.backgroundImage = `url('${url(p(1))}')`;
    if (ABOUT_ACCENT && p(2)) ABOUT_ACCENT.style.backgroundImage = `url('${url(p(2))}')`;
    document.querySelectorAll('.room-card__img').forEach((el, i) => {
      const src = p(3 + i) || p(i % photos.length);
      if (src) el.style.backgroundImage = `url('${url(src)}')`;
    });
  }

  function buildMarquee() {
    if (!MARQUEE) return;
    MARQUEE.innerHTML = [...photos, ...photos]
      .map((ph) => `<div class="marquee__item"><img src="${url(ph.src)}" alt="" loading="lazy"></div>`)
      .join('');
  }

  function buildOverview() {
    if (!THUMBS || !FEATURED || !photos[0]) return;
    FEATURED.src = url(photos[0].src);
    THUMBS.innerHTML = photos
      .map(
        (ph, i) =>
          `<button type="button" class="overview__thumb${i === 0 ? ' active' : ''}" data-index="${i}">
            <img src="${url(ph.src)}" alt="" loading="lazy">
          </button>`
      )
      .join('');
    THUMBS.querySelectorAll('.overview__thumb').forEach((btn) => {
      btn.addEventListener('click', () => setFeatured(Number(btn.dataset.index)));
    });
    FEATURED_BTN?.addEventListener('click', () => openLightbox(featuredIndex));
  }

  function setFeatured(i) {
    featuredIndex = i;
    const ph = photos[i];
    if (!ph || !FEATURED) return;
    FEATURED.src = url(ph.src);
    THUMBS?.querySelectorAll('.overview__thumb').forEach((b, j) => b.classList.toggle('active', j === i));
  }

  function buildGrid() {
    if (!GRID) return;
    GRID.innerHTML = '';
    filtered.forEach((ph, i) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `gallery__item reveal ${layouts[i % layouts.length]}`.trim();
      el.innerHTML = `<img src="${url(ph.src)}" alt="" loading="lazy">
        <span class="gallery__item-overlay"><span class="gallery__item-icon">⊕</span>
        <span class="gallery__item-title">${ph.title || 'DVIN'}</span></span>`;
      el.addEventListener('click', () => openLightbox(photos.indexOf(ph)));
      GRID.appendChild(el);
      new IntersectionObserver(
        ([e]) => {
          if (e.isIntersecting) {
            el.classList.add('reveal--visible');
          }
        },
        { threshold: 0.1 }
      ).observe(el);
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
    LB_IMG.src = url(photos[index].src);
    LB_CAP.textContent = photos[index].title || 'DVIN';
    LB_CNT.textContent = `${index + 1} / ${photos.length}`;
    LIGHTBOX?.classList.add('lightbox--open');
    document.body.style.overflow = 'hidden';
  }

  function closeLightbox() {
    LIGHTBOX?.classList.remove('lightbox--open');
    document.body.style.overflow = '';
  }

  function stepLightbox(dir) {
    lightboxIndex = (lightboxIndex + dir + photos.length) % photos.length;
    openLightbox(lightboxIndex);
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

  loadPhotos();
})();
