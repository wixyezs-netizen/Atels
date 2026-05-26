/**
 * SQLite: таблицы settings, rooms, bookings, reviews, gallery, telegram_chats.
 */
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const tvilSeed = require('./tvil-seed');

let db;
let dbPath;

function parseJson(val, fallback) {
  if (val == null || val === '') return fallback;
  if (typeof val === 'object') return val;
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
}

function rowToRoom(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    pricePerNight: row.price_per_night,
    priceLabel: row.price_label,
    guestsMin: row.guests_min,
    guestsMax: row.guests_max,
    area: row.area,
    features: parseJson(row.features, []),
    image: row.image,
    badge: row.badge || '',
    sort: row.sort,
    published: !!row.published,
  };
}

function rowToBooking(row) {
  if (!row) return null;
  return {
    id: row.id,
    roomId: row.room_id,
    roomTitle: row.room_title,
    checkIn: row.check_in,
    checkOut: row.check_out,
    nights: row.nights,
    name: row.name,
    phone: row.phone,
    email: row.email || '',
    guests: row.guests,
    message: row.message || '',
    status: row.status,
    totalPrice: row.total_price,
    adminNote: row.admin_note || '',
    createdAt: row.created_at,
  };
}

function rowToReview(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    city: row.city || '',
    text: row.text,
    rating: row.rating,
    roomTitle: row.room_title || '',
    status: row.status,
    createdAt: row.created_at,
  };
}

function createSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      price_per_night INTEGER DEFAULT 0,
      price_label TEXT DEFAULT '',
      guests_min INTEGER DEFAULT 1,
      guests_max INTEGER DEFAULT 2,
      area INTEGER DEFAULT 0,
      features TEXT DEFAULT '[]',
      image TEXT DEFAULT '',
      badge TEXT DEFAULT '',
      sort INTEGER DEFAULT 0,
      published INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      room_title TEXT,
      check_in TEXT NOT NULL,
      check_out TEXT NOT NULL,
      nights INTEGER DEFAULT 0,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT DEFAULT '',
      guests INTEGER DEFAULT 1,
      message TEXT DEFAULT '',
      status TEXT DEFAULT 'pending',
      total_price INTEGER DEFAULT 0,
      admin_note TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      FOREIGN KEY (room_id) REFERENCES rooms(id)
    );
    CREATE INDEX IF NOT EXISTS idx_bookings_room_dates ON bookings(room_id, check_in, check_out);
    CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      city TEXT DEFAULT '',
      text TEXT NOT NULL,
      rating REAL DEFAULT 5,
      room_title TEXT DEFAULT '',
      status TEXT DEFAULT 'pending',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS gallery (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      src TEXT NOT NULL,
      title TEXT DEFAULT '',
      category TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS telegram_chats (
      chat_id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tvil_emails (
      id TEXT PRIMARY KEY,
      subject TEXT,
      from_addr TEXT,
      body_preview TEXT,
      hints TEXT DEFAULT '{}',
      received_at TEXT NOT NULL
    );
  `);
}

function isTvilEmailProcessed(id) {
  return !!db.prepare('SELECT 1 FROM tvil_emails WHERE id = ?').get(id);
}

function markTvilEmailProcessed(row) {
  db.prepare(
    `INSERT OR IGNORE INTO tvil_emails (id, subject, from_addr, body_preview, hints, received_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    row.id,
    row.subject || '',
    row.from_addr || '',
    row.body_preview || '',
    row.hints || '{}',
    new Date().toISOString()
  );
}

function countTvilEmails() {
  return db.prepare('SELECT COUNT(*) AS c FROM tvil_emails').get().c;
}

function getTvilEmailsRecent(limit = 10) {
  return db
    .prepare(
      'SELECT id, subject, from_addr, body_preview, received_at FROM tvil_emails ORDER BY received_at DESC LIMIT ?'
    )
    .all(limit);
}

function getSetting(key, fallback = '') {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!row) return fallback;
  const v = row.value;
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^\d+$/.test(v) && key !== 'phone') return Number(v);
  return v;
}

function setSetting(key, value) {
  const v = typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value ?? '');
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, v);
}

function getAllSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const obj = {};
  rows.forEach((r) => {
    obj[r.key] = getSetting(r.key);
  });
  return obj;
}

function saveSettings(partial) {
  Object.entries(partial).forEach(([k, v]) => {
    if (k !== 'adminPasswordHash') setSetting(k, v);
  });
}

function migrateFromJson(dataDir, publicDir) {
  const files = {
    settings: path.join(dataDir, 'settings.json'),
    rooms: path.join(dataDir, 'rooms.json'),
    bookings: path.join(dataDir, 'bookings.json'),
    reviews: path.join(dataDir, 'reviews.json'),
    gallery: path.join(dataDir, 'gallery.json'),
    chats: path.join(dataDir, 'telegram-chats.json'),
  };

  const readJson = (f, fb) => {
    try {
      if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
    } catch (_) {}
    return fb;
  };

  const settings = readJson(files.settings, null);
  if (settings) {
    Object.entries(settings).forEach(([k, v]) => {
      if (k === 'adminPasswordHash') setSetting('adminPasswordHash', v);
      else setSetting(k, v);
    });
  }

  const rooms = readJson(files.rooms, []);
  if (Array.isArray(rooms) && rooms.length) {
    const ins = db.prepare(`
      INSERT OR REPLACE INTO rooms (id, title, description, price_per_night, price_label, guests_min, guests_max, area, features, image, badge, sort, published)
      VALUES (@id, @title, @description, @pricePerNight, @priceLabel, @guestsMin, @guestsMax, @area, @features, @image, @badge, @sort, @published)
    `);
    rooms.forEach((r, i) => {
      ins.run({
        id: r.id,
        title: r.title,
        description: r.description || '',
        pricePerNight: r.pricePerNight || 0,
        priceLabel: r.priceLabel || '',
        guestsMin: r.guestsMin || 1,
        guestsMax: r.guestsMax || 2,
        area: r.area || 0,
        features: JSON.stringify(r.features || []),
        image: r.image || '',
        badge: r.badge || '',
        sort: r.sort ?? i,
        published: r.published !== false ? 1 : 0,
      });
    });
  }

  const bookings = readJson(files.bookings, { items: [] });
  if (bookings.items?.length) {
    const ins = db.prepare(`
      INSERT OR IGNORE INTO bookings (id, room_id, room_title, check_in, check_out, nights, name, phone, email, guests, message, status, total_price, admin_note, created_at)
      VALUES (@id, @roomId, @roomTitle, @checkIn, @checkOut, @nights, @name, @phone, @email, @guests, @message, @status, @totalPrice, @adminNote, @createdAt)
    `);
    bookings.items.forEach((b) => ins.run({
      id: b.id,
      roomId: b.roomId,
      roomTitle: b.roomTitle,
      checkIn: b.checkIn,
      checkOut: b.checkOut,
      nights: b.nights,
      name: b.name,
      phone: b.phone,
      email: b.email || '',
      guests: b.guests || 1,
      message: b.message || '',
      status: b.status || 'pending',
      totalPrice: b.totalPrice || 0,
      adminNote: b.adminNote || '',
      createdAt: b.createdAt || new Date().toISOString(),
    }));
  }

  const reviews = readJson(files.reviews, { items: [] });
  if (reviews.items?.length) {
    const ins = db.prepare(`
      INSERT OR IGNORE INTO reviews (id, name, city, text, rating, room_title, status, created_at)
      VALUES (@id, @name, @city, @text, @rating, @roomTitle, @status, @createdAt)
    `);
    reviews.items.forEach((r) => ins.run({
      id: r.id,
      name: r.name,
      city: r.city || '',
      text: r.text,
      rating: r.rating,
      roomTitle: r.roomTitle || '',
      status: r.status || 'pending',
      createdAt: r.createdAt || new Date().toISOString(),
    }));
  }

  let gallery = readJson(files.gallery, null);
  if (!gallery?.photos?.length) {
    gallery = readJson(path.join(publicDir, 'images', 'manifest.json'), { photos: [] });
  }
  if (gallery.photos?.length && db.prepare('SELECT COUNT(*) AS c FROM gallery').get().c === 0) {
    const ins = db.prepare('INSERT INTO gallery (src, title, category, sort_order) VALUES (?, ?, ?, ?)');
    gallery.photos.forEach((p, i) => ins.run(p.src, p.title || '', p.category || '', i));
  }

  const chats = readJson(files.chats, { chatIds: [] });
  chats.chatIds?.forEach((id) => addTelegramChat(id));
}

function seedTvil(adminPassword) {
  Object.entries(tvilSeed.settings).forEach(([k, v]) => setSetting(k, v));
  setSetting('adminPasswordHash', bcrypt.hashSync(adminPassword, 10));

  const insRoom = db.prepare(`
    INSERT OR REPLACE INTO rooms (id, title, description, price_per_night, price_label, guests_min, guests_max, area, features, image, badge, sort, published)
    VALUES (@id, @title, @description, @pricePerNight, @priceLabel, @guestsMin, @guestsMax, @area, @features, @image, @badge, @sort, @published)
  `);
  tvilSeed.rooms.forEach((r) => {
    insRoom.run({
      ...r,
      features: JSON.stringify(r.features),
      published: r.published ? 1 : 0,
    });
  });

  const insRev = db.prepare(`
    INSERT OR IGNORE INTO reviews (id, name, city, text, rating, room_title, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'published', ?)
  `);
  tvilSeed.reviews.forEach((r, i) => {
    insRev.run(`tvil-rev-${i}`, r.name, r.city || '', r.text, r.rating, r.roomTitle || '', new Date(Date.now() - i * 86400000).toISOString());
  });

  const manifest = path.join(__dirname, 'public', 'images', 'manifest.json');
  let photos = [];
  try {
    photos = JSON.parse(fs.readFileSync(manifest, 'utf8')).photos || [];
  } catch (_) {}
  if (photos.length) {
    db.prepare('DELETE FROM gallery').run();
    const ins = db.prepare('INSERT INTO gallery (src, title, category, sort_order) VALUES (?, ?, ?, ?)');
    photos.forEach((p, i) => ins.run(p.src, p.title || '', p.category || '', i));
    fs.writeFileSync(manifest, JSON.stringify({ photos }, null, 2), 'utf8');
  }
}

function init(options = {}) {
  const dataDir = options.dataDir || path.join(__dirname, 'data');
  const publicDir = options.publicDir || path.join(__dirname, 'public');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  dbPath = path.join(dataDir, 'dvin.db');
  const Database = require('better-sqlite3');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  createSchema();

  const roomCount = db.prepare('SELECT COUNT(*) AS c FROM rooms').get().c;
  const settingsCount = db.prepare('SELECT COUNT(*) AS c FROM settings').get().c;

  if (settingsCount === 0 && roomCount === 0) {
    const migrated = fs.existsSync(path.join(dataDir, 'settings.json')) || fs.existsSync(path.join(dataDir, 'rooms.json'));
    if (migrated) migrateFromJson(dataDir, publicDir);
    else seedTvil(options.adminPassword || 'admin123');
  } else if (settingsCount === 0) {
    seedTvil(options.adminPassword || 'admin123');
  } else if (roomCount === 0) {
    tvilSeed.rooms.forEach((r) => {
      db.prepare(`
        INSERT OR REPLACE INTO rooms (id, title, description, price_per_night, price_label, guests_min, guests_max, area, features, image, badge, sort, published)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        r.id, r.title, r.description, r.pricePerNight, r.priceLabel, r.guestsMin, r.guestsMax, r.area,
        JSON.stringify(r.features), r.image, r.badge, r.sort, r.published ? 1 : 0
      );
    });
  }

  if (!getSetting('adminPasswordHash')) {
    setSetting('adminPasswordHash', bcrypt.hashSync(options.adminPassword || 'admin123', 10));
  }

  return db;
}

function datesOverlap(aIn, aOut, bIn, bOut) {
  return aIn < bOut && bIn < aOut;
}

function isRoomAvailable(roomId, checkIn, checkOut, excludeBookingId = null) {
  const rows = db
    .prepare(
      `SELECT id, check_in, check_out FROM bookings
       WHERE room_id = ? AND status IN ('pending', 'confirmed')
       ${excludeBookingId ? 'AND id != ?' : ''}`
    )
    .all(...(excludeBookingId ? [roomId, excludeBookingId] : [roomId]));
  return !rows.some((b) => datesOverlap(checkIn, checkOut, b.check_in, b.check_out));
}

function getPublishedRooms(checkIn, checkOut) {
  const rows = db.prepare('SELECT * FROM rooms WHERE published = 1 ORDER BY sort ASC').all();
  return rows.map((row) => {
    const room = rowToRoom(row);
    if (checkIn && checkOut) {
      room.available = isRoomAvailable(room.id, checkIn, checkOut);
    }
    return room;
  });
}

function getAllRooms() {
  return db.prepare('SELECT * FROM rooms ORDER BY sort ASC').all().map(rowToRoom);
}

function getRoomById(id) {
  return rowToRoom(db.prepare('SELECT * FROM rooms WHERE id = ?').get(id));
}

function createRoom(data) {
  const id = data.id || uuidv4();
  const item = {
    id,
    title: data.title || 'Новый номер',
    description: data.description || '',
    pricePerNight: Number(data.pricePerNight) || 2000,
    priceLabel:
      data.priceLabel ||
      `от ${(Number(data.pricePerNight) || 2000).toLocaleString('ru-RU')} ₽`,
    guestsMin: Number(data.guestsMin) || 1,
    guestsMax: Number(data.guestsMax) || 2,
    area: Number(data.area) || 0,
    features: JSON.stringify(data.features || []),
    image: data.image || '',
    badge: data.badge || '',
    sort: data.sort ?? db.prepare('SELECT COUNT(*) AS c FROM rooms').get().c,
    published: data.published !== false ? 1 : 0,
  };
  db.prepare(`
    INSERT INTO rooms (id, title, description, price_per_night, price_label, guests_min, guests_max, area, features, image, badge, sort, published)
    VALUES (@id, @title, @description, @pricePerNight, @priceLabel, @guestsMin, @guestsMax, @area, @features, @image, @badge, @sort, @published)
  `).run(item);
  return getRoomById(id);
}

function updateRoom(id, data) {
  const room = getRoomById(id);
  if (!room) return null;
  const fields = ['title', 'description', 'pricePerNight', 'priceLabel', 'guestsMin', 'guestsMax', 'area', 'image', 'badge', 'sort', 'published'];
  fields.forEach((f) => {
    if (data[f] !== undefined) room[f] = data[f];
  });
  if (data.features !== undefined) room.features = data.features;
  db.prepare(`
    UPDATE rooms SET title=?, description=?, price_per_night=?, price_label=?, guests_min=?, guests_max=?, area=?, features=?, image=?, badge=?, sort=?, published=?
    WHERE id=?
  `).run(
    room.title, room.description, room.pricePerNight, room.priceLabel, room.guestsMin, room.guestsMax, room.area,
    JSON.stringify(room.features), room.image, room.badge, room.sort, room.published ? 1 : 0, id
  );
  return getRoomById(id);
}

function deleteRoom(id) {
  db.prepare('DELETE FROM rooms WHERE id = ?').run(id);
}

function getBookings(statusFilter) {
  let sql = 'SELECT * FROM bookings ORDER BY created_at DESC';
  const rows = statusFilter
    ? db.prepare('SELECT * FROM bookings WHERE status = ? ORDER BY created_at DESC').all(statusFilter)
    : db.prepare(sql).all();
  return rows.map(rowToBooking);
}

function getBookingById(id) {
  return rowToBooking(db.prepare('SELECT * FROM bookings WHERE id = ?').get(id));
}

function createBooking(item) {
  db.prepare(`
    INSERT INTO bookings (id, room_id, room_title, check_in, check_out, nights, name, phone, email, guests, message, status, total_price, admin_note, created_at)
    VALUES (@id, @roomId, @roomTitle, @checkIn, @checkOut, @nights, @name, @phone, @email, @guests, @message, @status, @totalPrice, @adminNote, @createdAt)
  `).run({
    id: item.id,
    roomId: item.roomId,
    roomTitle: item.roomTitle,
    checkIn: item.checkIn,
    checkOut: item.checkOut,
    nights: item.nights,
    name: item.name,
    phone: item.phone,
    email: item.email || '',
    guests: item.guests,
    message: item.message || '',
    status: item.status || 'pending',
    totalPrice: item.totalPrice || 0,
    adminNote: item.adminNote || '',
    createdAt: item.createdAt,
  });
  return getBookingById(item.id);
}

function updateBooking(id, patch) {
  const b = getBookingById(id);
  if (!b) return null;
  if (patch.status) b.status = patch.status;
  if (patch.adminNote !== undefined) b.adminNote = patch.adminNote;
  db.prepare('UPDATE bookings SET status = ?, admin_note = ? WHERE id = ?').run(b.status, b.adminNote, id);
  return getBookingById(id);
}

function cancelBooking(id) {
  return updateBooking(id, { status: 'cancelled' });
}

function getReviewsAdmin() {
  return db.prepare('SELECT * FROM reviews ORDER BY created_at DESC').all().map(rowToReview);
}

function getPublishedReviews() {
  return db.prepare("SELECT * FROM reviews WHERE status = 'published' ORDER BY created_at DESC").all().map(rowToReview);
}

function createReview(item) {
  db.prepare(`
    INSERT INTO reviews (id, name, city, text, rating, room_title, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(item.id, item.name, item.city || '', item.text, item.rating, item.roomTitle || '', item.status, item.createdAt);
  return item;
}

function updateReview(id, patch) {
  const r = db.prepare('SELECT * FROM reviews WHERE id = ?').get(id);
  if (!r) return null;
  const item = rowToReview(r);
  if (patch.status) item.status = patch.status;
  ['name', 'city', 'text', 'rating', 'roomTitle'].forEach((f) => {
    if (patch[f] !== undefined) item[f] = patch[f];
  });
  db.prepare('UPDATE reviews SET name=?, city=?, text=?, rating=?, room_title=?, status=? WHERE id=?').run(
    item.name, item.city, item.text, item.rating, item.roomTitle, item.status, id
  );
  return rowToReview(db.prepare('SELECT * FROM reviews WHERE id = ?').get(id));
}

function deleteReview(id) {
  db.prepare('DELETE FROM reviews WHERE id = ?').run(id);
}

function getGallery() {
  const rows = db.prepare('SELECT src, title, category FROM gallery ORDER BY sort_order ASC').all();
  return { photos: rows.map((r) => ({ src: r.src, title: r.title, category: r.category })) };
}

function saveGallery(photos, publicDir) {
  db.prepare('DELETE FROM gallery').run();
  const ins = db.prepare('INSERT INTO gallery (src, title, category, sort_order) VALUES (?, ?, ?, ?)');
  photos.forEach((p, i) => ins.run(p.src, p.title || '', p.category || '', i));
  const manifest = path.join(publicDir, 'images', 'manifest.json');
  fs.writeFileSync(manifest, JSON.stringify({ photos }, null, 2), 'utf8');
}

function getTelegramChatIds() {
  return db.prepare('SELECT chat_id FROM telegram_chats').all().map((r) => r.chat_id);
}

function addTelegramChat(chatId) {
  db.prepare('INSERT OR IGNORE INTO telegram_chats (chat_id, created_at) VALUES (?, ?)').run(
    String(chatId),
    new Date().toISOString()
  );
}

module.exports = {
  init,
  get dbPath() {
    return dbPath;
  },
  getSetting,
  setSetting,
  getAllSettings,
  saveSettings,
  getPublishedRooms,
  getAllRooms,
  getRoomById,
  createRoom,
  updateRoom,
  deleteRoom,
  isRoomAvailable,
  getBookings,
  getBookingById,
  createBooking,
  updateBooking,
  cancelBooking,
  getPublishedReviews,
  getReviewsAdmin,
  createReview,
  updateReview,
  deleteReview,
  getGallery,
  saveGallery,
  getTelegramChatIds,
  addTelegramChat,
  isTvilEmailProcessed,
  markTvilEmailProcessed,
  countTvilEmails,
  getTvilEmailsRecent,
};
