/**
 * Опрос внутреннего API личного кабинета TVIL (как в DevTools → Network).
 * Нужны cookie сессии из браузера — см. TVIL-DEVTOOLS.md
 */
const https = require('https');
const http = require('http');

const WATCH_COUNTERS = [
  'arrival-today',
  'not-success',
  'success',
  'live-unread-messages',
];

let pollTimer = null;
let polling = false;

function isConfigured() {
  return Boolean(process.env.TVIL_COOKIE || process.env.TVIL_SESSION_COOKIE);
}

function getApiBase() {
  return (process.env.TVIL_API_BASE || 'https://tvil.ru/api/v1').replace(/\/$/, '');
}

function getCookie() {
  return (process.env.TVIL_COOKIE || process.env.TVIL_SESSION_COOKIE || '').trim();
}

function getCountersList() {
  const raw = process.env.TVIL_BADGE_COUNTERS || WATCH_COUNTERS.join(',');
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function requestJson(urlStr) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const lib = url.protocol === 'https:' ? https : http;
    const opts = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        Accept: 'application/json, application/vnd.api+json',
        Cookie: getCookie(),
        Referer: process.env.TVIL_REFERER || 'https://tvil.ru/owner/',
        'User-Agent':
          process.env.TVIL_USER_AGENT ||
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'X-Requested-With': 'XMLHttpRequest',
      },
    };

    const req = lib.request(opts, (res) => {
      let body = '';
      res.on('data', (c) => {
        body += c;
      });
      res.on('end', () => {
        if (res.statusCode === 401 || res.statusCode === 403) {
          return reject(new Error('TVIL: сессия истекла — обновите TVIL_COOKIE в Bothost'));
        }
        if (res.statusCode >= 400) {
          return reject(new Error(`TVIL API HTTP ${res.statusCode}: ${body.slice(0, 200)}`));
        }
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error('TVIL API: не JSON — проверьте TVIL_API_BASE'));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(25000, () => req.destroy(new Error('TVIL API timeout')));
    req.end();
  });
}

/** Разные форматы ответа badges */
function extractCounts(payload) {
  const out = {};
  if (!payload) return out;

  if (payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)) {
    Object.assign(out, payload.data);
  }

  if (Array.isArray(payload.data)) {
    payload.data.forEach((item) => {
      const key = item.id || item.attributes?.counter || item.type;
      const val = item.attributes?.count ?? item.attributes?.value ?? item.count;
      if (key != null && val != null) out[key] = Number(val);
    });
  }

  if (payload.counters && typeof payload.counters === 'object') {
    Object.assign(out, payload.counters);
  }

  Object.keys(payload).forEach((k) => {
    if (typeof payload[k] === 'number' && getCountersList().includes(k)) {
      out[k] = payload[k];
    }
  });

  return out;
}

function getStoredCount(db, key) {
  const v = db.getSetting(`tvil_badge_${key}`, '');
  if (v === '' || v == null) return null;
  return Number(v);
}

function setStoredCount(db, key, val) {
  db.setSetting(`tvil_badge_${key}`, String(val));
}

async function fetchBadges() {
  const counters = getCountersList().join(',');
  const q = `badges?isClient=0&counter=${encodeURIComponent(counters)}`;
  const url = `${getApiBase()}/${q}`;
  const json = await requestJson(url);
  return extractCounts(json);
}

async function pollOnce(deps) {
  if (!isConfigured()) return { ok: false, reason: 'not_configured' };
  if (polling) return { ok: false, reason: 'busy' };

  const { db, telegram } = deps;
  polling = true;
  const result = { ok: true, counts: {}, notified: [], skipped: false, errors: [] };

  try {
    const counts = await fetchBadges();
    result.counts = counts;
    const notifyOnFirst = process.env.TVIL_API_NOTIFY_ON_START === 'true';
    let isFirstSync = db.getSetting('tvil_api_synced', '') !== 'true';

    for (const [key, val] of Object.entries(counts)) {
      const num = Number(val);
      if (Number.isNaN(num)) continue;

      const prev = getStoredCount(db, key);
      setStoredCount(db, key, num);

      if (prev === null) {
        if (!notifyOnFirst) continue;
      } else if (num <= prev) {
        continue;
      }

      const delta = prev === null ? num : num - prev;
      const title = `TVIL: ${labelForCounter(key)}`;
      const message = [
        `Счётчик «${key}»: ${prev === null ? '' : `было ${prev} → `}стало ${num}`,
        delta > 0 ? `(+${delta})` : '',
        '',
        'Проверьте личный кабинет TVIL.',
      ]
        .filter(Boolean)
        .join('\n');

      if (telegram?.notifyExternal) {
        await telegram.notifyExternal({
          source: 'tvil',
          title,
          message,
          url: process.env.TVIL_OWNER_URL || 'https://tvil.ru/owner/',
        });
      }
      result.notified.push(key);
    }

    if (isFirstSync && !notifyOnFirst) {
      result.skipped = true;
      result.message = 'Первый опрос: базовые значения сохранены, уведомлений не было';
    }

    db.setSetting('tvil_api_synced', 'true');
    db.setSetting('tvil_api_last_poll', new Date().toISOString());
    db.setSetting('tvil_api_last_error', '');
  } catch (err) {
    result.ok = false;
    result.errors.push(err.message);
    db.setSetting('tvil_api_last_error', err.message);
    db.setSetting('tvil_api_last_poll', new Date().toISOString());
    console.error('[tvil-api]', err.message);
  } finally {
    polling = false;
  }

  return result;
}

function labelForCounter(key) {
  const labels = {
    'arrival-today': 'Заезды сегодня',
    'not-success': 'Нужна реакция',
    success: 'Успешные',
    'live-unread-messages': 'Непрочитанные сообщения',
  };
  return labels[key] || key;
}

function startPoller(deps) {
  if (!isConfigured()) return null;
  const interval = parseInt(process.env.TVIL_API_POLL_MS || '90000', 10);
  if (pollTimer) clearInterval(pollTimer);

  setTimeout(() => {
    pollOnce(deps).catch(() => {});
  }, 10000);

  pollTimer = setInterval(() => {
    pollOnce(deps).catch(() => {});
  }, Math.max(interval, 45000));

  console.log(`[tvil-api] опрос badges каждые ${Math.round(interval / 1000)} с`);
  return pollTimer;
}

function getStatus(db) {
  const counters = getCountersList();
  const stored = {};
  counters.forEach((k) => {
    const v = getStoredCount(db, k);
    if (v !== null) stored[k] = v;
  });

  return {
    configured: isConfigured(),
    apiBase: getApiBase(),
    counters,
    stored,
    pollIntervalSec: parseInt(process.env.TVIL_API_POLL_MS || '90000', 10) / 1000,
    lastPoll: db?.getSetting?.('tvil_api_last_poll', '') || '',
    lastError: db?.getSetting?.('tvil_api_last_error', '') || '',
    synced: db?.getSetting?.('tvil_api_synced', '') === 'true',
  };
}

module.exports = {
  isConfigured,
  fetchBadges,
  pollOnce,
  startPoller,
  getStatus,
  getCountersList,
};
