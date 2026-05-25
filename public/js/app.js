(function () {
  const $ = (sel) => document.querySelector(sel);

  let settings = {};
  let services = [];

  async function api(path, opts) {
    const res = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      ...opts,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Ошибка запроса');
    return data;
  }

  function applySeo(s) {
    const base = (s.siteUrl || window.location.origin).replace(/\/$/, '');
    const title = `${s.siteName} — ${s.tagline}`;
    document.title = title;
    document.querySelector('meta[name="description"]').content =
      s.description || s.tagline;
    document.querySelector('meta[name="keywords"]').content = s.seoKeywords || '';
    if (s.googleSiteVerification) {
      let v = document.querySelector('meta[name="google-site-verification"]');
      if (!v) {
        v = document.createElement('meta');
        v.name = 'google-site-verification';
        document.head.appendChild(v);
      }
      v.content = s.googleSiteVerification;
    }
    const canonical = base + '/';
    const link = $('#canonical-link');
    if (link) link.href = canonical;
    $('#og-title').content = title;
    $('#og-desc').content = s.description || '';
    $('#og-url').content = canonical;

    const ld = {
      '@context': 'https://schema.org',
      '@type': 'LocalBusiness',
      name: s.siteName,
      description: s.description,
      telephone: s.phone,
      email: s.email,
      address: {
        '@type': 'PostalAddress',
        streetAddress: s.address,
      },
      openingHours: s.workHours,
      url: base,
    };
    $('#json-ld').textContent = JSON.stringify(ld);

    if (s.googleAnalytics && s.googleAnalytics.startsWith('G-')) {
      if (!document.getElementById('ga-script')) {
        const g = document.createElement('script');
        g.id = 'ga-script';
        g.async = true;
        g.src = `https://www.googletagmanager.com/gtag/js?id=${s.googleAnalytics}`;
        document.head.appendChild(g);
        window.dataLayer = window.dataLayer || [];
        function gtag() {
          window.dataLayer.push(arguments);
        }
        window.gtag = gtag;
        gtag('js', new Date());
        gtag('config', s.googleAnalytics);
      }
    }

    if (s.yandexMetrika && /^\d+$/.test(String(s.yandexMetrika))) {
      if (!document.getElementById('ym-script')) {
        (function (m, e, t, r, i, k, a) {
          m[i] =
            m[i] ||
            function () {
              (m[i].a = m[i].a || []).push(arguments);
            };
          m[i].l = 1 * new Date();
          k = e.createElement(t);
          a = e.getElementsByTagName(t)[0];
          k.async = 1;
          k.src = r;
          k.id = 'ym-script';
          a.parentNode.insertBefore(k, a);
        })(window, document, 'script', 'https://mc.yandex.ru/metrika/tag.js', 'ym');
        window.ym(Number(s.yandexMetrika), 'init', {
          clickmap: true,
          trackLinks: true,
          accurateTrackBounce: true,
        });
      }
    }
  }

  function renderSettings(s) {
    settings = s;
    applySeo(s);
    $('#logo-text').innerHTML = `${escapeHtml(s.siteName)}`;
    $('#hero-title').textContent = s.siteName;
    $('#hero-tagline').textContent = s.tagline;
    $('#footer-text').textContent = `© ${new Date().getFullYear()} ${s.siteName}`;

    const phoneEl = $('#contact-phone');
    phoneEl.textContent = s.phone;
    phoneEl.href = `tel:${s.phone.replace(/\s/g, '')}`;

    const emailEl = $('#contact-email');
    emailEl.textContent = s.email;
    emailEl.href = `mailto:${s.email}`;

    $('#contact-address').textContent = s.address;
    $('#contact-hours').textContent = s.workHours;

    const social = $('#social-links');
    social.innerHTML = '';
    const links = [
      { key: 'telegram', label: 'Telegram', href: normalizeTelegram(s.telegram) },
      { key: 'whatsapp', label: 'WhatsApp', href: normalizeWhatsApp(s.whatsapp) },
      { key: 'vk', label: 'ВКонтакте', href: s.vk },
      { key: 'instagram', label: 'Instagram', href: s.instagram },
    ];
    links.forEach((l) => {
      if (!l.href) return;
      const a = document.createElement('a');
      a.href = l.href;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = l.label;
      social.appendChild(a);
    });
  }

  function normalizeTelegram(v) {
    if (!v) return '';
    if (v.startsWith('http')) return v;
    const user = v.replace('@', '');
    return `https://t.me/${user}`;
  }

  function normalizeWhatsApp(v) {
    if (!v) return '';
    if (v.startsWith('http')) return v;
    const digits = v.replace(/\D/g, '');
    return `https://wa.me/${digits}`;
  }

  function escapeHtml(t) {
    const d = document.createElement('div');
    d.textContent = t;
    return d.innerHTML;
  }

  function renderServices(list) {
    services = list;
    const grid = $('#services-grid');
    const select = $('#serviceId');
    select.innerHTML = '<option value="">— Выберите —</option>';
    grid.innerHTML = '';

    list.forEach((s) => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.title;
      select.appendChild(opt);

      const card = document.createElement('article');
      card.className = 'service-card';
      const imgBlock = s.image
        ? `<img src="${s.image}" alt="${escapeHtml(s.title)}" loading="lazy">`
        : '<div class="placeholder-img" aria-hidden="true">✂</div>';
      card.innerHTML = `
        ${imgBlock}
        <div class="service-body">
          <h3>${escapeHtml(s.title)}</h3>
          <p>${escapeHtml(s.description)}</p>
          <span class="service-price">${escapeHtml(s.price)}</span>
        </div>`;
      grid.appendChild(card);
    });
  }

  async function refreshQueue() {
    try {
      const q = await api('/api/queue');
      $('#current-number').textContent =
        q.currentNumber != null ? String(q.currentNumber) : '—';
      $('#waiting-count').textContent = String(q.waitingCount);
      const closed = $('#queue-closed-msg');
      const form = $('#register-form');
      if (!q.open) {
        closed.classList.remove('hidden');
        form.classList.add('hidden');
      } else {
        closed.classList.add('hidden');
        form.classList.remove('hidden');
      }
    } catch (_) {}
  }

  async function init() {
    try {
      const [s, svc] = await Promise.all([
        api('/api/settings'),
        api('/api/services'),
      ]);
      renderSettings(s);
      renderServices(svc);
      await refreshQueue();
      setInterval(refreshQueue, 15000);
    } catch (e) {
      console.error(e);
    }
  }

  $('#register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('#form-msg');
    const ticket = $('#ticket-result');
    msg.className = 'form-msg';
    msg.textContent = '';
    ticket.classList.remove('visible');

    try {
      const body = {
        name: $('#name').value,
        phone: $('#phone').value,
        serviceId: $('#serviceId').value || null,
        note: $('#note').value,
      };
      const res = await api('/api/queue/register', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      $('#your-number').textContent = res.number;
      ticket.classList.add('visible');
      msg.className = 'form-msg success';
      msg.textContent = `Вы записаны под номером ${res.number}`;
      e.target.reset();
      await refreshQueue();
    } catch (err) {
      msg.className = 'form-msg error';
      msg.textContent = err.message;
    }
  });

  init();
})();
