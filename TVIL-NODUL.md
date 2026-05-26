# TVIL → Telegram через Nodul

[Nodul](https://www.nodul.ru/) — лоукод-платформа (как n8n). Сценарий из браузера можно связать с сайтом DVIN.

Сайт принимает уведомления:

```
POST https://atelmore.bothost.tech/api/webhooks/notify
Header: X-Webhook-Secret: <WEBHOOK_SECRET из Bothost>
Content-Type: application/json

{
  "source": "tvil",
  "title": "Тема письма",
  "message": "Текст заявки",
  "url": "https://tvil.ru/owner/"
}
```

Дальше DVIN отправляет сообщение в **Telegram** (если настроены `TELEGRAM_BOT_TOKEN` и chat_id).

---

## Схема в Nodul (рекомендуется)

```
[Триггер: почта TVIL] → [Фильтр tvil] → [HTTP-запрос на DVIN]
```

### Шаг 1 — Bothost

```
WEBHOOK_SECRET=случайная-длинная-строка
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
```

### Шаг 2 — триггер в Nodul (один вариант)

**A) Gmail** — если заявки TVIL приходят на Gmail / Google Workspace  
Документация: https://documentation.nodul.ru/integrations/app-nodes/gmail  
Триггер: новое письмо → фильтр `from` содержит `tvil`

**B) Mailhook** — уникальный адрес Nodul для входящих писем  
https://documentation.nodul.ru/integrations/core-nodes/trigger-on-mailhook  

В TVIL нельзя всегда сменить email на mailhook, но можно:
- настроить **пересылку** с ящика TVIL на адрес Mailhook в почте Яндекс/Gmail;
- или правило «если от tvil.ru → переслать на …@mailhook…».

**C) Триггер по расписанию** — если в вашем сценарии уже есть опрос API (редко для TVIL).

### Шаг 3 — узел «HTTP-запрос»

Документация: https://documentation.nodul.ru/integrations/core-nodes/http-request

| Поле | Значение |
|------|----------|
| Method | POST |
| URL | `https://atelmore.bothost.tech/api/webhooks/notify` |
| Header | `X-Webhook-Secret` = ваш `WEBHOOK_SECRET` |
| Header | `Content-Type` = `application/json` |
| Body (raw JSON) | см. ниже |

Подставьте поля из предыдущего узла (как в Nodul: `{{1.subject}}` или через Map — смотрите выход триггера после тестового запуска):

```json
{
  "source": "tvil",
  "title": "тема письма из узла",
  "message": "текст письма из узла",
  "url": "https://tvil.ru/owner/"
}
```

### Шаг 4 — опубликовать сценарий

Включите **Production** (не только Development), иначе сценарий сработает один раз и остановится.

---

## Если в сценарии уже есть «Триггер по вебхуку»

Ваш URL вида `app.nodul.ru/scenarios/67a7f280...` — это **ваш** сценарий. Вебхук Nodul — это **вход** в Nodul, а не выход на TVIL.

Для TVIL нужно наоборот:

- **вход** = письмо / Gmail / Mailhook (событие TVIL);
- **выход** = HTTP-запрос **на сайт DVIN** (см. выше).

Не путайте:
- URL вебхука **Nodul** (в Nodul к вам шлют)  
- URL вебхука **DVIN** (`/api/webhooks/notify` на atelmore.bothost.tech)

---

## Telegram прямо из Nodul

Можно после HTTP-запроса добавить узел Telegram в Nodul — но тогда бот настраивается **дважды**. Проще один раз в Bothost (`TELEGRAM_*`) и только HTTP на DVIN.

---

## Сравнение

| Способ | Nodul |
|--------|-------|
| IMAP на сайте (`TVIL_IMAP_*`) | Nodul не нужен |
| **Nodul → webhook DVIN** | Да, этот файл |
| TVIL API (cookie) на сайте | Nodul не нужен |

---

## Проверка

1. В Nodul: тестовый запуск с письмом «от TVIL».
2. В логе узла HTTP — ответ `{"success":true}`.
3. В Telegram — сообщение «TVIL.ru».

Ошибка **401** — неверный `X-Webhook-Secret`.

---

## Ваш сценарий

Откройте: https://app.nodul.ru/scenarios/67a7f280b44284924ddd637c?version=4

Если там уже есть цепочка — пришлите скрин узлов (без секретов): подскажем, куда вставить HTTP на DVIN.
