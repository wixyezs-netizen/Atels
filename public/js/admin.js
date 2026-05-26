(function () {
  if (typeof document === 'undefined') return;

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

  let rooms = [];
  let modalSaveFn = null;

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      credentials: 'same-origin',
      headers: opts.body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
      ...opts,
      body: opts.body instanceof FormData ? opts.body : opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Ошибка');
    return data;
  }

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2800);
  }

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s ?? '';
    return d.innerHTML;
  }

  function showApp(on) {
    $('#login-screen').classList.toggle('hidden', on);
    $('#admin-app').classList.toggle('hidden', !on);
  }

  function openModal(title, html, onSave) {
    $('#modal-title').textContent = title;
    $('#modal-body').innerHTML = html;
    modalSaveFn = onSave;
    $('#modal').classList.remove('hidden');
  }

  function closeModal() {
    $('#modal').classList.add('hidden');
    modalSaveFn = null;
  }

  $('#modal-close')?.addEventListener('click', closeModal);
  $('#modal-save')?.addEventListener('click', () => modalSaveFn?.());

  $$('.sidebar nav a[data-panel]').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const id = a.dataset.panel;
      $$('.sidebar nav a').forEach((x) => x.classList.remove('active'));
      a.classList.add('active');
      $$('.panel').forEach((p) => p.classList.remove('active'));
      $(`#panel-${id}`).classList.add('active');
    });
  });

  async function checkAuth() {
    const { authenticated } = await api('/api/admin/check');
    showApp(authenticated);
    if (authenticated) await refreshAll();
  }

  $('#login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/api/admin/login', { method: 'POST', body: { password: $('#password').value } });
      showApp(true);
      await refreshAll();
    } catch (err) {
      const el = $('#login-error');
      el.textContent = err.message;
      el.classList.remove('hidden');
    }
  });

  $('#logout-btn')?.addEventListener('click', async (e) => {
    e.preventDefault();
    await api('/api/admin/logout', { method: 'POST' });
    showApp(false);
  });

  async function refreshAll() {
    await Promise.all([loadDashboard(), loadBookings(), loadReviews(), loadRooms(), loadGalleryAdmin(), loadSettingsForm()]);
  }

  async function loadDashboard() {
    const [bookings, reviews] = await Promise.all([
      api('/api/admin/bookings'),
      api('/api/admin/reviews'),
    ]);
    const pendingB = bookings.items.filter((b) => b.status === 'pending').length;
    const pendingR = reviews.items.filter((r) => r.status === 'pending').length;
    $('#badge-bookings').textContent = pendingB || '';
    $('#badge-reviews').textContent = pendingR || '';
    $('#stats').innerHTML = `
      <div class="stat"><strong>${bookings.items.length}</strong><span>всего броней</span></div>
      <div class="stat"><strong>${pendingB}</strong><span>ожидают ответа</span></div>
      <div class="stat"><strong>${reviews.items.filter((r) => r.status === 'published').length}</strong><span>отзывов на сайте</span></div>
      <div class="stat"><strong>${pendingR}</strong><span>отзывов на модерации</span></div>`;
  }

  async function loadBookings() {
    const status = $('#filter-booking-status')?.value;
    const url = status ? `/api/admin/bookings?status=${status}` : '/api/admin/bookings';
    const { items } = await api(url);
    const tbody = $('#bookings-table tbody');
    tbody.innerHTML = items
      .map(
        (b) => `<tr>
        <td>${esc(b.checkIn)} → ${esc(b.checkOut)}<br><small>${b.nights} ноч.</small></td>
        <td>${esc(b.roomTitle)}</td>
        <td>${esc(b.name)}<br><small>${b.guests} гост.</small></td>
        <td><a href="tel:${esc(b.phone)}">${esc(b.phone)}</a></td>
        <td>${b.totalPrice ? b.totalPrice.toLocaleString('ru-RU') + ' ₽' : '—'}</td>
        <td><span class="status status-${b.status}">${b.status}</span></td>
        <td>
          ${b.status === 'pending' ? `<button class="btn btn--sm btn--primary" data-confirm="${b.id}">✓</button>` : ''}
          <button class="btn btn--sm btn--danger" data-cancel="${b.id}">×</button>
        </td></tr>`
      )
      .join('');

    tbody.querySelectorAll('[data-confirm]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await api(`/api/admin/bookings/${btn.dataset.confirm}`, { method: 'PATCH', body: { status: 'confirmed' } });
        toast('Подтверждено');
        await refreshAll();
      });
    });
    tbody.querySelectorAll('[data-cancel]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Отменить бронь?')) return;
        await api(`/api/admin/bookings/${btn.dataset.cancel}`, { method: 'DELETE' });
        toast('Отменено');
        await refreshAll();
      });
    });
  }

  $('#filter-booking-status')?.addEventListener('change', loadBookings);

  async function loadReviews() {
    const status = $('#filter-review-status')?.value;
    const { items } = await api('/api/admin/reviews');
    const filtered = status ? items.filter((r) => r.status === status) : items;
    $('#reviews-list').innerHTML = filtered
      .map(
        (r) => `<div class="card" style="grid-template-columns:1fr auto">
        <div>
          <strong>${esc(r.name)}</strong> ${r.city ? `· ${esc(r.city)}` : ''} · ★ ${r.rating}
          <span class="status status-${r.status}">${r.status}</span>
          <p style="margin:.5rem 0 0">${esc(r.text)}</p>
          <small>${r.roomTitle ? esc(r.roomTitle) + ' · ' : ''}${new Date(r.createdAt).toLocaleDateString('ru-RU')}</small>
        </div>
        <div class="card__actions">
          ${r.status === 'pending' ? `<button class="btn btn--sm btn--primary" data-pub="${r.id}">Опубликовать</button>` : ''}
          ${r.status !== 'rejected' ? `<button class="btn btn--sm" data-rej="${r.id}">Отклонить</button>` : ''}
          <button class="btn btn--sm btn--danger" data-del="${r.id}">Удалить</button>
        </div></div>`
      )
      .join('');

    $('#reviews-list').querySelectorAll('[data-pub]').forEach((b) => {
      b.addEventListener('click', async () => {
        await api(`/api/admin/reviews/${b.dataset.pub}`, { method: 'PATCH', body: { status: 'published' } });
        toast('Опубликовано');
        await refreshAll();
      });
    });
    $('#reviews-list').querySelectorAll('[data-rej]').forEach((b) => {
      b.addEventListener('click', async () => {
        await api(`/api/admin/reviews/${b.dataset.rej}`, { method: 'PATCH', body: { status: 'rejected' } });
        await refreshAll();
      });
    });
    $('#reviews-list').querySelectorAll('[data-del]').forEach((b) => {
      b.addEventListener('click', async () => {
        if (!confirm('Удалить?')) return;
        await api(`/api/admin/reviews/${b.dataset.del}`, { method: 'DELETE' });
        await refreshAll();
      });
    });
  }

  $('#filter-review-status')?.addEventListener('change', loadReviews);

  function roomForm(r = {}) {
    return `
      <label>Название<input id="m-title" value="${esc(r.title || '')}"></label>
      <label>Описание<textarea id="m-desc" rows="2">${esc(r.description || '')}</textarea></label>
      <label>Цена/ночь (₽)<input type="number" id="m-price" value="${r.pricePerNight || 2000}"></label>
      <label>Подпись цены<input id="m-pricelabel" value="${esc(r.priceLabel || '')}"></label>
      <label>Гостей макс<input type="number" id="m-gmax" value="${r.guestsMax || 2}"></label>
      <label>Площадь м²<input type="number" id="m-area" value="${r.area || 0}"></label>
      <label>Бейдж<input id="m-badge" value="${esc(r.badge || '')}"></label>
      <label>Фото URL<input id="m-image" value="${esc(r.image || '')}"></label>
      <label>Файл<input type="file" id="m-file" accept="image/*"></label>
      ${r.image ? `<img src="${r.image}" style="max-width:100%;margin-top:.5rem;border-radius:6px">` : ''}
      <label><input type="checkbox" id="m-pub" ${r.published !== false ? 'checked' : ''}> На сайте</label>`;
  }

  async function loadRooms() {
    rooms = await api('/api/admin/rooms');
    $('#rooms-list').innerHTML = rooms
      .sort((a, b) => a.sort - b.sort)
      .map(
        (r) => `<div class="card">
        ${r.image ? `<img src="${r.image}" alt="">` : '<div style="width:80px;height:60px;background:#ddd;border-radius:6px"></div>'}
        <div><strong>${esc(r.title)}</strong> · ${esc(r.priceLabel)} · ${r.guestsMax} гост.<br>${esc(r.description)}</div>
        <div class="card__actions">
          <button class="btn btn--sm btn--primary" data-edit-room="${r.id}">Изменить</button>
          <button class="btn btn--sm btn--danger" data-del-room="${r.id}">Удалить</button>
        </div></div>`
      )
      .join('');

    $('#rooms-list').querySelectorAll('[data-edit-room]').forEach((b) => {
      b.addEventListener('click', () => {
        const r = rooms.find((x) => x.id === b.dataset.editRoom);
        openModal('Номер', roomForm(r), async () => {
          let image = $('#m-image').value;
          const file = $('#m-file').files[0];
          if (file) {
            const fd = new FormData();
            fd.append('image', file);
            const up = await api('/api/admin/upload', { method: 'POST', body: fd });
            image = up.url;
          }
          await api(`/api/admin/rooms/${r.id}`, {
            method: 'PUT',
            body: {
              title: $('#m-title').value,
              description: $('#m-desc').value,
              pricePerNight: Number($('#m-price').value),
              priceLabel: $('#m-pricelabel').value,
              guestsMax: Number($('#m-gmax').value),
              area: Number($('#m-area').value),
              badge: $('#m-badge').value,
              image,
              published: $('#m-pub').checked,
            },
          });
          closeModal();
          toast('Сохранено');
          await loadRooms();
        });
      });
    });

    $('#rooms-list').querySelectorAll('[data-del-room]').forEach((b) => {
      b.addEventListener('click', async () => {
        if (!confirm('Удалить номер?')) return;
        await api(`/api/admin/rooms/${b.dataset.delRoom}`, { method: 'DELETE' });
        await loadRooms();
      });
    });
  }

  $('#add-room-btn')?.addEventListener('click', () => {
    openModal('Новый номер', roomForm({}), async () => {
      let image = '';
      const file = $('#m-file')?.files[0];
      if (file) {
        const fd = new FormData();
        fd.append('image', file);
        const up = await api('/api/admin/upload', { method: 'POST', body: fd });
        image = up.url;
      }
      await api('/api/admin/rooms', {
        method: 'POST',
        body: {
          title: $('#m-title').value,
          description: $('#m-desc').value,
          pricePerNight: Number($('#m-price').value),
          priceLabel: $('#m-pricelabel').value,
          guestsMax: Number($('#m-gmax').value),
          area: Number($('#m-area').value),
          badge: $('#m-badge').value,
          image,
          published: $('#m-pub').checked,
        },
      });
      closeModal();
      await loadRooms();
    });
  });

  let galleryPhotos = [];

  async function loadGalleryAdmin() {
    const data = await api('/api/admin/gallery');
    galleryPhotos = data.photos || [];
    renderGalleryAdmin();
  }

  function renderGalleryAdmin() {
    $('#gallery-admin').innerHTML = galleryPhotos
      .map(
        (p, i) => `<div class="gallery-item" data-i="${i}">
        <img src="${p.src}" alt="">
        <input type="text" value="${esc(p.title || '')}" data-field="title">
        <select data-field="category">
          <option value="territory" ${p.category === 'territory' ? 'selected' : ''}>Территория</option>
          <option value="house" ${p.category === 'house' ? 'selected' : ''}>Дом</option>
          <option value="rooms" ${p.category === 'rooms' ? 'selected' : ''}>Номера</option>
          <option value="interior" ${p.category === 'interior' ? 'selected' : ''}>Интерьер</option>
        </select>
        <button type="button" class="btn btn--sm btn--danger" style="margin-top:.35rem;width:100%" data-rm="${i}">Удалить</button>
      </div>`
      )
      .join('');

    $('#gallery-admin').querySelectorAll('[data-rm]').forEach((b) => {
      b.addEventListener('click', () => {
        galleryPhotos.splice(Number(b.dataset.rm), 1);
        renderGalleryAdmin();
      });
    });
  }

  $('#gallery-upload')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('image', file);
    const { url } = await api('/api/admin/upload', { method: 'POST', body: fd });
    galleryPhotos.push({ src: url, title: 'DVIN', category: 'territory' });
    renderGalleryAdmin();
    e.target.value = '';
    toast('Фото добавлено');
  });

  $('#save-gallery-btn')?.addEventListener('click', async () => {
    const photos = [];
    $('#gallery-admin').querySelectorAll('.gallery-item').forEach((el) => {
      const i = el.dataset.i;
      const src = galleryPhotos[i].src;
      photos.push({
        src,
        title: el.querySelector('[data-field="title"]').value,
        category: el.querySelector('[data-field="category"]').value,
      });
    });
    await api('/api/admin/gallery', { method: 'PUT', body: { photos } });
    toast('Галерея сохранена');
  });

  async function loadSettingsForm() {
    const s = await api('/api/admin/settings');
    const fields = [
      ['siteName', 'Название'],
      ['tagline', 'Слоган'],
      ['description', 'Описание', true],
      ['phone', 'Телефон'],
      ['email', 'Email'],
      ['address', 'Адрес', true],
      ['seaDistance', 'До моря'],
      ['checkIn', 'Заезд'],
      ['checkOut', 'Выезд'],
      ['telegram', 'Telegram'],
      ['whatsapp', 'WhatsApp'],
      ['siteUrl', 'URL сайта'],
      ['bookingOpen', 'Бронирование открыто', false, 'checkbox'],
      ['reviewsOpen', 'Приём отзывов', false, 'checkbox'],
    ];
    $('#settings-form').innerHTML = fields
      .map(([key, label, full, type]) => {
        if (type === 'checkbox') {
          return `<label class="${full ? 'full' : ''}"><input type="checkbox" name="${key}" ${s[key] ? 'checked' : ''}> ${label}</label>`;
        }
        const tag = full ? 'textarea' : 'input';
        const val = esc(s[key] ?? '');
        return `<label class="${full ? 'full' : ''}">${label}<${tag} name="${key}" ${tag === 'input' ? 'value="' + val + '"' : ''}>${tag === 'textarea' ? val : ''}</${tag}></label>`;
      })
      .join('');
  }

  document.addEventListener('submit', async (e) => {
    if (e.target.id !== 'settings-form') return;
    e.preventDefault();
    const body = {};
    e.target.querySelectorAll('input, textarea, select').forEach((el) => {
      if (!el.name) return;
      body[el.name] = el.type === 'checkbox' ? el.checked : el.value;
    });
    await api('/api/admin/settings', { method: 'PUT', body });
    toast('Настройки сохранены');
  });

  $('#password-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await api('/api/admin/password', { method: 'POST', body: { password: $('#new-password').value } });
    $('#new-password').value = '';
    toast('Пароль обновлён');
  });

  checkAuth();
})();
