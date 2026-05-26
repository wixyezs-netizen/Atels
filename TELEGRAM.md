# Telegram-уведомления DVIN

## 1. Создать бота

1. В Telegram откройте [@BotFather](https://t.me/BotFather).
2. Команда `/newbot` → имя и username бота.
3. Скопируйте **токен** (вид `123456789:ABCdef...`).

## 2. Узнать chat_id

**Способ А (проще):** напишите боту `/start` после деплоя сайта с токеном — chat_id сохранится автоматически.

**Способ Б:** напишите боту любое сообщение, откройте в браузере:
`https://api.telegram.org/bot<ТОКЕН>/getUpdates`  
Найдите `"chat":{"id":123456789}`.

## 3. Переменные на Bothost

```
TELEGRAM_BOT_TOKEN=123456789:ABCdef...
TELEGRAM_CHAT_ID=123456789
WEBHOOK_SECRET=случайная-длинная-строка-для-tvil
TELEGRAM_WEBHOOK_SECRET=только_буквы_цифры_дефис_подчеркивание
SITE_URL=https://atelmore.bothost.tech
```

Несколько получателей: `TELEGRAM_CHAT_ID=111,222,333`

После сохранения — **передеплой**. Напишите боту `/start`.

## 4. Что приходит в Telegram

| Событие | Когда |
|---------|--------|
| Новая бронь с сайта | Гость отправил форму |
| Смена статуса брони | В админке изменили статус |
| Новый отзыв | Гость оставил отзыв |
| TVIL / другое | Через вебхук (см. ниже) |

Проверка: админка → **Telegram** → «Отправить тест».

---

## TVIL.ru — можно ли напрямую?

У [вашего объявления на TVIL](https://tvil.ru/city/golubickaya/hotels/1170033/) **нет открытого API** для владельцев: заявки приходят в личный кабинет и на **email** с сайта. Прямой «подписки» на брони TVIL в бот без посредника TVIL не даёт.

### Вариант 1 — письма TVIL → сайт → Telegram (рекомендуется)

1. Убедитесь, что на TVIL указана почта, куда приходят заявки.
2. Зарегистрируйтесь на [Make.com](https://www.make.com) или [Zapier](https://zapier.com).
3. Сценарий:
   - **Триггер:** Gmail / Outlook — новое письмо от `@tvil.ru` или с темой «ТВИЛ», «заявк», «бронь».
   - **Действие:** HTTP POST на ваш сайт:

```
URL: https://atelmore.bothost.tech/api/webhooks/notify
Method: POST
Header: X-Webhook-Secret: <ваш WEBHOOK_SECRET>
Content-Type: application/json

Body:
{
  "source": "tvil",
  "title": "Новая заявка TVIL",
  "message": "{{тема письма}}\n\n{{текст письма}}",
  "url": "https://owner.tvil.ru/"
}
```

4. В Bothost задайте `WEBHOOK_SECRET` тот же, что в заголовке.

### Вариант 2 — менеджер каналов (Bnovo, BookingLite…)

Если подключите TVIL к Bnovo/BookingLite, уведомления идут в их систему. Оттуда часто можно настроить webhook на тот же URL `/api/webhooks/notify` — см. документацию вашей PMS.

### Вариант 3 — вручную

Перешлите текст заявки с TVIL в чат с ботом (если нужно только архивировать) — основной поток лучше через вариант 1.

---

## Тест вебхука (PowerShell)

```powershell
$secret = "ваш-WEBHOOK_SECRET"
$body = @{
  source = "tvil"
  title = "Тест TVIL"
  message = "Проверка уведомления"
  url = "https://tvil.ru/city/golubickaya/hotels/1170033/"
} | ConvertTo-Json

Invoke-RestMethod -Uri "https://atelmore.bothost.tech/api/webhooks/notify" `
  -Method POST `
  -Headers @{ "X-Webhook-Secret" = $secret; "Content-Type" = "application/json" } `
  -Body $body
```
