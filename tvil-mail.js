/**
 * Чтение писем TVIL по IMAP → Telegram.
 * У TVIL нет API; заявки приходят на почту из личного кабинета.
 */
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');

const SUBJECT_HINTS = ['твил', 'tvil', 'заявк', 'бронь', 'бронир', 'запрос', 'новая', 'подтвержд', 'отмен'];
const FROM_HINTS = ['tvil.ru', 'mail.tvil.ru', 'noreply'];

let pollTimer = null;
let polling = false;

function isConfigured() {
  return Boolean(
    process.env.TVIL_IMAP_HOST &&
      process.env.TVIL_IMAP_USER &&
      process.env.TVIL_IMAP_PASSWORD
  );
}

function getConfig() {
  return {
    host: process.env.TVIL_IMAP_HOST,
    port: parseInt(process.env.TVIL_IMAP_PORT || '993', 10),
    secure: process.env.TVIL_IMAP_SECURE !== 'false',
    auth: {
      user: process.env.TVIL_IMAP_USER,
      pass: process.env.TVIL_IMAP_PASSWORD,
    },
    logger: false,
  };
}

function looksLikeTvil(fromText, subject) {
  const f = String(fromText || '').toLowerCase();
  const s = String(subject || '').toLowerCase();
  if (FROM_HINTS.some((h) => f.includes(h))) return true;
  return SUBJECT_HINTS.some((h) => s.includes(h));
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseBookingHints(text) {
  const t = String(text || '');
  const hints = {};

  const phone =
    t.match(/(?:тел(?:ефон)?|phone)[:\s]*([+\d][\d\s\-()]{8,18})/i) ||
    t.match(/(\+7[\d\s\-()]{10,15})/) ||
    t.match(/(8[\d\s\-()]{10,14})/);
  if (phone) hints.phone = phone[1].replace(/\s+/g, ' ').trim();

  const checkIn =
    t.match(/заезд[:\s]*(\d{1,2}[.\-/]\d{1,2}[.\-/]\d{2,4})/i) ||
    t.match(/с\s*(\d{1,2}[.\-/]\d{1,2}[.\-/]\d{2,4})/i);
  if (checkIn) hints.checkIn = checkIn[1];

  const checkOut =
    t.match(/выезд[:\s]*(\d{1,2}[.\-/]\d{1,2}[.\-/]\d{2,4})/i) ||
    t.match(/по\s*(\d{1,2}[.\-/]\d{1,2}[.\-/]\d{2,4})/i);
  if (checkOut) hints.checkOut = checkOut[1];

  const guests = t.match(/(\d+)\s*(?:гост|чел|человек)/i);
  if (guests) hints.guests = guests[1];

  const name = t.match(/(?:гость|имя|фио)[:\s]*([А-Яа-яA-Za-zЁё\-]+\s+[А-Яа-яA-Za-zЁё\-]+)/i);
  if (name) hints.name = name[1].trim();

  return hints;
}

function buildMessage(subject, body, hints) {
  const lines = [];
  if (hints.name) lines.push(`👤 ${hints.name}`);
  if (hints.phone) lines.push(`📞 ${hints.phone}`);
  if (hints.checkIn) lines.push(`📅 Заезд: ${hints.checkIn}`);
  if (hints.checkOut) lines.push(`📅 Выезд: ${hints.checkOut}`);
  if (hints.guests) lines.push(`👥 Гостей: ${hints.guests}`);
  if (lines.length) lines.push('');
  const preview = body.slice(0, 3200);
  return { summary: lines.join('\n'), preview };
}

async function pollOnce(deps) {
  if (!isConfigured()) return { ok: false, reason: 'not_configured' };
  if (polling) return { ok: false, reason: 'busy' };

  const { db, telegram, onNotify } = deps;
  polling = true;
  const result = { ok: true, found: 0, notified: 0, skipped: 0, errors: [] };

  const client = new ImapFlow(getConfig());
  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      const maxAgeDays = parseInt(process.env.TVIL_IMAP_MAX_AGE_DAYS || '14', 10);
      const since = new Date(Date.now() - maxAgeDays * 86400000);
      const uids = await client.search({ seen: false, since });

      const list = Array.isArray(uids) ? uids : [];
      const slice = list.slice(-40);
      if (!slice.length) {
        db.setSetting('tvil_last_poll', new Date().toISOString());
        db.setSetting('tvil_last_error', '');
        return result;
      }

      for await (const msg of client.fetch(slice, { source: true, envelope: true, uid: true }, { uid: true })) {
        if (!msg?.source) continue;

        result.found += 1;
        const parsed = await simpleParser(msg.source);
        const from = parsed.from?.text || msg.envelope?.from?.[0]?.address || '';
        const subject = parsed.subject || msg.envelope?.subject || 'TVIL';
        const messageId = parsed.messageId || `uid-${msg.uid}`;

        if (!looksLikeTvil(from, subject)) {
          result.skipped += 1;
          continue;
        }

        if (db.isTvilEmailProcessed(messageId)) {
          result.skipped += 1;
          continue;
        }

        const body = parsed.text || stripHtml(parsed.html) || '';
        const hints = parseBookingHints(`${subject}\n${body}`);
        const { summary, preview } = buildMessage(subject, body, hints);
        const message = summary ? `${summary}\n${preview}` : preview;

        if (telegram?.notifyExternal) {
          await telegram.notifyExternal({
            source: 'tvil',
            title: subject,
            message,
            url: process.env.TVIL_OWNER_URL || 'https://owner.tvil.ru/',
          });
        }
        if (onNotify) onNotify({ subject, from, hints, messageId });

        db.markTvilEmailProcessed({
          id: messageId,
          subject,
          from_addr: from,
          body_preview: preview.slice(0, 600),
          hints: JSON.stringify(hints),
        });

        if (process.env.TVIL_IMAP_MARK_READ !== 'false') {
          await client.messageFlagsAdd({ uid: msg.uid }, ['\\Seen'], { uid: true });
        }

        result.notified += 1;
      }
    } finally {
      lock.release();
    }
    await client.logout();

    db.setSetting('tvil_last_poll', new Date().toISOString());
    db.setSetting('tvil_last_error', '');
  } catch (err) {
    result.ok = false;
    result.errors.push(err.message);
    if (deps.db?.setSetting) {
      deps.db.setSetting('tvil_last_error', err.message);
      deps.db.setSetting('tvil_last_poll', new Date().toISOString());
    }
    console.error('[tvil-mail]', err.message);
  } finally {
    polling = false;
    try {
      client.close();
    } catch (_) {}
  }

  return result;
}

function startPoller(deps) {
  if (!isConfigured()) return null;
  const interval = parseInt(process.env.TVIL_IMAP_POLL_MS || '120000', 10);
  if (pollTimer) clearInterval(pollTimer);

  setTimeout(() => {
    pollOnce(deps).then((r) => {
      if (r.notified) console.log(`[tvil-mail] уведомлений: ${r.notified}`);
    });
  }, 8000);

  pollTimer = setInterval(() => {
    pollOnce(deps).catch(() => {});
  }, Math.max(interval, 60000));

  console.log(`[tvil-mail] опрос почты каждые ${Math.round(interval / 1000)} с`);
  return pollTimer;
}

function stopPoller() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

function getStatus(db) {
  const recent = db?.getTvilEmailsRecent?.(5) || [];
  return {
    configured: isConfigured(),
    host: process.env.TVIL_IMAP_HOST || '',
    user: process.env.TVIL_IMAP_USER ? `${process.env.TVIL_IMAP_USER.slice(0, 2)}…` : '',
    pollIntervalSec: parseInt(process.env.TVIL_IMAP_POLL_MS || '120000', 10) / 1000,
    markRead: process.env.TVIL_IMAP_MARK_READ !== 'false',
    lastPoll: db?.getSetting?.('tvil_last_poll', '') || '',
    lastError: db?.getSetting?.('tvil_last_error', '') || '',
    processedTotal: db?.countTvilEmails?.() || 0,
    recent,
  };
}

module.exports = {
  isConfigured,
  looksLikeTvil,
  parseBookingHints,
  pollOnce,
  startPoller,
  stopPoller,
  getStatus,
};
