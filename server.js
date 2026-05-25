const express = require('express');
const session = require('express-session');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');

const FILES = {
  settings: path.join(DATA_DIR, 'settings.json'),
  services: path.join(DATA_DIR, 'services.json'),
  orders: path.join(DATA_DIR, 'orders.json'),
};

function ensureDirs() {
  [DATA_DIR, UPLOADS_DIR].forEach((dir) => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });
}

function readJson(file, fallback) {
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch (_) {}
  return fallback;
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

function defaultSettings() {
  return {
    siteName: 'Ателье «Элегант»',
    tagline: 'Пошив и ремонт одежды',
    description:
      'Профессиональное ателье: пошив, подгонка, реставрация одежды. Запись по номеру очереди онлайн.',
    phone: '+7 (999) 123-45-67',
    email: 'info@atelier.example',
    address: 'г. Москва, ул. Примерная, д. 1',
    workHours: 'Пн–Сб: 10:00–19:00',
    telegram: '',
    whatsapp: '',
    vk: '',
    instagram: '',
    siteUrl: process.env.SITE_URL || 'https://your-domain.ru',
    seoKeywords:
      'ателье, пошив одежды, ремонт одежды, подгонка костюма, ателье рядом',
    yandexMetrika: '',
    googleAnalytics: '',
    googleSiteVerification: '',
    adminPasswordHash: '',
    queueOpen: true,
    maxQueuePerDay: 50,
  };
}

function defaultServices() {
  return [
    {
      id: uuidv4(),
      title: 'Подгонка брюк',
      description: 'Укорочение, посадка по фигуре, замена молнии.',
      price: 'от 800 ₽',
      image: '',
      sort: 0,
      published: true,
    },
    {
      id: uuidv4(),
      title: 'Пошив платья',
      description: 'Индивидуальный пошив по вашим меркам и эскизу.',
      price: 'от 5000 ₽',
      image: '',
      sort: 1,
      published: true,
    },
    {
      id: uuidv4(),
      title: 'Ремонт куртки',
      description: 'Замена молнии, подкладки, усиление швов.',
      price: 'от 1200 ₽',
      image: '',
      sort: 2,
      published: true,
    },
  ];
}

function initData() {
  ensureDirs();
  if (!fs.existsSync(FILES.settings)) {
    const s = defaultSettings();
    const hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'admin123', 10);
    s.adminPasswordHash = hash;
    writeJson(FILES.settings, s);
  }
  if (!fs.existsSync(FILES.services)) {
    writeJson(FILES.services, defaultServices());
  }
  if (!fs.existsSync(FILES.orders)) {
    writeJson(FILES.orders, { counter: 0, items: [] });
  }
}

initData();

const app = express();
app.set('trust proxy', 1);

app.use(express.json({ limit: '2mb' }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'atelier-secret-change-me',
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
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Только изображения JPEG, PNG, WebP, GIF'));
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

// ——— API: публичное ———
app.get('/api/settings', (_req, res) => {
  res.json(publicSettings());
});

app.get('/api/services', (_req, res) => {
  const list = readJson(FILES.services, []);
  res.json(list.filter((s) => s.published).sort((a, b) => a.sort - b.sort));
});

app.get('/api/queue', (_req, res) => {
  const settings = readJson(FILES.settings, defaultSettings());
  const orders = readJson(FILES.orders, { counter: 0, items: [] });
  const today = new Date().toISOString().slice(0, 10);
  const todayOrders = orders.items.filter((o) => o.date === today && o.status !== 'cancelled');
  const current = todayOrders.find((o) => o.status === 'in_progress');
  const waiting = todayOrders.filter((o) => o.status === 'waiting').length;
  res.json({
    open: settings.queueOpen,
    currentNumber: current?.number ?? null,
    waitingCount: waiting,
    lastNumber: orders.counter,
  });
});

app.post('/api/queue/register', (req, res) => {
  const settings = readJson(FILES.settings, defaultSettings());
  if (!settings.queueOpen) {
    return res.status(403).json({ error: 'Запись в очередь временно закрыта' });
  }
  const { name, phone, serviceId, note } = req.body || {};
  if (!name?.trim() || !phone?.trim()) {
    return res.status(400).json({ error: 'Укажите имя и телефон' });
  }
  const orders = readJson(FILES.orders, { counter: 0, items: [] });
  const today = new Date().toISOString().slice(0, 10);
  const todayCount = orders.items.filter((o) => o.date === today && o.status !== 'cancelled').length;
  if (todayCount >= (settings.maxQueuePerDay || 50)) {
    return res.status(403).json({ error: 'На сегодня запись закрыта' });
  }
  orders.counter += 1;
  const item = {
    id: uuidv4(),
    number: orders.counter,
    name: name.trim(),
    phone: phone.trim(),
    serviceId: serviceId || null,
    note: (note || '').trim(),
    date: today,
    status: 'waiting',
    createdAt: new Date().toISOString(),
  };
  orders.items.push(item);
  writeJson(FILES.orders, orders);
  res.json({ success: true, number: item.number, id: item.id });
});

// ——— API: админ ———
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body || {};
  const settings = readJson(FILES.settings, defaultSettings());
  const ok = bcrypt.compareSync(password || '', settings.adminPasswordHash || '');
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
    'siteName', 'tagline', 'description', 'phone', 'email', 'address', 'workHours',
    'telegram', 'whatsapp', 'vk', 'instagram', 'siteUrl', 'seoKeywords',
    'yandexMetrika', 'googleAnalytics', 'googleSiteVerification', 'queueOpen', 'maxQueuePerDay',
  ];
  allowed.forEach((key) => {
    if (req.body[key] !== undefined) current[key] = req.body[key];
  });
  writeJson(FILES.settings, current);
  res.json({ success: true });
});

app.post('/api/admin/password', requireAdmin, (req, res) => {
  const { password } = req.body || {};
  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'Пароль минимум 6 символов' });
  }
  const settings = readJson(FILES.settings, defaultSettings());
  settings.adminPasswordHash = bcrypt.hashSync(password, 10);
  writeJson(FILES.settings, settings);
  res.json({ success: true });
});

app.get('/api/admin/services', requireAdmin, (_req, res) => {
  res.json(readJson(FILES.services, []));
});

app.post('/api/admin/services', requireAdmin, (req, res) => {
  const list = readJson(FILES.services, []);
  const item = {
    id: uuidv4(),
    title: req.body.title || 'Новая услуга',
    description: req.body.description || '',
    price: req.body.price || '',
    image: req.body.image || '',
    sort: list.length,
    published: req.body.published !== false,
  };
  list.push(item);
  writeJson(FILES.services, list);
  res.json(item);
});

app.put('/api/admin/services/:id', requireAdmin, (req, res) => {
  const list = readJson(FILES.services, []);
  const idx = list.findIndex((s) => s.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'Не найдено' });
  const fields = ['title', 'description', 'price', 'image', 'sort', 'published'];
  fields.forEach((f) => {
    if (req.body[f] !== undefined) list[idx][f] = req.body[f];
  });
  writeJson(FILES.services, list);
  res.json(list[idx]);
});

app.delete('/api/admin/services/:id', requireAdmin, (req, res) => {
  let list = readJson(FILES.services, []);
  list = list.filter((s) => s.id !== req.params.id);
  writeJson(FILES.services, list);
  res.json({ success: true });
});

app.post('/api/admin/upload', requireAdmin, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });
  res.json({ url: `/uploads/${req.file.filename}` });
});

app.get('/api/admin/orders', requireAdmin, (req, res) => {
  const orders = readJson(FILES.orders, { counter: 0, items: [] });
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  const items = orders.items
    .filter((o) => o.date === date)
    .sort((a, b) => a.number - b.number);
  res.json({ counter: orders.counter, items });
});

app.patch('/api/admin/orders/:id', requireAdmin, (req, res) => {
  const orders = readJson(FILES.orders, { counter: 0, items: [] });
  const item = orders.items.find((o) => o.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Не найдено' });
  const statuses = ['waiting', 'in_progress', 'done', 'cancelled'];
  if (req.body.status && statuses.includes(req.body.status)) {
    if (req.body.status === 'in_progress') {
      orders.items.forEach((o) => {
        if (o.date === item.date && o.status === 'in_progress' && o.id !== item.id) {
          o.status = 'waiting';
        }
      });
    }
    item.status = req.body.status;
  }
  writeJson(FILES.orders, orders);
  res.json(item);
});

app.delete('/api/admin/orders/:id', requireAdmin, (req, res) => {
  const orders = readJson(FILES.orders, { counter: 0, items: [] });
  const item = orders.items.find((o) => o.id === req.params.id);
  if (item) item.status = 'cancelled';
  writeJson(FILES.orders, orders);
  res.json({ success: true });
});

// ——— SEO ———
app.get('/robots.txt', (_req, res) => {
  const settings = publicSettings();
  const base = (settings.siteUrl || '').replace(/\/$/, '');
  res.type('text/plain');
  res.send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/admin\n\nSitemap: ${base}/sitemap.xml\n`);
});

app.get('/sitemap.xml', (_req, res) => {
  const settings = publicSettings();
  const base = (settings.siteUrl || '').replace(/\/$/, '');
  const lastmod = new Date().toISOString().slice(0, 10);
  const urls = ['/', '/#services', '/#queue', '/#contacts'];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>${base}${u === '/' ? '/' : u}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${u === '/' ? '1.0' : '0.8'}</priority>
  </url>`
  )
  .join('\n')}
</urlset>`;
  res.type('application/xml');
  res.send(xml);
});

// ——— Статика ———
app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/admin', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Ателье-сайт: http://0.0.0.0:${PORT}`);
});
