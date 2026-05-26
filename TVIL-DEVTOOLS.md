# TVIL через DevTools (внутренний API)

В личном кабинете TVIL сайт сам ходит в API. Это **не официальный** публичный API, но для уведомлений его можно опрашивать так же, как браузер.

## Что вы видели в Network

| Запрос | Что это |
|--------|---------|
| `Fetch4178746?...&t=gdpr` | **Яндекс.Метрика** — не нужно |
| `4178746?wmode=7&page-url=...` | Тоже **Метрика** |
| `events.json` | Аналитика |
| **`badges?isClient=0&counter=...`** | **Нужно** — счётчики заявок/заездов |
| **`ownerEntities?...`** | Ваши объекты (ID 1170033 и др.) |
| `user?include=...` | Профиль |
| `favorites?...` | Избранное |
| `getReferralLink` | Реферальная программа |

Для Telegram-бота используем **`badges`** — там счётчики вроде:
- `arrival-today` — заезды сегодня  
- `not-success` — нужна ваша реакция  
- `success` — подтверждённые  
- `live-unread-messages` — непрочитанные чаты  

Когда счётчик **растёт** → в Telegram приходит уведомление.

---

## Настройка (5 минут)

### 1. Откройте DevTools правильно

1. Войдите на https://tvil.ru/owner/ (или owner.tvil.ru).
2. **F12** → вкладка **Сеть (Network)**.
3. Фильтр: **Fetch/XHR** (не «Все»).
4. Обновите страницу (**F5**).

### 2. Найдите запрос `badges`

Кликните строку вида:
```
badges?isClient=0&counter=arrival-today,...
```

Справа:
- **Заголовки** → **Request URL** — скопируйте до `/badges` (без `?`):

Правильный URL (актуальный для TVIL):

```
https://tvil.ru/api/reserves/badges?isClient=0&counter=...
```

В Bothost:

```
TVIL_API_BASE=https://tvil.ru/api/reserves
```

(Если у вас другой путь — укажите свой, как в DevTools.)

### 3. Скопируйте Cookie

В том же запросе → **Заголовки** → **Cookie** (или **Request Headers** → `cookie:`).

Скопируйте **всю** строку (длинная) в Bothost:

```
TVIL_COOKIE=вставьте_сюда_без_кавычек
```

Сессия живёт ограниченное время (дни/недели). Если придёт ошибка «сессия истекла» — зайдите в TVIL в браузере снова и обновите `TVIL_COOKIE`.

### 4. Переменные Bothost

```
TVIL_API_BASE=https://tvil.ru/api/v1
TVIL_COOKIE=...
TVIL_API_POLL_MS=90000
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
```

Опционально:

```
TVIL_BADGE_COUNTERS=arrival-today,not-success,success,live-unread-messages
TVIL_OWNER_URL=https://tvil.ru/owner/
TVIL_API_NOTIFY_ON_START=false
```

`TVIL_API_NOTIFY_ON_START=false` (по умолчанию) — первый опрос только запоминает цифры, без спама. Потом уведомляет только при **росте** счётчика.

### 5. Передеплой и проверка

- `/health` → `"tvilApi": { "configured": true }`
- Админка → **Telegram** → **«Проверить TVIL API»**
- Или дождитесь новой заявки на TVIL и роста счётчика

---

## Ограничения

- Cookie нужно **обновлять** после выхода из TVIL / смены пароля.
- TVIL может изменить API — тогда поправим `TVIL_API_BASE`.
- Это **дополнение** к почте (IMAP): почта надёжнее, API быстрее по счётчикам.

---

## Если `badges` не работает

1. Проверьте **точный** Request URL из DevTools (не угадывайте).
2. Пришлите в поддержку скрин: URL + статус ответа (200 / 401).
3. Используйте **IMAP** — см. `TVIL-MAIL.md`.
