/**
 * Опрос внутреннего API личного кабинета TVIL (DevTools → badges).
 */
const https = require('https');
const http = require('http');
const zlib = require('zlib');

/** Счётчики как в личном кабинете TVIL (запрос reserves/badges). */
const WATCH_COUNTERS = [
  'arrival-today',
  'arrival-tomorrow',
  'arrived-no-departure',
  'confirmed-not-ready',
  'fixed',
  'guest-response-not-ready',
  'not-confirmed',
  'not-success',
  'success',
  'live-unread-messages',
];

let pollTimer = null;
let polling = false;

function isConfigured() {
  return Boolean(process.env.TVIL_COOKIE || process.env.TVIL_SESSION_COOKIE);
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

function getApiCandidates(db) {
  const saved = db?.getSetting?.('tvil_api_base_ok', '');
  const fromEnv = process.env.TVIL_API_BASE;
  const list = [
    saved,
    fromEnv,
    'https://tvil.ru/api/reserves',
    'https://tvil.ru/api/v1',
    'https://tvil.ru/api',
  ].filter(Boolean);
  return [...new Set(list.map((b) => b.replace(/\/$/, '')))];
}

function requestJson(urlStr) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const lib = url.protocol === 'https:' ? https : http;
    const auth = (process.env.TVIL_AUTHORIZATION || '').trim();
    const opts = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        // TVIL отвечает в JSON:API и может возвращать 406, если Accept "не тот".
        Accept: 'application/vnd.api+json',
        'Content-Type': 'application/vnd.api+json',
        'Accept-Language': 'ru-RU,ru;q=0.9',
        // В DevTools часто видно gzip. Node корректно читает content-encoding, мы распаковываем если надо.
        'Accept-Encoding': 'gzip, deflate, br',
        Cookie: getCookie(),
        Origin: 'https://tvil.ru',
        // В вашем запросе Referer: https://tvil.ru/owner/reserve/
        Referer: process.env.TVIL_REFERER || 'https://tvil.ru/owner/reserve/',
        // В вашем запросе присутствует derived-from: front_v3
        'Derived-From': process.env.TVIL_DERIVED_FROM || 'front_v3',
        'User-Agent':
          process.env.TVIL_USER_AGENT ||
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'X-Requested-With': 'XMLHttpRequest',
        ...(auth ? { Authorization: auth } : {}),
      },
    };

    const req = lib.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(Buffer.from(c)));
      res.on('end', () => {
        const status = res.statusCode || 0;
        const ct = String(res.headers['content-type'] || '');
        const enc = String(res.headers['content-encoding'] || '').toLowerCase();
        const loc = res.headers.location;

        if ([301, 302, 303, 307, 308].includes(status)) {
          return reject(
            new Error(
              `TVIL HTTP ${status}: редирект на ${loc || '(unknown)'} (скорее всего нужно скопировать Authorization из DevTools или обновить cookie)`
            )
          );
        }

        const raw = Buffer.concat(chunks);
        const decode = () => {
          try {
            if (enc === 'gzip') return zlib.gunzipSync(raw);
            if (enc === 'deflate') return zlib.inflateSync(raw);
            if (enc === 'br' && typeof zlib.brotliDecompressSync === 'function') return zlib.brotliDecompressSync(raw);
          } catch (_) {}
          return raw;
        };
        const body = decode().toString('utf8').trim();

        if (status === 401 || status === 403) {
          return reject(new Error('TVIL: сессия истекла — обновите TVIL_COOKIE'));
        }
        if (status >= 400) {
          // Часто TVIL возвращает JSON:API errors даже на 4xx — пробуем распарсить, чтобы показать причину.
          if (body && !body.startsWith('<')) {
            try {
              const j = JSON.parse(body);
              const first =
                j?.errors?.[0]?.title ||
                j?.errors?.[0]?.detail ||
                j?.message ||
                body.slice(0, 160);
              return reject(new Error(`TVIL HTTP ${status}: ${String(first)}`));
            } catch (_) {}
          }
          return reject(new Error(`TVIL HTTP ${status}: ${body.slice(0, 160).replace(/\s+/g, ' ')}`));
        }
        if (!body) {
          return reject(new Error('TVIL API: пустой ответ'));
        }
        if (body.startsWith('<') || /text\/html/i.test(ct)) {
          return reject(
            new Error(
              `TVIL вернул HTML вместо JSON. Проверьте DevTools → badges → Request Headers: возможно есть Authorization. Фрагмент: ${body.slice(0, 80)}`
            )
          );
        }
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(
            new Error(
              `TVIL API: не JSON (${ct || 'no-ct'}; enc=${enc || 'none'}). Проверьте TVIL_API_BASE и cookie. Начало: ${body.slice(0, 100)}`
            )
          );
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(25000, () => req.destroy(new Error('TVIL API timeout')));
    req.end();
  });
}

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

async function fetchBadges(db) {
  const counters = getCountersList().join(',');
  const q = `badges?isClient=0&counter=${encodeURIComponent(counters)}`;
  let lastErr;

  for (const base of getApiCandidates(db)) {
    const url = `${base}/${q}`;
    try {
      const json = await requestJson(url);
      if (db) db.setSetting('tvil_api_base_ok', base);
      const counts = extractCounts(json);
      if (Object.keys(counts).length) return counts;
      lastErr = new Error('TVIL API: JSON без счётчиков — проверьте TVIL_BADGE_COUNTERS');
    } catch (e) {
      lastErr = e;
    }
  }

  throw lastErr || new Error('TVIL API: не удалось получить badges');
}

async function diagnose(db) {
  const counters = getCountersList().join(',');
  const q = `badges?isClient=0&counter=${encodeURIComponent(counters)}`;
  const results = [];

  for (const base of getApiCandidates(db)) {
    const url = `${base}/${q}`;
    try {
      const json = await requestJson(url);
      const counts = extractCounts(json);
      results.push({ base, ok: true, counts, url });
    } catch (e) {
      results.push({ base, ok: false, error: e.message, url });
    }
  }

  return results;
}

async function pollOnce(deps) {
  if (!isConfigured()) return { ok: false, reason: 'not_configured' };
  if (polling) return { ok: false, reason: 'busy' };

  const { db, telegram } = deps;
  polling = true;
  const result = { ok: true, counts: {}, notified: [], skipped: false, errors: [] };

  try {
    const counts = await fetchBadges(db);
    result.counts = counts;
    const notifyOnFirst = process.env.TVIL_API_NOTIFY_ON_START === 'true';
    const isFirstSync = db.getSetting('tvil_api_synced', '') !== 'true';

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
    if (db.getSetting('tvil_api_base_ok')) {
      result.apiBase = db.getSetting('tvil_api_base_ok');
    }
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
    'arrival-today': 'Заезд сегодня',
    'arrival-tomorrow': 'Заезд завтра',
    'arrived-no-departure': 'Заехали, не выехали',
    'confirmed-not-ready': 'Подтверждено, не готово',
    fixed: 'Закреплено',
    'guest-response-not-ready': 'Ответ гостя',
    'not-confirmed': 'Не подтверждено',
    'not-success': 'Требует внимания',
    success: 'Успешные',
    'live-unread-messages': 'Непрочитанные сообщения',
  };
  return labels[key] || key;
}

function startPoller(deps) {
  if (!isConfigured()) return null;
  if (global.__tvilApiPollerStarted) return pollTimer;
  global.__tvilApiPollerStarted = true;

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
    apiBase:
      db?.getSetting?.('tvil_api_base_ok') || process.env.TVIL_API_BASE || 'https://tvil.ru/api/reserves',
    apiCandidates: getApiCandidates(db),
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
  diagnose,
  pollOnce,
  startPoller,
  getStatus,
  getCountersList,
};
