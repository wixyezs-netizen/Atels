(function () {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  let settingsCache = {};

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      credentials: 'same-origin',
      headers: opts.body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
      ...opts,
      body:
        opts.body instanceof FormData
          ? opts.body
          : opts.body
            ? JSON.stringify(opts.body)
            : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Ошибка');
    return data;
  }

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2500);
  }

  function showApp(show) {
    $('#login-screen').classList.toggle('hidden', show);
    $('#admin-app').classList.toggle('hidden', !show);
  }

  async function checkAuth() {
    const { authenticated } = await api('/api/admin/check');
    showApp(authenticated);
    if (authenticated) {
      await loadAll();
    }
  }

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#login-error');
    err.style.display = 'none';
    try {
      await api('/api/admin/login', {
        method: 'POST',
        body: { password: $('#password').value },
      });
      showApp(true);
      await loadAll();
    } catch (ex) {
      err.textContent = ex.message;
      err.style.display = 'block';
    }
  });

  $('#logout-btn').addEventListener('click', async (e) => {
    e.preventDefault();
    await api('/api/admin/logout', { method: 'POST' });
    showApp(false);
  });

  $$('.sidebar nav a[data-panel]').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const panel = a.dataset.panel;
      $$('.sidebar nav a').forEach((x) => x.classList.remove('active'));
      a.classList.add('active');
      $$('.panel').forEach((p) => p.classList.remove('active'));
      $(`#panel-${panel}`).classList.add('active');
    });
  });

  function fillSettings(s) {
    settingsCache = s;
    [
      'siteName', 'tagline', 'description', 'phone', 'email', 'address', 'workHours',
      'maxQueuePerDay', 'siteUrl', 'seoKeywords', 'telegram', 'whatsapp', 'vk',
      'instagram', 'googleAnalytics', 'googleSiteVerification', 'yandexMetrika',
    ].forEach((id) => {
      const el = $(`#${id}`);
      if (el) el.value = s[id] ?? '';
    });
    $('#queue-open-toggle').checked = !!s.queueOpen;
    const base = (s.siteUrl || '').replace(/\/$/, '');
    $('#sitemap-hint').textContent = base ? `${base}/sitemap.xml` : '/sitemap.xml';
  }

  async function loadSettings() {
    const s = await api('/api/admin/settings');
    fillSettings(s);
  }

  async function loadOrders() {
    const date = $('#orders-date').value || new Date().toISOString().slice(0, 10);
    const data = await api(`/api/admin/orders?date=${date}`);
    const tbody = $('#orders-tbody');
    tbody.innerHTML = '';
    const statusLabels = {
      waiting: 'Ожидает',
      in_progress: 'Принят',
      done: 'Готово',
      cancelled: 'Отмена',
    };
    data.items.forEach((o) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="num">${o.number}</td>
        <td>${esc(o.name)}</td>
        <td>${esc(o.phone)}</td>
        <td><span class="status-badge status-${o.status}">${statusLabels[o.status] || o.status}</span></td>
        <td>
          <button class="btn btn-sm btn-primary" data-action="progress" data-id="${o.id}">Принять</button>
          <button class="btn btn-sm" data-action="done" data-id="${o.id}">Готово</button>
          <button class="btn btn-sm btn-danger" data-action="cancel" data-id="${o.id}">×</button>
        </td>`;
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => handleOrderAction(btn.dataset.action, btn.dataset.id));
    });
  }

  async function handleOrderAction(action, id) {
    const map = {
      progress: 'in_progress',
      done: 'done',
      cancel: 'cancelled',
    };
    await api(`/api/admin/orders/${id}`, {
      method: 'PATCH',
      body: { status: map[action] },
    });
    toast('Обновлено');
    await loadOrders();
  }

  function esc(t) {
    const d = document.createElement('div');
    d.textContent = t;
    return d.innerHTML;
  }

  async function loadServicesAdmin() {
    const list = await api('/api/admin/services');
    const container = $('#services-admin-list');
    container.innerHTML = '';
    list.sort((a, b) => a.sort - b.sort).forEach((s) => {
      const div = document.createElement('div');
      div.className = 'card service-admin-item';
      const thumb = s.image
        ? `<img src="${s.image}" alt="">`
        : '<div class="thumb-placeholder">Нет фото</div>';
      div.innerHTML = `
        ${thumb}
        <div>
          <strong>${esc(s.title)}</strong>
          <p style="margin:0.25rem 0;color:#666;font-size:0.9rem">${esc(s.description)}</p>
          <span>${esc(s.price)}</span> · ${s.published ? '✓ на сайте' : 'скрыто'}
        </div>
        <div style="display:flex;flex-direction:column;gap:0.35rem">
          <button class="btn btn-sm btn-primary" data-edit="${s.id}">Изменить</button>
          <button class="btn btn-sm btn-danger" data-del="${s.id}">Удалить</button>
        </div>`;
      container.appendChild(div);
    });
    container.querySelectorAll('[data-edit]').forEach((b) => {
      b.addEventListener('click', () => openServiceModal(b.dataset.edit, list));
    });
    container.querySelectorAll('[data-del]').forEach((b) => {
      b.addEventListener('click', async () => {
        if (!confirm('Удалить услугу?')) return;
        await api(`/api/admin/services/${b.dataset.del}`, { method: 'DELETE' });
        toast('Удалено');
        await loadServicesAdmin();
      });
    });
  }

  function openServiceModal(id, list) {
    const modal = $('#service-modal');
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    const item = list.find((s) => s.id === id) || {
      id: '',
      title: '',
      description: '',
      price: '',
      image: '',
      published: true,
    };
    $('#modal-title').textContent = id ? 'Редактирование' : 'Новая услуга';
    $('#edit-service-id').value = item.id;
    $('#edit-title').value = item.title;
    $('#edit-description').value = item.description;
    $('#edit-price').value = item.price;
    $('#edit-published').checked = item.published !== false;
    const prev = $('#edit-image-preview');
    if (item.image) {
      prev.src = item.image;
      prev.style.display = 'block';
    } else {
      prev.style.display = 'none';
      prev.src = '';
    }
    window._editImageUrl = item.image || '';
  }

  $('#add-service-btn').addEventListener('click', () => openServiceModal('', []));

  $('#close-modal-btn').addEventListener('click', () => {
    $('#service-modal').classList.add('hidden');
    $('#service-modal').style.display = 'none';
  });

  $('#edit-image-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('image', file);
    try {
      const res = await api('/api/admin/upload', { method: 'POST', body: fd });
      window._editImageUrl = res.url;
      const prev = $('#edit-image-preview');
      prev.src = res.url;
      prev.style.display = 'block';
      toast('Фото загружено');
    } catch (ex) {
      toast(ex.message);
    }
  });

  $('#save-service-btn').addEventListener('click', async () => {
    const id = $('#edit-service-id').value;
    const body = {
      title: $('#edit-title').value,
      description: $('#edit-description').value,
      price: $('#edit-price').value,
      image: window._editImageUrl || '',
      published: $('#edit-published').checked,
    };
    try {
      if (id) {
        await api(`/api/admin/services/${id}`, { method: 'PUT', body });
      } else {
        await api('/api/admin/services', { method: 'POST', body });
      }
      $('#service-modal').classList.add('hidden');
      $('#service-modal').style.display = 'none';
      toast('Сохранено');
      await loadServicesAdmin();
    } catch (ex) {
      toast(ex.message);
    }
  });

  $('#settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {};
    ['siteName', 'tagline', 'description', 'phone', 'email', 'address', 'workHours', 'maxQueuePerDay'].forEach(
      (id) => {
        body[id] = $(`#${id}`).value;
      }
    );
    body.queueOpen = $('#queue-open-toggle').checked;
    await api('/api/admin/settings', { method: 'PUT', body });
    toast('Настройки сохранены');
  });

  $('#seo-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {};
    [
      'siteUrl', 'seoKeywords', 'telegram', 'whatsapp', 'vk', 'instagram',
      'googleAnalytics', 'googleSiteVerification', 'yandexMetrika',
    ].forEach((id) => {
      body[id] = $(`#${id}`).value;
    });
    await api('/api/admin/settings', { method: 'PUT', body });
    toast('SEO и связь сохранены');
    await loadSettings();
  });

  $('#queue-open-toggle').addEventListener('change', async () => {
    await api('/api/admin/settings', {
      method: 'PUT',
      body: { queueOpen: $('#queue-open-toggle').checked },
    });
    toast($('#queue-open-toggle').checked ? 'Запись открыта' : 'Запись закрыта');
  });

  $('#password-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await api('/api/admin/password', {
      method: 'POST',
      body: { password: $('#new-password').value },
    });
    $('#new-password').value = '';
    toast('Пароль обновлён');
  });

  $('#orders-date').value = new Date().toISOString().slice(0, 10);
  $('#orders-date').addEventListener('change', loadOrders);

  async function loadAll() {
    await loadSettings();
    await loadOrders();
    await loadServicesAdmin();
  }

  checkAuth();
})();
