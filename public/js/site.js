(function () {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      ...opts,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Ошибка');
    return data;
  }

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s ?? '';
    return d.innerHTML;
  }

  function fmtPrice(n) {
    return n ? `${Number(n).toLocaleString('ru-RU')} ₽` : '';
  }

  async function loadSettings() {
    try {
      const s = await api('/api/settings');
      const phone = document.getElementById('contact-phone');
      const email = document.getElementById('contact-email');
      if (phone && s.phone) {
        phone.textContent = s.phone;
        phone.href = `tel:${s.phone.replace(/\s/g, '')}`;
      }
      if (email && s.email) {
        email.textContent = s.email;
        email.href = `mailto:${s.email}`;
      }
      const addr = document.getElementById('contact-address');
      if (addr) addr.innerHTML = `<strong>Адрес:</strong> ${esc(s.region || '')}, ${esc(s.address || '')}<br><strong>Море:</strong> ${esc(s.seaDistance || '')}`;
      const heroLead = document.querySelector('.hero__lead');
      if (heroLead && s.description) heroLead.textContent = s.description;
      const aboutP = document.querySelector('.about__text p');
      if (aboutP && s.description) aboutP.innerHTML = `<strong>DVIN</strong> — ${esc(s.description)}`;
    } catch (_) {}
  }

  async function loadRooms() {
    const grid = document.getElementById('rooms-grid');
    if (!grid) return;
    try {
      const rooms = await api('/api/rooms');
      grid.innerHTML = rooms
        .map(
          (r, i) => `<article class="room-card${r.badge ? ' room-card--featured' : ''}">
          ${r.badge ? `<span class="room-card__badge">${esc(r.badge)}</span>` : ''}
          <div class="room-card__img" data-room-img="${i}" style="${r.image ? `background-image:url('${r.image}')` : ''}"></div>
          <div class="room-card__body">
            <div class="room-card__top">
              <h3>${esc(r.title)}</h3>
              <span class="room-card__price">${esc(r.priceLabel || fmtPrice(r.pricePerNight))}</span>
            </div>
            <p>${esc(r.description)}</p>
            <ul class="room-card__tags">
              <li>${r.guestsMin}–${r.guestsMax} гостя</li>
              ${r.area ? `<li>${r.area} м²</li>` : ''}
            </ul>
            <a href="#booking" class="room-card__link" data-room-id="${r.id}">Забронировать →</a>
          </div>
        </article>`
        )
        .join('');

      const select = document.getElementById('booking-room');
      if (select) {
        select.innerHTML = '<option value="">Выберите номер</option>' +
          rooms.map((r) => `<option value="${r.id}">${esc(r.title)} — ${esc(r.priceLabel)}</option>`).join('');
      }

      grid.querySelectorAll('[data-room-id]').forEach((a) => {
        a.addEventListener('click', () => {
          const id = a.dataset.roomId;
          const sel = document.getElementById('booking-room');
          if (sel) sel.value = id;
        });
      });
    } catch (e) {
      grid.innerHTML = '<p>Не удалось загрузить номера</p>';
    }
  }

  let reviewIdx = 0;
  let reviewTimer;

  async function loadReviews() {
    const slider = document.getElementById('reviews');
    const dots = document.getElementById('review-dots');
    const badge = document.getElementById('reviews-badge');
    if (!slider) return;

    try {
      const { items, count, average } = await api('/api/reviews');
      if (badge) badge.innerHTML = `★ ${average} · ${count} отзывов`;
      const hr = document.getElementById('hero-rating');
      const hrc = document.getElementById('hero-reviews-count');
      if (hr) hr.textContent = `★ ${average}`;
      if (hrc) hrc.textContent = `${count} отзывов`;
      if (!items.length) return;

      slider.innerHTML = items
        .map(
          (r, i) => `<blockquote class="review${i === 0 ? ' review--active' : ''}">
          <p>«${esc(r.text)}»</p>
          <footer>— ${esc(r.name)}${r.city ? `, ${esc(r.city)}` : ''} · ★ ${r.rating}</footer>
        </blockquote>`
        )
        .join('');

      if (dots) {
        dots.innerHTML = items.map((_, i) => `<button ${i === 0 ? 'class="active"' : ''} aria-label="${i + 1}"></button>`).join('');
      }

      const reviews = slider.querySelectorAll('.review');
      const dotBtns = dots?.querySelectorAll('button') || [];

      function show(i) {
        reviewIdx = i;
        reviews.forEach((r, j) => r.classList.toggle('review--active', j === i));
        dotBtns.forEach((d, j) => d.classList.toggle('active', j === i));
      }

      dotBtns.forEach((btn, i) => btn.addEventListener('click', () => show(i)));
      clearInterval(reviewTimer);
      reviewTimer = setInterval(() => show((reviewIdx + 1) % reviews.length), 6000);
    } catch (_) {}
  }

  function initBookingForm() {
    const form = document.getElementById('booking-form');
    const msg = document.getElementById('booking-msg');
    const success = document.getElementById('booking-success');
    if (!form) return;

    const checkin = form.querySelector('[name="checkin"]');
    const checkout = form.querySelector('[name="checkout"]');
    const today = new Date().toISOString().slice(0, 10);
    if (checkin) checkin.min = today;
    if (checkout) checkout.min = today;
    checkin?.addEventListener('change', () => {
      if (checkout && checkin.value) checkout.min = checkin.value;
      updatePriceEstimate();
    });
    checkout?.addEventListener('change', updatePriceEstimate);
    form.querySelector('[name="roomId"]')?.addEventListener('change', updatePriceEstimate);

    async function updatePriceEstimate() {
      const el = document.getElementById('booking-estimate');
      if (!el) return;
      const roomId = form.querySelector('[name="roomId"]')?.value;
      const ci = checkin?.value;
      const co = checkout?.value;
      if (!roomId || !ci || !co) {
        el.textContent = '';
        return;
      }
      const nights = Math.round((new Date(co) - new Date(ci)) / 86400000);
      if (nights < 1) {
        el.textContent = '';
        return;
      }
      try {
        const rooms = await api('/api/rooms');
        const room = rooms.find((r) => r.id === roomId);
        if (room) el.textContent = `Ориентир: ${fmtPrice(room.pricePerNight * nights)} за ${nights} ноч.`;
      } catch (_) {}
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      msg.className = 'form-msg hidden';
      success?.classList.add('hidden');
      try {
        const fd = new FormData(form);
        const res = await api('/api/bookings', {
          method: 'POST',
          body: {
            roomId: fd.get('roomId'),
            checkIn: fd.get('checkin'),
            checkOut: fd.get('checkout'),
            name: fd.get('name'),
            phone: fd.get('phone'),
            email: fd.get('email'),
            guests: fd.get('guests'),
            message: fd.get('message'),
          },
        });
        success.textContent = res.message || 'Заявка отправлена!';
        success.classList.remove('hidden');
        form.reset();
      } catch (err) {
        msg.textContent = err.message;
        msg.className = 'form-msg error';
      }
    });
  }

  function initReviewForm() {
    const form = document.getElementById('review-form');
    const msg = document.getElementById('review-form-msg');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const fd = new FormData(form);
        const res = await api('/api/reviews', {
          method: 'POST',
          body: {
            name: fd.get('name'),
            city: fd.get('city'),
            text: fd.get('text'),
            rating: fd.get('rating'),
            roomTitle: fd.get('roomTitle'),
          },
        });
        msg.textContent = res.message || 'Спасибо!';
        msg.className = 'form-msg success';
        form.reset();
      } catch (err) {
        msg.textContent = err.message;
        msg.className = 'form-msg error';
      }
    });
  }

  async function init() {
    await loadSettings();
    await loadRooms();
    await loadReviews();
    initBookingForm();
    initReviewForm();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
