# Уведомления с TVIL.ru в Telegram

У TVIL **нет API** для владельцев. Заявки приходят:
- в [личный кабинет](https://owner.tvil.ru/)
- на **email**, указанный в профиле TVIL

Сайт DVIN может **сам читать эту почту** (IMAP) и слать в Telegram то же, что приходит с TVIL.

---

## Шаг 1 — узнайте, куда TVIL шлёт письма

1. Войдите на https://owner.tvil.ru/
2. Профиль / настройки → посмотрите **email для уведомлений**
3. Это может быть Яндекс, Mail.ru, Gmail и т.д.

---

## Шаг 2 — пароль для приложения (IMAP)

Почта должна разрешать вход по IMAP. Обычно нужен **пароль приложения**, не основной пароль от аккаунта.

### Яндекс
1. https://id.yandex.ru/security/app-passwords → создать пароль «Почта»
2. Включить IMAP: Настройки почты → Почтовые программы → IMAP

```
TVIL_IMAP_HOST=imap.yandex.ru
TVIL_IMAP_PORT=993
TVIL_IMAP_USER=ваш@yandex.ru
TVIL_IMAP_PASSWORD=пароль-приложения
```

### Mail.ru
1. Настройки → Пароль и безопасность → Пароли для внешних приложений

```
TVIL_IMAP_HOST=imap.mail.ru
TVIL_IMAP_PORT=993
TVIL_IMAP_USER=ваш@mail.ru
TVIL_IMAP_PASSWORD=пароль-приложения
```

### Gmail
1. Двухфакторная аутентификация → Пароль приложения
2. https://myaccount.google.com/apppasswords

```
TVIL_IMAP_HOST=imap.gmail.com
TVIL_IMAP_PORT=993
TVIL_IMAP_USER=ваш@gmail.com
TVIL_IMAP_PASSWORD=пароль-приложения
```

---

## Шаг 3 — переменные на Bothost

Добавьте к уже настроенному Telegram:

```
TVIL_IMAP_HOST=imap.yandex.ru
TVIL_IMAP_PORT=993
TVIL_IMAP_USER=ваш@yandex.ru
TVIL_IMAP_PASSWORD=xxxxxxxx
TVIL_IMAP_POLL_MS=120000
TVIL_IMAP_MARK_READ=true
TVIL_IMAP_MAX_AGE_DAYS=14
TVIL_OWNER_URL=https://owner.tvil.ru/
```

| Переменная | Значение |
|------------|----------|
| `TVIL_IMAP_POLL_MS` | Интервал опроса в мс (120000 = 2 мин) |
| `TVIL_IMAP_MARK_READ` | `true` — помечать письма прочитанными после уведомления |
| `TVIL_IMAP_MAX_AGE_DAYS` | Не брать письма старше N дней (только непрочитанные) |

**Передеплой** сайт.

---

## Шаг 4 — проверка

1. https://atelmore.bothost.tech/health → `"tvilMail":{"configured":true}`
2. Админка → **Telegram** → «Проверить почту сейчас»
3. Попросите тестовую заявку на TVIL или перешлите себе старое письмо от TVIL как **непрочитанное**

В Telegram должно прийти сообщение с темой письма и текстом (телефон и даты, если есть в письме, подставятся автоматически).

---

## Как это работает

```
TVIL.ru → письмо на вашу почту → сервер DVIN (IMAP каждые 2 мин)
         → фильтр @tvil.ru / «заявка», «бронь» → Telegram-бот
```

Обработанные письма сохраняются в БД (`tvil_emails`), повторно не дублируются.

---

## Если не приходят уведомления

1. В Bothost в логах: `[tvil-mail] опрос почты` — значит модуль запущен
2. Ошибка в админке в блоке TVIL — неверный пароль или IMAP выключен
3. Письмо уже **прочитано** — сделайте непрочитанным или пришлите новую заявку
4. Письмо не от TVIL (другой отправитель) — добавьте в тему слово «ТВИЛ» или пишите в поддержку, расширим фильтр

---

## Запасной вариант без IMAP

Если IMAP недоступен: [Make.com](https://www.make.com) — триггер «новое письмо» → HTTP POST на  
`https://atelmore.bothost.tech/api/webhooks/notify`  
(см. `TELEGRAM.md`).
