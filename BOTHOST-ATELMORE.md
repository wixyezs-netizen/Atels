# Деплой DVIN на https://atelmore.bothost.tech

## Параметры Bothost

| Параметр | Значение |
|----------|----------|
| Домен | `atelmore.bothost.tech` |
| **Использовать домен** | Включено |
| **Порт** | `3000` |
| **Главный файл** | **`server.js`** или **`index.js`** (НЕ `js/main.js` / `public/js/main.js`) |
| Команда | `npm start` |

### Ошибка `document is not defined`

Bothost запустил браузерный скрипт как Node. В панели укажите **`server.js`**, сохраните и **передеплойте**.  
В репозитории `js/main.js` в корне — заглушка, перенаправляет на `server.js`.

## Переменные

```
PORT=3000
SITE_URL=https://atelmore.bothost.tech
NODE_ENV=production
TELEGRAM_BOT_TOKEN=...от BotFather...
TELEGRAM_CHAT_ID=...ваш chat_id...
WEBHOOK_SECRET=...для TVIL через Make...
TELEGRAM_WEBHOOK_SECRET=...для /start у бота...
```

Инструкция по боту и TVIL: `TELEGRAM.md` в репозитории или `/TELEGRAM.md` на сайте.

## Обновить сайт (обязательно после правок)

```powershell
cd C:\Users\QWERTY_\atelier-site
node sync-dvin.js
git add public/ server.js package.json index.js main.js js/main.js copy-css.js
git commit -m "DVIN site for atelmore.bothost.tech"
git push
```

В панели Bothost нажмите **Передеплой** / **Rebuild**.

## Bad Gateway (логи «запущен», сайт не открывается)

Чаще всего на сервере **старая** версия `server.js`: порт и хост в `app.listen` были перепутаны, Node слушал не порт 3000.

1. Залейте последний код (`git push`) и нажмите **Передеплой**.
2. В панели: порт **3000**, главный файл **`server.js`**, домен включён.
3. Откройте https://atelmore.bothost.tech/health — должно быть `"ok":true`, `"build":"dvin-v4-listen-fix"`.
4. Если health тоже Bad Gateway — смотрите логи **после** строки «Сайт: /»; если есть `initData:` или `Ошибка запуска` — пришлите текст.

## Проверка

- https://atelmore.bothost.tech/health → `"site":"dvin-v4"`, `"build":"dvin-v4-listen-fix"`
- Главная: заголовок **DVIN**, одно фото в шапке (не карусель)

Если на сайте всё ещё «Элегант» — на сервере **старый** `public/index.html`. Нужен push + передеплой.

## Фото террасы в шапке

Скопируйте ваше фото в `public/images/hero.jpg` (или запустите `setup-hero.ps1` с файлами в `Desktop\картинки`), затем в админке **Настройки → Фото шапки** укажите `/images/hero.jpg` и передеплойте.
