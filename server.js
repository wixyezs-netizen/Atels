const express = require('express');
const session = require('express-session');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const PORT = parseInt(process.env.PORT || '3000', 10);
const SITE_BUILD = 'dvin-v4-booking-admin';
const PUBLIC_DIR = path.join(__dirname, 'public');
const INDEX_HTML = path.join(PUBLIC_DIR, 'index.html');
const ADMIN_HTML = path.join(PUBLIC_DIR, 'admin.html');
const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(PUBLIC_DIR, 'uploads');

const FILES = {
  settings: path.join(DATA_DIR, 'settings.json'),
  rooms: path.join(DATA_DIR, 'rooms.json'),
  bookings: path.join(DATA_DIR, 'bookings.json'),
  reviews: path.join(DATA_DIR, 'reviews.json'),
  gallery: path.join(DATA_DIR, 'gallery.json'),
};

function ensureDirs() {
  [DATA_DIR, UPLOADS_DIR].forEach((dir) => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });
}

function readJson(file, fallback) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {}
  return fallback;
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

function defaultSettings() {
  return {
    siteName: 'DVIN',
    tagline: 'Гостевой дом · Голубицкая',
    description:
      'Жилой дом DVIN в Голубицкой: студия, комфорт и люкс. 700 м до моря, бассейн, Wi‑Fi, можно с детьми и питомцами.',
    phone: '+7 (900) 123-45-67',
    email: 'hello@dvin-house.ru',
    address: 'ст-ца Голубицкая, Тупиковый переулок, 41',
    region: 'Краснодарский край',
    seaDistance: '700 м',
    workHours: 'Заезд после 14:00 · выезд до 11:00',
    checkIn: '14:00',
    checkOut: '11:00',
    telegram: '',
    whatsapp: '',
    vk: '',
    instagram: '',
    siteUrl: process.env.SITE_URL || 'https://atelmore.bothost.tech',
    seoKeywords: 'гостевой дом Голубицкая, DVIN, отдых на море',
    yandexMetrika: '',
    googleAnalytics: '',
    googleSiteVerification: '',
    bookingOpen: true,
    reviewsOpen: true,
    adminPasswordHash: '',
  };
}

function defaultRooms() {
  return [
    {
      id: uuidv4(),
      title: 'Студия',
      description: '1 этаж, 21 м², двуспальная кровать, своя кухня',
      pricePerNight: 2000,
      priceLabel: 'от 2 000 ₽',
      guestsMin: 1,
      guestsMax: 3,
      area: 21,
      features: ['Wi‑Fi', 'Кухня', 'Кондиционер', 'Фен', 'Холодильник'],
      image: '',
      badge: '',
      sort: 0,
      published: true,
    },
    {
      id: uuidv4(),
      title: 'Комфорт',
      description: '16 м², двуспальная кровать, балкон',
      pricePerNight: 2500,
      priceLabel: 'от 2 500 ₽',
      guestsMin: 1,
      guestsMax: 4,
      area: 16,
      features: ['Wi‑Fi', 'Балкон', 'Кондиционер', 'Холодильник'],
      image: '',
      badge: 'С балконом',
      sort: 1,
      published: true,
    },
    {
      id: uuidv4(),
      title: 'Люкс',
      description: '1 этаж, 18 м², двуспальная кровать',
      pricePerNight: 3000,
      priceLabel: 'от 3 000 ₽',
      guestsMin: 1,
      guestsMax: 4,
      area: 18,
      features: ['Wi‑Fi', 'Кондиционер', 'Фен', 'Холодильник'],
      image: '',
      badge: '',
      sort: 2,
      published: true,
    },
  ];
}

function defaultReviews() {
  return {
    items: [
      {
        id: uuidv4(),
        name: 'Алина',
        city: '',
        text: 'Всё очень понравилось, были с собакой, номер на первом этаже со своей кухней. Приятные хозяева. До моря рукой подать. Магазины, кафе рядом.',
        rating: 5,
        roomTitle: 'Студия',
        status: 'published',
        createdAt: '2025-09-01T12:00:00.000Z',
      },
      {
        id: uuidv4(),
        name: 'Юлия',
        city: 'Воронеж',
        text: 'Дом полностью соответствует фото, до моря идти недалеко, двор утопающий в зелени! За такую стоимость очень неплохо!',
        rating: 5,
        roomTitle: 'Студия',
        status: 'published',
        createdAt: '2025-09-02T12:00:00.000Z',
      },
      {
        id: uuidv4(),
        name: 'Мария',
        city: 'Псков',
        text: 'Отлично отдохнули, хозяева отличные люди, море недалеко. Всё соответствует фото. Приедем снова. Рекомендую!',
        rating: 4.4,
        roomTitle: 'Студия',
        status: 'published',
        createdAt: '2025-07-15T12:00:00.000Z',
      },
      {
        id: uuidv4(),
        name: 'Алёна',
        city: 'Москва',
        text: 'С маленьким ребёнком и собакой. Хозяйка доброжелательна. В номере всё необходимое, общая кухня. Во дворе беседка, мангал, 2 бассейна.',
        rating: 4.6,
        roomTitle: 'Студия',
        status: 'published',
        createdAt: '2025-07-20T12:00:00.000Z',
      },
      {
        id: uuidv4(),
        name: 'Ангелина',
        city: '',
        text: 'Всё понравилось.',
        rating: 5,
        roomTitle: 'Комфорт',
        status: 'published',
        createdAt: '2025-07-10T12:00:00.000Z',
      },
    ],
  };
}

function loadGalleryManifest() {
  const data = readJson(FILES.gallery, null);
  if (data?.photos?.length) return data;
  const pub = path.join(PUBLIC_DIR, 'images', 'manifest.json');
  const pubData = readJson(pub, { photos: [] });
  if (pubData.photos?.length) {
    writeJson(FILES.gallery, pubData);
    return pubData;
  }
  return { photos: [] };
}

function initData() {
  ensureDirs();
  if (!fs.existsSync(FILES.settings)) {
    const s = defaultSettings();
    s.adminPasswordHash = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'admin123', 10);
    writeJson(FILES.settings, s);
  }
  if (!fs.existsSync(FILES.rooms)) {
    const legacy = path.join(DATA_DIR, 'services.json');
    if (fs.existsSync(legacy)) {
      const old = readJson(legacy, []);
      writeJson(
        FILES.rooms,
        old.map((r, i) => ({
          id: r.id || uuidv4(),
          title: r.title,
          description: r.description,
          pricePerNight: parseInt(String(r.price).replace(/\D/g, ''), 10) || 2000,
          priceLabel: r.price || 'от 2000 ₽',
          guestsMin: 1,
          guestsMax: 3,
          area: 0,
          features: [],
          image: r.image || '',
          badge: '',
          sort: r.sort ?? i,
          published: r.published !== false,
        }))
      );
    } else {
      writeJson(FILES.rooms, defaultRooms());
    }
  }
  if (!fs.existsSync(FILES.bookings)) {
    const legacy = path.join(DATA_DIR, 'orders.json');
    writeJson(FILES.bookings, { items: [] });
    if (fs.existsSync(legacy)) {
      const old = readJson(legacy, { items: [] });
      const rooms = readJson(FILES.rooms, []);
      const bookings = readJson(FILES.bookings, { items: [] });
      old.items.forEach((o) => {
        bookings.items.push({
          id: o.id,
          roomId: o.serviceId || rooms[0]?.id,
          checkIn: o.date,
          checkOut: o.date,
          name: o.name,
          phone: o.phone,
          email: '',
          guests: 2,
          message: o.note || '',
          status: o.status === 'done' ? 'completed' : o.status === 'cancelled' ? 'cancelled' : 'pending',
          totalPrice: 0,
          nights: 1,
          createdAt: o.createdAt || new Date().toISOString(),
        });
      });
      writeJson(FILES.bookings, bookings);
    }
  }
  if (!fs.existsSync(FILES.reviews)) writeJson(FILES.reviews, defaultReviews());
  loadGalleryManifest();
}

initData();

const app = express();
app.set('trust proxy', 1);

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    build: SITE_BUILD,
    site: 'dvin-v4',
    admin: fs.existsSync(ADMIN_HTML),
    port: PORT,
    indexHtml: fs.existsSync(INDEX_HTML),
    adminHtml: fs.existsSync(ADMIN_HTML),
    uptime: Math.floor(process.uptime()),
  });
});

app.use(express.json({ limit: '2mb' }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dvin-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${Date.now()}-${uuidv4().slice(0, 8)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Только изображения'));
  },
});

function requireAdmin(req, res, next) {
  if (req.session?.admin) return next();
  res.status(401).json({ error: 'Требуется авторизация' });
}

function publicSettings() {
  const s = readJson(FILES.settings, defaultSettings());
  const { adminPasswordHash, ...rest } = s;
  return rest;
}

function nightsBetween(checkIn, checkOut) {
  const a = new Date(checkIn);
  const b = new Date(checkOut);
  const diff = Math.round((b - a) / (1000 * 60 * 60 * 24));
  return diff > 0 ? diff : 0;
}

function datesOverlap(aIn, aOut, bIn, bOut) {
  return aIn < bOut && bIn < aOut;
}

function getPublishedRooms() {
  return readJson(FILES.rooms, [])
    .filter((r) => r.published)
    .sort((a, b) => a.sort - b.sort);
}

// ——— Публичное API ———
app.get('/api/settings', (_req, res) => res.json(publicSettings()));

app.get('/api/rooms', (_req, res) => res.json(getPublishedRooms()));
app.get('/api/services', (_req, res) => res.json(getPublishedRooms()));

app.get('/api/gallery', (_req, res) => {
  res.json(loadGalleryManifest());
});

app.get('/api/reviews', (_req, res) => {
  const data = readJson(FILES.reviews, { items: [] });
  const published = data.items
    .filter((r) => r.status === 'published')
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const avg =
    published.length > 0
      ? Math.round((published.reduce((s, r) => s + Number(r.rating), 0) / published.length) * 10) / 10
      : 5;
  res.json({ items: published, count: published.length, average: avg });
});

app.post('/api/reviews', (req, res) => {
  const settings = readJson(FILES.settings, defaultSettings());
  if (!settings.reviewsOpen) return res.status(403).json({ error: 'Приём отзывов временно закрыт' });
  const { name, city, text, rating, roomTitle } = req.body || {};
  if (!name?.trim() || !text?.trim()) {
    return res.status(400).json({ error: 'Укажите имя и текст отзыва' });
  }
  const r = Math.min(5, Math.max(1, Number(rating) || 5));
  const data = readJson(FILES.reviews, { items: [] });
  const item = {
    id: uuidv4(),
    name: name.trim(),
    city: (city || '').trim(),
    text: text.trim(),
    rating: r,
    roomTitle: (roomTitle || '').trim(),
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  data.items.push(item);
  writeJson(FILES.reviews, data);
  res.json({ success: true, message: 'Спасибо! Отзыв появится после проверки.' });
});

app.post('/api/bookings', (req, res) => {
  const settings = readJson(FILES.settings, defaultSettings());
  if (!settings.bookingOpen) return res.status(403).json({ error: 'Бронирование временно закрыто' });

  const { roomId, checkIn, checkOut, name, phone, email, guests, message } = req.body || {};
  if (!roomId || !checkIn || !checkOut || !name?.trim() || !phone?.trim()) {
    return res.status(400).json({ error: 'Заполните номер, даты, имя и телефон' });
  }
  const nights = nightsBetween(checkIn, checkOut);
  if (nights < 1) return res.status(400).json({ error: 'Дата выезда должна быть позже заезда' });

  const rooms = readJson(FILES.rooms, []);
  const room = rooms.find((r) => r.id === roomId && r.published);
  if (!room) return res.status(404).json({ error: 'Номер не найден' });

  const g = Number(guests) || 1;
  if (g > room.guestsMax) {
    return res.status(400).json({ error: `Максимум гостей для этого номера: ${room.guestsMax}` });
  }

  const bookings = readJson(FILES.bookings, { items: [] });
  const conflict = bookings.items.some(
    (b) =>
      b.roomId === roomId &&
      ['pending', 'confirmed'].includes(b.status) &&
      datesOverlap(checkIn, checkOut, b.checkIn, b.checkOut)
  );
  if (conflict) {
    return res.status(409).json({ error: 'На выбранные даты номер занят. Выберите другие даты или номер.' });
  }

  const totalPrice = (room.pricePerNight || 0) * nights;
  const item = {
    id: uuidv4(),
    roomId,
    roomTitle: room.title,
    checkIn,
    checkOut,
    nights,
    name: name.trim(),
    phone: phone.trim(),
    email: (email || '').trim(),
    guests: g,
    message: (message || '').trim(),
    status: 'pending',
    totalPrice,
    createdAt: new Date().toISOString(),
  };
  bookings.items.push(item);
  writeJson(FILES.bookings, bookings);
  res.json({
    success: true,
    id: item.id,
    totalPrice,
    nights,
    message: 'Заявка принята! Мы свяжемся с вами для подтверждения.',
  });
});

// ——— Админ API ———
app.post('/api/admin/login', (req, res) => {
  const settings = readJson(FILES.settings, defaultSettings());
  const ok = bcrypt.compareSync(req.body?.password || '', settings.adminPasswordHash || '');
  if (!ok) return res.status(401).json({ error: 'Неверный пароль' });
  req.session.admin = true;
  res.json({ success: true });
});

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

app.get('/api/admin/check', (req, res) => {
  res.json({ authenticated: !!req.session?.admin });
});

app.get('/api/admin/settings', requireAdmin, (_req, res) => {
  res.json(readJson(FILES.settings, defaultSettings()));
});

app.put('/api/admin/settings', requireAdmin, (req, res) => {
  const current = readJson(FILES.settings, defaultSettings());
  const allowed = [
    'siteName', 'tagline', 'description', 'phone', 'email', 'address', 'region', 'seaDistance',
    'workHours', 'checkIn', 'checkOut', 'telegram', 'whatsapp', 'vk', 'instagram', 'siteUrl',
    'seoKeywords', 'yandexMetrika', 'googleAnalytics', 'googleSiteVerification',
    'bookingOpen', 'reviewsOpen',
  ];
  allowed.forEach((k) => {
    if (req.body[k] !== undefined) current[k] = req.body[k];
  });
  writeJson(FILES.settings, current);
  res.json({ success: true });
});

app.post('/api/admin/password', requireAdmin, (req, res) => {
  if (!req.body?.password || req.body.password.length < 6) {
    return res.status(400).json({ error: 'Пароль минимум 6 символов' });
  }
  const settings = readJson(FILES.settings, defaultSettings());
  settings.adminPasswordHash = bcrypt.hashSync(req.body.password, 10);
  writeJson(FILES.settings, settings);
  res.json({ success: true });
});

app.get('/api/admin/rooms', requireAdmin, (_req, res) => {
  res.json(readJson(FILES.rooms, []));
});
app.get('/api/admin/services', requireAdmin, (_req, res) => {
  res.json(readJson(FILES.rooms, []));
});

app.post('/api/admin/rooms', requireAdmin, (req, res) => {
  const list = readJson(FILES.rooms, []);
  const item = {
    id: uuidv4(),
    title: req.body.title || 'Новый номер',
    description: req.body.description || '',
    pricePerNight: Number(req.body.pricePerNight) || 2000,
    priceLabel: req.body.priceLabel || '',
    guestsMin: Number(req.body.guestsMin) || 1,
    guestsMax: Number(req.body.guestsMax) || 2,
    area: Number(req.body.area) || 0,
    features: req.body.features || [],
    image: req.body.image || '',
    badge: req.body.badge || '',
    sort: list.length,
    published: req.body.published !== false,
  };
  if (!item.priceLabel) item.priceLabel = `от ${item.pricePerNight.toLocaleString('ru-RU')} ₽`;
  list.push(item);
  writeJson(FILES.rooms, list);
  res.json(item);
});

app.put('/api/admin/rooms/:id', requireAdmin, (req, res) => {
  const list = readJson(FILES.rooms, []);
  const idx = list.findIndex((r) => r.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'Не найдено' });
  const fields = [
    'title', 'description', 'pricePerNight', 'priceLabel', 'guestsMin', 'guestsMax',
    'area', 'features', 'image', 'badge', 'sort', 'published',
  ];
  fields.forEach((f) => {
    if (req.body[f] !== undefined) list[idx][f] = req.body[f];
  });
  writeJson(FILES.rooms, list);
  res.json(list[idx]);
});

app.delete('/api/admin/rooms/:id', requireAdmin, (req, res) => {
  let list = readJson(FILES.rooms, []);
  list = list.filter((r) => r.id !== req.params.id);
  writeJson(FILES.rooms, list);
  res.json({ success: true });
});

app.get('/api/admin/bookings', requireAdmin, (req, res) => {
  const bookings = readJson(FILES.bookings, { items: [] });
  let items = [...bookings.items];
  if (req.query.status) items = items.filter((b) => b.status === req.query.status);
  items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ items });
});

app.patch('/api/admin/bookings/:id', requireAdmin, (req, res) => {
  const bookings = readJson(FILES.bookings, { items: [] });
  const item = bookings.items.find((b) => b.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Не найдено' });
  const statuses = ['pending', 'confirmed', 'cancelled', 'completed'];
  if (req.body.status && statuses.includes(req.body.status)) item.status = req.body.status;
  if (req.body.adminNote !== undefined) item.adminNote = req.body.adminNote;
  writeJson(FILES.bookings, bookings);
  res.json(item);
});

app.delete('/api/admin/bookings/:id', requireAdmin, (req, res) => {
  const bookings = readJson(FILES.bookings, { items: [] });
  const item = bookings.items.find((b) => b.id === req.params.id);
  if (item) item.status = 'cancelled';
  writeJson(FILES.bookings, bookings);
  res.json({ success: true });
});

app.get('/api/admin/reviews', requireAdmin, (_req, res) => {
  const data = readJson(FILES.reviews, { items: [] });
  data.items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(data);
});

app.patch('/api/admin/reviews/:id', requireAdmin, (req, res) => {
  const data = readJson(FILES.reviews, { items: [] });
  const item = data.items.find((r) => r.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Не найдено' });
  if (req.body.status && ['pending', 'published', 'rejected'].includes(req.body.status)) {
    item.status = req.body.status;
  }
  ['name', 'city', 'text', 'rating', 'roomTitle'].forEach((f) => {
    if (req.body[f] !== undefined) item[f] = req.body[f];
  });
  writeJson(FILES.reviews, data);
  res.json(item);
});

app.delete('/api/admin/reviews/:id', requireAdmin, (req, res) => {
  const data = readJson(FILES.reviews, { items: [] });
  data.items = data.items.filter((r) => r.id !== req.params.id);
  writeJson(FILES.reviews, data);
  res.json({ success: true });
});

app.get('/api/admin/gallery', requireAdmin, (_req, res) => {
  res.json(loadGalleryManifest());
});

app.put('/api/admin/gallery', requireAdmin, (req, res) => {
  const photos = req.body.photos || [];
  writeJson(FILES.gallery, { photos });
  writeJson(path.join(PUBLIC_DIR, 'images', 'manifest.json'), { photos });
  res.json({ success: true });
});

app.post('/api/admin/upload', requireAdmin, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });
  res.json({ url: `/uploads/${req.file.filename}` });
});

// Legacy queue routes → redirect logic
app.get('/api/queue', (_req, res) => {
  res.json({ open: false, message: 'Используйте бронирование на сайте' });
});

// ——— SEO ———
app.get('/robots.txt', (_req, res) => {
  const base = (publicSettings().siteUrl || '').replace(/\/$/, '');
  res.type('text/plain');
  res.send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/admin\n\nSitemap: ${base}/sitemap.xml\n`);
});

app.get('/sitemap.xml', (_req, res) => {
  const base = (publicSettings().siteUrl || '').replace(/\/$/, '');
  const lastmod = new Date().toISOString().slice(0, 10);
  const urls = ['/', '/#rooms', '/#booking', '/#reviews'];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map(
      (u) => `  <url><loc>${base}${u === '/' ? '/' : u}</loc><lastmod>${lastmod}</lastmod></url>`
    )
    .join('\n')}\n</urlset>`;
  res.type('application/xml');
  res.send(xml);
});

function sendPage(res, filePath) {
  if (!fs.existsSync(filePath)) {
    return res.status(500).send(`<h1>Нет файла</h1><p>${filePath}</p>`);
  }
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(filePath, (err) => {
    if (err) res.status(500).send('Ошибка');
  });
}

app.get('/', (_req, res) => sendPage(res, INDEX_HTML));
app.get('/admin', (_req, res) => sendPage(res, ADMIN_HTML));

app.use('/uploads', express.static(UPLOADS_DIR));
app.use(
  express.static(PUBLIC_DIR, {
    index: false,
    setHeaders(res, fp) {
      if (/\.(html|css|js|json)$/i.test(fp)) res.set('Cache-Control', 'no-cache');
    },
  })
);

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  sendPage(res, INDEX_HTML);
});

app.use((req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'API не найден' });
  res.status(404).send('Не найдено');
});

app.listen(process.env.HOST || '0.0.0.0', PORT, () => {
  console.log(`DVIN ${SITE_BUILD} → порт ${PORT}`);
  console.log(`  Сайт: /  Админ: /admin  Health: /health`);
});
