/**
 * Уведомления в Telegram (Bot API, без лишних зависимостей).
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

let chatsFile = '';

const STATUS_BOOKING = {
  pending: '⏳ Новая',
  confirmed: '✅ Подтверждена',
  cancelled: '❌ Отменена',
  completed: '🏁 Завершена',
};

function init(options = {}) {
  if (options.dataDir) {
    chatsFile = path.join(options.dataDir, 'telegram-chats.json');
  }
}

function getToken() {
  return (process.env.TELEGRAM_BOT_TOKEN || '').trim();
}

function isConfigured() {
  return Boolean(getToken());
}

function readChatsFile() {
  if (!chatsFile) return { chatIds: [] };
  try {
    if (fs.existsSync(chatsFile)) return JSON.parse(fs.readFileSync(chatsFile, 'utf8'));
  } catch (_) {}
  return { chatIds: [] };
}

function writeChatsFile(data) {
  if (!chatsFile) return;
  const dir = path.dirname(chatsFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(chatsFile, JSON.stringify(data, null, 2), 'utf8');
}

function getChatIdsFromEnv() {
  return (process.env.TELEGRAM_CHAT_ID || '')
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function getAllChatIds() {
  const fileIds = (readChatsFile().chatIds || []).map(String);
  return [...new Set([...getChatIdsFromEnv(), ...fileIds])];
}

function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function apiRequest(token, method, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = https.request(
      {
        hostname: 'api.telegram.org',
        path: `/bot${token}/${method}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => {
          data += c;
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve({ ok: false, raw: data });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function sendMessage(text, options = {}) {
  const token = getToken();
  if (!token) return Promise.resolve({ ok: false, skipped: true, reason: 'no_token' });

  const chatIds = options.chatIds || getAllChatIds();
  if (!chatIds.length) return Promise.resolve({ ok: false, skipped: true, reason: 'no_chats' });

  const parseMode = options.parseMode || 'HTML';
  const msg = String(text).slice(0, 4090);

  return Promise.all(
    chatIds.map((chatId) =>
      apiRequest(token, 'sendMessage', {
        chat_id: chatId,
        text: msg,
        parse_mode: parseMode,
        disable_web_page_preview: !options.preview,
      })
    )
  ).then((results) => ({ ok: results.some((r) => r.ok), results }));
}

function registerChatId(chatId) {
  const id = String(chatId);
  const data = readChatsFile();
  if (!data.chatIds.includes(id)) {
    data.chatIds.push(id);
    writeChatsFile(data);
  }
  return id;
}

function formatBooking(b, opts = {}) {
  const source = opts.source === 'tvil' ? 'TVIL.ru' : 'Сайт DVIN';
  const st = STATUS_BOOKING[b.status] || b.status || '—';
  const adminUrl = opts.adminUrl || '';
  const lines = [
    `<b>📅 ${opts.event === 'status' ? 'Статус брони' : 'Новая заявка на бронь'}</b>`,
    `Источник: <b>${escHtml(source)}</b>`,
    `Статус: ${escHtml(st)}`,
    '',
    `Номер: <b>${escHtml(b.roomTitle || '—')}</b>`,
    `Заезд: <b>${escHtml(b.checkIn)}</b>`,
    `Выезд: <b>${escHtml(b.checkOut)}</b>`,
    `Ночей: <b>${b.nights ?? '—'}</b>`,
    `Гостей: <b>${b.guests ?? '—'}</b>`,
    '',
    `Имя: ${escHtml(b.name)}`,
    `Телефон: <a href="tel:${escHtml(String(b.phone).replace(/\s/g, ''))}">${escHtml(b.phone)}</a>`,
  ];
  if (b.email) lines.push(`Email: ${escHtml(b.email)}`);
  if (b.totalPrice) lines.push(`Сумма: <b>${Number(b.totalPrice).toLocaleString('ru-RU')} ₽</b>`);
  if (b.message) lines.push(`\nКомментарий:\n${escHtml(b.message)}`);
  if (b.adminNote) lines.push(`\nЗаметка админа:\n${escHtml(b.adminNote)}`);
  if (adminUrl && b.id) lines.push(`\n<a href="${escHtml(adminUrl)}">Открыть в админке</a>`);
  return lines.join('\n');
}

function formatReview(r) {
  return [
    '<b>⭐ Новый отзыв</b> (на модерации)',
    `Имя: ${escHtml(r.name)}`,
    r.city ? `Город: ${escHtml(r.city)}` : '',
    r.roomTitle ? `Номер: ${escHtml(r.roomTitle)}` : '',
    `Оценка: ${'★'.repeat(Math.min(5, Number(r.rating) || 5))}`,
    '',
    escHtml(r.text),
  ]
    .filter(Boolean)
    .join('\n');
}

function formatExternal({ source, title, message, url }) {
  const src = source === 'tvil' ? 'TVIL.ru' : escHtml(source || 'Внешний источник');
  const lines = [
    `<b>🔔 ${escHtml(title || 'Уведомление')}</b>`,
    `Источник: <b>${src}</b>`,
    '',
    escHtml(message || '—'),
  ];
  if (url) lines.push(`\n<a href="${escHtml(url)}">Открыть на TVIL</a>`);
  return lines.join('\n');
}

function formatTvilFromEmail(subject, body) {
  return formatExternal({
    source: 'tvil',
    title: subject || 'Письмо с TVIL',
    message: (body || '').slice(0, 3500),
    url: 'https://owner.tvil.ru/',
  });
}

async function notifyNewBooking(booking, siteUrl) {
  const adminUrl = siteUrl ? `${siteUrl.replace(/\/$/, '')}/admin` : '';
  return sendMessage(formatBooking(booking, { event: 'new', adminUrl }));
}

async function notifyBookingStatus(booking, siteUrl) {
  const adminUrl = siteUrl ? `${siteUrl.replace(/\/$/, '')}/admin` : '';
  return sendMessage(formatBooking(booking, { event: 'status', adminUrl }));
}

async function notifyNewReview(review) {
  return sendMessage(formatReview(review));
}

async function notifyExternal(payload) {
  return sendMessage(formatExternal(payload), { preview: Boolean(payload.url) });
}

async function handleBotUpdate(update, siteUrl) {
  const msg = update?.message || update?.edited_message;
  if (!msg?.chat?.id) return;

  const chatId = msg.chat.id;
  const text = (msg.text || '').trim();

  if (text.startsWith('/start')) {
    registerChatId(chatId);
    await sendMessage(
      [
        '✅ <b>Уведомления DVIN подключены</b>',
        '',
        'Сюда будут приходить:',
        '• заявки с сайта',
        '• новые отзывы',
        '• уведомления с TVIL (если настроен вебхук или почта)',
        '',
        siteUrl ? `Сайт: <a href="${escHtml(siteUrl)}">${escHtml(siteUrl)}</a>` : '',
      ].join('\n'),
      { chatIds: [String(chatId)] }
    );
    return;
  }

  if (text === '/id') {
    await sendMessage(`Ваш chat_id: <code>${chatId}</code>`, { chatIds: [String(chatId)] });
  }
}

async function setupWebhook(siteUrl) {
  const token = getToken();
  if (!token || !siteUrl) return { ok: false, reason: 'no_token_or_url' };

  const hookUrl = `${siteUrl.replace(/\/$/, '')}/api/telegram/webhook`;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET || '';
  const payload = { url: hookUrl, allowed_updates: ['message'] };
  if (secret) payload.secret_token = secret;

  const httpsGet = (path) =>
    new Promise((resolve, reject) => {
      https
        .get(`https://api.telegram.org/bot${token}/${path}`, (res) => {
          let data = '';
          res.on('data', (c) => {
            data += c;
          });
          res.on('end', () => {
            try {
              resolve(JSON.parse(data));
            } catch {
              resolve({ ok: false });
            }
          });
        })
        .on('error', reject);
    });

  const setBody = JSON.stringify(payload);
  const setResult = await new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.telegram.org',
        path: `/bot${token}/setWebhook`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(setBody),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => {
          data += c;
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve({ ok: false });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(setBody);
    req.end();
  });

  return { setWebhook: setResult, hookUrl };
}

function getStatus() {
  const chatIds = getAllChatIds();
  return {
    configured: isConfigured(),
    chatCount: chatIds.length,
    chatIdsPreview: chatIds.map((id) => `${id.slice(0, 3)}…${id.slice(-3)}`),
    webhookSecretSet: Boolean(process.env.TELEGRAM_WEBHOOK_SECRET),
    webhookNotifySecretSet: Boolean(process.env.WEBHOOK_SECRET),
  };
}

module.exports = {
  init,
  isConfigured,
  getAllChatIds,
  getStatus,
  sendMessage,
  registerChatId,
  formatBooking,
  formatReview,
  formatExternal,
  formatTvilFromEmail,
  notifyNewBooking,
  notifyBookingStatus,
  notifyNewReview,
  notifyExternal,
  handleBotUpdate,
  setupWebhook,
};
