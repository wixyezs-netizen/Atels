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
```

## Обновить сайт (обязательно после правок)

```powershell
cd C:\Users\QWERTY_\atelier-site
node sync-dvin.js
git add public/ server.js package.json index.js main.js js/main.js copy-css.js
git commit -m "DVIN site for atelmore.bothost.tech"
git push
```

В панели Bothost нажмите **Передеплой** / **Rebuild**.

## Проверка

- https://atelmore.bothost.tech/health → `"site":"dvin-v3"`, `"build":"dvin-v3-bothost-fix"`
- Главная: заголовок **DVIN**, Голубицкая (не «Ателье Элегант»)

Если на сайте всё ещё «Элегант» — на сервере **старый** `public/index.html`. Нужен push + передеплой.
