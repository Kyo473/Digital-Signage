# DS Studio — Digital Signage Platform

DS Studio — платформа для управления цифровыми экранами. Позволяет создавать плейлисты из фото, видео, веб-страниц и HTML-слайдов, управлять экранами через веб-интерфейс и воспроизводить контент в браузере или Android TV приложении.

## Возможности

- Управление экранами, плейлистами и медиафайлами
- Воспроизведение контента в web-плеере
- Android TV клиент для вывесок
- REST API для интеграций
- SQLite по умолчанию (простой запуск без внешней БД)

## Структура проекта

```text
backend/    Node.js (Express) + SQLite, REST API
frontend/   React SPA (админка + плеер)
apk/        Android TV приложение (WebView)
```

## Быстрый старт (Docker)

### 1. Подготовка окружения

```bash
cp .env.example .env
```

Рекомендуется заменить:

- `JWT_SECRET` — секрет подписи JWT
- `WEBHOOK_SECRET` — ключ подписи вебхуков
- `ADMIN_PASSWORD` — пароль администратора

Примеры генерации:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"  # JWT_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"     # WEBHOOK_SECRET
```

### 2. Запуск

```bash
docker compose up --build
```

После запуска:

- Админка: http://localhost:3000
- API: http://localhost:3001
- Swagger UI: http://localhost:3001/api/docs (если `SWAGGER_ENABLED=true`)

### 3. Данные

В Docker данные хранятся в именованных volume `db` и `uploads`, поэтому не теряются при пересборке контейнеров.

## Локальная разработка (без Docker)

```bash
./start-dev.sh
```

Или раздельно:

```bash
# Терминал 1
cd backend && npm install && node server.js

# Терминал 2
cd frontend && npm install && npm start
```

## Переменные окружения

| Переменная        | По умолчанию   | Описание |
|-------------------|----------------|----------|
| `PORT`            | `3001`         | Порт backend |
| `FRONTEND_PORT`   | `3000`         | Порт frontend |
| `JWT_SECRET`      | —              | Секрет подписи токенов (обязательно заменить в проде) |
| `JWT_EXPIRES`     | `30d`          | Срок жизни JWT |
| `ADMIN_PASSWORD`  | `admin`        | Пароль администратора при инициализации |
| `SWAGGER_ENABLED` | `false`        | Включение Swagger UI на `/api/docs` |
| `WEBHOOK_SECRET`  | —              | Глобальный HMAC-ключ вебхуков |
| `DB_PATH`         | `./signage.db` | Путь к SQLite базе |
| `UPLOADS_DIR`     | `./uploads`    | Каталог загруженных файлов |

## Android TV APK

Сборка:

```bash
cd apk
JAVA_HOME=/usr/lib/jvm/java-21-openjdk \
ANDROID_HOME=$HOME/Android/Sdk \
./gradlew assembleRelease
```

APK:

`apk/app/build/outputs/apk/release/app-release.apk`

Установка:

```bash
adb install apk/app/build/outputs/apk/release/app-release.apk
```

Первичная настройка в приложении:

- Server URL: `http://<IP_сервера>:3001`
- Screen ID: ID экрана из раздела «Экраны» в админке

Для Android Emulator:

- `http://<SERVER_HOST>:3001`

## Лицензия и условия использования

Проект распространяется под лицензией **GNU Affero General Public License v3.0 (AGPL-3.0)**. Полный текст: [LICENSE](./LICENSE).

Что это значит на практике:

- Можно использовать, запускать и модифицировать проект.
- При распространении изменённой версии нужно сохранять лицензию AGPL-3.0 и уведомления об авторских правах.
- Если вы предоставляете доступ к модифицированной версии по сети (SaaS/веб-сервис), вы обязаны предоставить пользователям исходный код этой модифицированной версии.
- Лицензия не предоставляет гарантий (as is).

Если вы встраиваете DS Studio в коммерческий сервис, заранее проверьте соответствие вашим юридическим требованиям AGPL-3.0.
