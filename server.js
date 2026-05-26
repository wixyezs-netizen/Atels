const express = require('express');
const session = require('express-session');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const telegram = require('./telegram');
const db = require('./db');
const tvilMail = require('./tvil-mail');
const tvilApi = require('./tvil-api');

const PORT = parseInt(process.env.PORT || '3000', 10);
const SITE_BUILD = 'dvin-v12-tvil-headers-derived';
/** Пока нет файла public/images/hero.jpg — показываем это фото (можно заменить в админке). */
const DEFAULT_HERO_IMAGE = 'https://hmd.tvil.ru/tmp/20230629/u2/6212782.jpeg';
const PUBLIC_DIR = path.join(__dirname, 'public');
const INDEX_HTML = path.join(PUBLIC_DIR, 'index.html');
const ADMIN_HTML = path.join(PUBLIC_DIR, 'admin.html');
const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(PUBLIC_DIR, 'uploads');

function ensureDirs() {
  [DATA_DIR, UPLOADS_DIR].forEach((dir) => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });
}

function loadGalleryManifest() {
  const data = db.getGallery();
  if (data.photos?.length) return data;
  const pub = path.join(PUBLIC_DIR, 'images', 'manifest.json');
  try {
    if (fs.existsSync(pub)) {
      const pubData = JSON.parse(fs.readFileSync(pub, 'utf8'));
      if (pubData.photos?.length) {
        db.saveGallery(pubData.photos, PUBLIC_DIR);
        return pubData;
      }
    }
  } catch (_) {}
  return { photos: [] };
}

ensureDirs();
try {
  db.init({
    dataDir: DATA_DIR,
    publicDir: PUBLIC_DIR,
    adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
  });
  loadGalleryManifest();
} catch (err) {
  console.error('db.init:', err.message);
}

telegram.init({
  dataDir: DATA_DIR,
  getChatIds: () => db.getTelegramChatIds(),
  onRegisterChat: (id) => db.addTelegramChat(id),
});

function getSiteUrl() {
  const fromEnv = process.env.SITE_URL || '';
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  return (db.getSetting('siteUrl', '') || '').replace(/\/$/, '');
}

function tgNotify(fn) {
  setImmediate(() => {
    Promise.resolve(fn()).catch((err) => console.error('[telegram]', err.message || err));
  });
}

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
    telegram: telegram.getStatus(),
    tvilMail: tvilMail.getStatus(db),
    tvilApi: tvilApi.getStatus(db),
    database: fs.existsSync(db.dbPath),
    uptime: Math.floor(process.uptime()),
  });
});

/** Внешние уведомления (TVIL через Make/Zapier, почту и т.д.) */
app.post('/api/webhooks/notify', (req, res) => {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) return res.status(503).json({ error: 'WEBHOOK_SECRET не задан на сервере' });
  const hdr = req.headers['x-webhook-secret'] || req.headers['authorization'] || '';
  const token = String(hdr).startsWith('Bearer ') ? String(hdr).slice(7) : hdr;
  if (token !== secret) return res.status(401).json({ error: 'Неверный секрет' });

  const { source, title, message, text, url } = req.body || {};
  const bodyText = message || text || title;
  if (!bodyText) return res.status(400).json({ error: 'Укажите message или title' });

  tgNotify(() =>
    telegram.notifyExternal({
      source: source || 'external',
      title: title || 'Уведомление',
      message: bodyText,
      url,
    })
  );
  res.json({ success: true });
});

/** Команда /start у бота — сохранить chat_id */
app.post('/api/telegram/webhook', (req, res) => {
  const secret = telegram.getWebhookSecret();
  if (secret && req.headers['x-telegram-bot-api-secret-token'] !== secret) {
    return res.sendStatus(403);
  }
  tgNotify(() => telegram.handleBotUpdate(req.body, getSiteUrl()));
  res.json({ ok: true });
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

function resolveHeroUrl(heroImage) {
  const raw = heroImage || DEFAULT_HERO_IMAGE;
  if (/^https?:\/\//i.test(raw)) return raw;
  const rel = String(raw).replace(/^\//, '');
  const local = path.join(PUBLIC_DIR, rel);
  if (fs.existsSync(local)) return raw.startsWith('/') ? raw : `/${rel}`;
  return DEFAULT_HERO_IMAGE;
}

function publicSettings() {
  const s = db.getAllSettings();
  const { adminPasswordHash, ...rest } = s;
  rest.heroImage = resolveHeroUrl(s.heroImage || DEFAULT_HERO_IMAGE);
  rest.bookingOpen = s.bookingOpen !== false && s.bookingOpen !== 'false';
  rest.reviewsOpen = s.reviewsOpen !== false && s.reviewsOpen !== 'false';
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

// ——— Публичное API ———
app.get('/api/settings', (_req, res) => res.json(publicSettings()));

app.get('/api/rooms', (req, res) => {
  const { checkIn, checkOut } = req.query;
  if (checkIn && checkOut && nightsBetween(checkIn, checkOut) > 0) {
    return res.json(db.getPublishedRooms(checkIn, checkOut));
  }
  res.json(db.getPublishedRooms());
});
app.get('/api/services', (req, res) => {
  const { checkIn, checkOut } = req.query;
  if (checkIn && checkOut && nightsBetween(checkIn, checkOut) > 0) {
    return res.json(db.getPublishedRooms(checkIn, checkOut));
  }
  res.json(db.getPublishedRooms());
});

app.get('/api/availability', (req, res) => {
  const { checkIn, checkOut } = req.query;
  if (!checkIn || !checkOut || nightsBetween(checkIn, checkOut) < 1) {
    return res.status(400).json({ error: 'Укажите даты заезда и выезда' });
  }
  const rooms = db.getPublishedRooms(checkIn, checkOut);
  res.json({
    checkIn,
    checkOut,
    nights: nightsBetween(checkIn, checkOut),
    rooms: rooms.map((r) => ({ id: r.id, title: r.title, available: r.available !== false })),
  });
});

app.get('/api/gallery', (_req, res) => {
  res.json(loadGalleryManifest());
});

app.get('/api/reviews', (_req, res) => {
  const published = db.getPublishedReviews();
  const avg =
    published.length > 0
      ? Math.round((published.reduce((s, r) => s + Number(r.rating), 0) / published.length) * 10) / 10
      : 5;
  res.json({ items: published, count: published.length, average: avg });
});

app.post('/api/reviews', (req, res) => {
  const settings = publicSettings();
  if (!settings.reviewsOpen) return res.status(403).json({ error: 'Приём отзывов временно закрыт' });
  const { name, city, text, rating, roomTitle } = req.body || {};
  if (!name?.trim() || !text?.trim()) {
    return res.status(400).json({ error: 'Укажите имя и текст отзыва' });
  }
  const r = Math.min(5, Math.max(1, Number(rating) || 5));
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
  db.createReview(item);
  tgNotify(() => telegram.notifyNewReview(item));
  res.json({ success: true, message: 'Спасибо! Отзыв появится после проверки.' });
});

app.post('/api/bookings', (req, res) => {
  const settings = publicSettings();
  if (!settings.bookingOpen) return res.status(403).json({ error: 'Бронирование временно закрыто' });

  const { roomId, checkIn, checkOut, name, phone, email, guests, message } = req.body || {};
  if (!roomId || !checkIn || !checkOut || !name?.trim() || !phone?.trim()) {
    return res.status(400).json({ error: 'Заполните номер, даты, имя и телефон' });
  }
  const nights = nightsBetween(checkIn, checkOut);
  if (nights < 1) return res.status(400).json({ error: 'Дата выезда должна быть позже заезда' });

  const room = db.getRoomById(roomId);
  if (!room || !room.published) return res.status(404).json({ error: 'Номер не найден' });

  const g = Number(guests) || 1;
  if (g > room.guestsMax) {
    return res.status(400).json({ error: `Максимум гостей для этого номера: ${room.guestsMax}` });
  }

  if (!db.isRoomAvailable(roomId, checkIn, checkOut)) {
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
  db.createBooking(item);
  tgNotify(() => telegram.notifyNewBooking(item, getSiteUrl()));
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
  const ok = bcrypt.compareSync(req.body?.password || '', db.getSetting('adminPasswordHash', '') || '');
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
  res.json(db.getAllSettings());
});

app.put('/api/admin/settings', requireAdmin, (req, res) => {
  const allowed = [
    'siteName', 'tagline', 'description', 'phone', 'email', 'address', 'region', 'seaDistance',
    'workHours', 'checkIn', 'checkOut', 'telegram', 'whatsapp', 'vk', 'instagram', 'siteUrl',
    'seoKeywords', 'yandexMetrika', 'googleAnalytics', 'googleSiteVerification',
    'bookingOpen', 'reviewsOpen', 'heroImage',
  ];
  const patch = {};
  allowed.forEach((k) => {
    if (req.body[k] !== undefined) patch[k] = req.body[k];
  });
  db.saveSettings(patch);
  res.json({ success: true });
});

app.post('/api/admin/password', requireAdmin, (req, res) => {
  if (!req.body?.password || req.body.password.length < 6) {
    return res.status(400).json({ error: 'Пароль минимум 6 символов' });
  }
  db.setSetting('adminPasswordHash', bcrypt.hashSync(req.body.password, 10));
  res.json({ success: true });
});

app.get('/api/admin/rooms', requireAdmin, (_req, res) => {
  res.json(db.getAllRooms());
});
app.get('/api/admin/services', requireAdmin, (_req, res) => {
  res.json(db.getAllRooms());
});

app.post('/api/admin/rooms', requireAdmin, (req, res) => {
  const item = db.createRoom(req.body);
  res.json(item);
});

app.put('/api/admin/rooms/:id', requireAdmin, (req, res) => {
  const item = db.updateRoom(req.params.id, req.body);
  if (!item) return res.status(404).json({ error: 'Не найдено' });
  res.json(item);
});

app.delete('/api/admin/rooms/:id', requireAdmin, (req, res) => {
  db.deleteRoom(req.params.id);
  res.json({ success: true });
});

app.get('/api/admin/bookings', requireAdmin, (req, res) => {
  const items = db.getBookings(req.query.status || null);
  res.json({ items });
});

app.patch('/api/admin/bookings/:id', requireAdmin, (req, res) => {
  const prev = db.getBookingById(req.params.id);
  if (!prev) return res.status(404).json({ error: 'Не найдено' });
  const prevStatus = prev.status;
  const statuses = ['pending', 'confirmed', 'cancelled', 'completed'];
  const patch = {};
  if (req.body.status && statuses.includes(req.body.status)) patch.status = req.body.status;
  if (req.body.adminNote !== undefined) patch.adminNote = req.body.adminNote;
  const item = db.updateBooking(req.params.id, patch);
  if (patch.status && prevStatus !== item.status) {
    tgNotify(() => telegram.notifyBookingStatus(item, getSiteUrl()));
  }
  res.json(item);
});

app.get('/api/admin/telegram', requireAdmin, (_req, res) => {
  res.json({
    ...telegram.getStatus(),
    webhookUrl: `${getSiteUrl() || '(укажите SITE_URL)'}/api/webhooks/notify`,
    botHint: 'Напишите боту /start после настройки TELEGRAM_BOT_TOKEN',
  });
});

app.post('/api/admin/telegram/test', requireAdmin, async (req, res) => {
  if (!telegram.isConfigured()) {
    return res.status(400).json({ error: 'Задайте TELEGRAM_BOT_TOKEN в переменных Bothost' });
  }
  const result = await telegram.sendMessage(
    '🧪 <b>Тест DVIN</b>\nУведомления работают.',
    {}
  );
  if (!result.ok) {
    return res.status(400).json({
      error: 'Сообщение не отправлено. Проверьте TELEGRAM_CHAT_ID или напишите боту /start',
      detail: result,
    });
  }
  res.json({ success: true });
});

app.get('/api/admin/tvil-mail', requireAdmin, (_req, res) => {
  res.json(tvilMail.getStatus(db));
});

app.post('/api/admin/tvil-mail/poll', requireAdmin, async (_req, res) => {
  if (!tvilMail.isConfigured()) {
    return res.status(400).json({
      error: 'Задайте TVIL_IMAP_HOST, TVIL_IMAP_USER, TVIL_IMAP_PASSWORD в Bothost',
    });
  }
  const result = await tvilMail.pollOnce({ db, telegram });
  res.json(result);
});

app.get('/api/admin/tvil-api', requireAdmin, (_req, res) => {
  res.json(tvilApi.getStatus(db));
});

app.post('/api/admin/tvil-api/poll', requireAdmin, async (_req, res) => {
  if (!tvilApi.isConfigured()) {
    return res.status(400).json({
      error: 'Задайте TVIL_COOKIE из DevTools (см. TVIL-DEVTOOLS.md)',
    });
  }
  const result = await tvilApi.pollOnce({ db, telegram });
  res.json(result);
});

app.get('/api/admin/tvil-api/diagnose', requireAdmin, async (_req, res) => {
  if (!tvilApi.isConfigured()) {
    return res.status(400).json({ error: 'Задайте TVIL_COOKIE' });
  }
  const results = await tvilApi.diagnose(db);
  res.json({ results });
});

app.delete('/api/admin/bookings/:id', requireAdmin, (req, res) => {
  db.cancelBooking(req.params.id);
  res.json({ success: true });
});

app.get('/api/admin/reviews', requireAdmin, (_req, res) => {
  res.json({ items: db.getReviewsAdmin() });
});

app.patch('/api/admin/reviews/:id', requireAdmin, (req, res) => {
  const patch = {};
  if (req.body.status && ['pending', 'published', 'rejected'].includes(req.body.status)) {
    patch.status = req.body.status;
  }
  ['name', 'city', 'text', 'rating', 'roomTitle'].forEach((f) => {
    if (req.body[f] !== undefined) patch[f] = req.body[f];
  });
  const item = db.updateReview(req.params.id, patch);
  if (!item) return res.status(404).json({ error: 'Не найдено' });
  res.json(item);
});

app.delete('/api/admin/reviews/:id', requireAdmin, (req, res) => {
  db.deleteReview(req.params.id);
  res.json({ success: true });
});

app.get('/api/admin/gallery', requireAdmin, (_req, res) => {
  res.json(loadGalleryManifest());
});

app.put('/api/admin/gallery', requireAdmin, (req, res) => {
  const photos = req.body.photos || [];
  db.saveGallery(photos, PUBLIC_DIR);
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
app.get('/TELEGRAM.md', (_req, res) => {
  const doc = path.join(__dirname, 'TELEGRAM.md');
  if (!fs.existsSync(doc)) return res.status(404).send('Not found');
  res.type('text/plain; charset=utf-8');
  res.sendFile(doc);
});
app.get('/TVIL-MAIL.md', (_req, res) => {
  const doc = path.join(__dirname, 'TVIL-MAIL.md');
  if (!fs.existsSync(doc)) return res.status(404).send('Not found');
  res.type('text/plain; charset=utf-8');
  res.sendFile(doc);
});
app.get('/TVIL-DEVTOOLS.md', (_req, res) => {
  const doc = path.join(__dirname, 'TVIL-DEVTOOLS.md');
  if (!fs.existsSync(doc)) return res.status(404).send('Not found');
  res.type('text/plain; charset=utf-8');
  res.sendFile(doc);
});
app.get('/TVIL-N8N.md', (_req, res) => {
  const doc = path.join(__dirname, 'TVIL-N8N.md');
  if (!fs.existsSync(doc)) return res.status(404).send('Not found');
  res.type('text/plain; charset=utf-8');
  res.sendFile(doc);
});
app.get('/TVIL-NODUL.md', (_req, res) => {
  const doc = path.join(__dirname, 'TVIL-NODUL.md');
  if (!fs.existsSync(doc)) return res.status(404).send('Not found');
  res.type('text/plain; charset=utf-8');
  res.sendFile(doc);
});

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

const HOST = process.env.HOST || '0.0.0.0';

function bootServices() {
  if (global.__dvinServicesBooted) return;
  global.__dvinServicesBooted = true;

  if (telegram.isConfigured()) {
    console.log('  Telegram: включён');
    const url = getSiteUrl();
    if (url.startsWith('https://')) {
      setTimeout(() => {
        telegram
          .setupWebhook(url)
          .then((r) => {
            if (r.setWebhook?.ok) console.log('  Telegram webhook: OK');
            else console.log('  Telegram webhook:', r.setWebhook?.description || 'не установлен');
          })
          .catch((e) => console.error('  Telegram webhook:', e.message));
      }, 1500);
    } else {
      console.log('  Telegram: задайте SITE_URL=https://... для /start у бота');
    }
  }
  if (tvilMail.isConfigured()) {
    tvilMail.startPoller({ db, telegram });
  } else {
    console.log('  TVIL почта: выключена (не нужна, если есть TVIL_COOKIE)');
  }
  if (tvilApi.isConfigured()) {
    tvilApi.startPoller({ db, telegram });
  } else {
    console.log('  TVIL API: выключен (задайте TVIL_COOKIE — см. TVIL-DEVTOOLS.md)');
  }
}

function startServer() {
  if (global.__dvinHttpServer) {
    return global.__dvinHttpServer;
  }

  const server = app.listen(PORT, HOST, () => {
    console.log(`DVIN ${SITE_BUILD} → http://${HOST}:${PORT}`);
    console.log('  Сайт: /  Админ: /admin  Health: /health');
    bootServices();
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `Порт ${PORT} занят. В Bothost укажите один вход: http-wrapper.js (не server.js дважды).`
      );
    } else {
      console.error('Ошибка запуска сервера:', err);
    }
    process.exit(1);
  });

  global.__dvinHttpServer = server;
  return server;
}

module.exports = { app, startServer };

if (require.main === module) {
  startServer();
}

process.on('uncaughtException', (err) => {
  console.error('uncaughtException:', err);
});
process.on('unhandledRejection', (err) => {
  console.error('unhandledRejection:', err);
});
