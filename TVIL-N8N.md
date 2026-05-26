# TVIL → Telegram через n8n

Сайт DVIN уже принимает уведомления на:

```
POST https://atelmore.bothost.tech/api/webhooks/notify
Header: X-Webhook-Secret: <ваш WEBHOOK_SECRET>
Content-Type: application/json

{
  "source": "tvil",
  "title": "Новая заявка TVIL",
  "message": "текст письма или заявки",
  "url": "https://tvil.ru/owner/"
}
```

n8n связывает **почту TVIL** (или другой триггер) с этим URL → дальше DVIN шлёт в **Telegram**.

---

## Вариант A — письма TVIL (рекомендуется в n8n)

### 1. Bothost

```
WEBHOOK_SECRET=длинная-случайная-строка
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
```

### 2. Workflow в n8n

**Узел 1 — триггер почты** (один на выбор):

| Узел | Когда использовать |
|------|-------------------|
| **Gmail Trigger** | Почта Gmail, куда приходят письма TVIL |
| **Microsoft Outlook Trigger** | Outlook / Hotmail |
| **Email Trigger (IMAP)** | Яндекс, Mail.ru и др. |

Настройки IMAP для Яндекса:
- Host: `imap.yandex.ru`
- Port: `993`
- SSL: да
- User / Password: **пароль приложения**

**Узел 2 — IF** (фильтр):

- `{{ $json.from }}` contains `tvil`  
  **или**
- `{{ $json.subject }}` contains `ТВИЛ` / `заявк` / `бронь`

**Узел 3 — HTTP Request**

| Поле | Значение |
|------|----------|
| Method | POST |
| URL | `https://atelmore.bothost.tech/api/webhooks/notify` |
| Authentication | None |
| Header `X-Webhook-Secret` | ваш `WEBHOOK_SECRET` |
| Header `Content-Type` | `application/json` |
| Body (JSON) | см. ниже |

```json
{
  "source": "tvil",
  "title": "={{ $json.subject }}",
  "message": "={{ $json.text || $json.textPlain || $json.snippet }}",
  "url": "https://tvil.ru/owner/"
}
```

Имена полей (`text`, `textPlain`) зависят от узла почты — подставьте то, что есть в выходе триггера (кнопка «Execute» → посмотреть JSON).

**Узел 4 (опционально)** — Telegram напрямую в n8n не нужен, если уже настроен бот на DVIN. Иначе можно дублировать узлом Telegram.

### 3. Тест

В n8n: **Execute workflow** → отправьте себе тестовое письмо «от TVIL» или перешлите старое как непрочитанное.

В Telegram должно прийти сообщение с источником **TVIL.ru**.

---

## Вариант B — без n8n (проще)

На Bothost задайте `TVIL_IMAP_*` — сайт сам читает почту. См. **TVIL-MAIL.md**.  
n8n тогда не нужен.

---

## Вариант C — n8n + TVIL API (сложнее)

Можно в n8n по расписанию (**Schedule Trigger** каждые 2 мин) вызывать TVIL `badges` с cookie из DevTools — как в **TVIL-DEVTOOLS.md**.

Но проще это уже делает сам сайт (`TVIL_COOKIE` на Bothost), без n8n.

---

## Сравнение

| Способ | n8n нужен? |
|--------|------------|
| IMAP на сайте (TVIL-MAIL) | Нет |
| n8n: почта → webhook | Да |
| TVIL API (cookie) на сайте | Нет |
| Make / Zapier | Аналог n8n |

---

## Ошибки

| Проблема | Решение |
|----------|---------|
| 401 на webhook | Неверный `WEBHOOK_SECRET` в n8n |
| Письма не ловятся | Ослабьте фильтр IF, проверьте папку «Входящие» |
| Пустой message | В HTTP Request подставьте другое поле тела письма из JSON узла почты |
