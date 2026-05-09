const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Digital Signage API',
      version: '1.0.0',
      description: 'REST API для управления Digital Signage системой',
    },
    servers: [{ url: '/api', description: 'API base path' }],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            username: { type: 'string' },
            role_id: { type: 'string' },
            role_name: { type: 'string' },
            created_at: { type: 'integer', description: 'Unix timestamp' },
          },
        },
        Role: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            permissions: { type: 'array', items: { type: 'string' } },
            is_system: { type: 'integer' },
            created_at: { type: 'integer' },
          },
        },
        Content: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            type: { type: 'string', enum: ['image', 'video', 'webpage', 'html', 'pdf'] },
            url: { type: 'string' },
            html: { type: 'string' },
            filename: { type: 'string' },
            duration: { type: 'integer' },
            page_duration: { type: 'integer' },
            scroll_behavior: { type: 'string', enum: ['none', 'smooth'] },
            scroll_speed: { type: 'integer' },
            scroll_duration: { type: 'integer' },
            muted: { type: 'integer' },
            created_at: { type: 'integer' },
          },
        },
        Playlist: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            created_at: { type: 'integer' },
          },
        },
        Screen: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            playlist_id: { type: 'string', nullable: true },
            scene_id: { type: 'string', nullable: true },
            command: { type: 'string', nullable: true },
            created_at: { type: 'integer' },
          },
        },
        Device: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            code: { type: 'string' },
            name: { type: 'string', nullable: true },
            screen_id: { type: 'string', nullable: true },
            group_id: { type: 'string', nullable: true },
            last_seen: { type: 'integer' },
            created_at: { type: 'integer' },
          },
        },
        Group: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            screen_id: { type: 'string', nullable: true },
            created_at: { type: 'integer' },
            members: { type: 'array', items: { $ref: '#/components/schemas/Device' } },
          },
        },
        Scene: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            width: { type: 'integer' },
            height: { type: 'integer' },
            duration: { type: 'number' },
            created_at: { type: 'integer' },
          },
        },
        Webhook: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            url: { type: 'string', format: 'uri' },
            secret: { type: 'string', nullable: true },
            events: {
              type: 'array',
              items: { type: 'string' },
              description: 'Список событий. Пустой массив — подписка на все события.',
            },
            enabled: { type: 'integer', enum: [0, 1] },
            created_at: { type: 'integer' },
          },
        },
      },
    },
    security: [{ BearerAuth: [] }],
    tags: [
      { name: 'auth', description: 'Аутентификация' },
      { name: 'users', description: 'Управление пользователями' },
      { name: 'roles', description: 'Управление ролями' },
      { name: 'content', description: 'Контент (изображения, видео, веб-страницы)' },
      { name: 'playlists', description: 'Плейлисты' },
      { name: 'screens', description: 'Экраны' },
      { name: 'devices', description: 'Устройства' },
      { name: 'groups', description: 'Группы устройств' },
      { name: 'scenes', description: 'Сцены' },
      { name: 'webhooks', description: 'Webhooks' },
    ],
    paths: {
      // ── Auth ──────────────────────────────────────────────────────────────────
      '/auth/login': {
        post: {
          tags: ['auth'],
          summary: 'Войти в систему',
          security: [],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['username', 'password'],
                  properties: {
                    username: { type: 'string' },
                    password: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Успешный вход',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      token: { type: 'string' },
                      user: { $ref: '#/components/schemas/User' },
                    },
                  },
                },
              },
            },
            401: { description: 'Неверный логин или пароль', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },
      '/auth/me': {
        get: {
          tags: ['auth'],
          summary: 'Получить текущего пользователя',
          responses: {
            200: { description: 'Текущий пользователь', content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } },
            401: { description: 'Не авторизован' },
          },
        },
      },
      // ── Roles ─────────────────────────────────────────────────────────────────
      '/roles': {
        get: {
          tags: ['roles'],
          summary: 'Список ролей',
          responses: { 200: { description: 'Список ролей', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Role' } } } } } },
        },
        post: {
          tags: ['roles'],
          summary: 'Создать роль',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, permissions: { type: 'array', items: { type: 'string' } } } } } } },
          responses: { 201: { description: 'Роль создана' }, 400: { description: 'Ошибка валидации' } },
        },
      },
      '/roles/{id}': {
        put: {
          tags: ['roles'],
          summary: 'Обновить роль',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { name: { type: 'string' }, permissions: { type: 'array', items: { type: 'string' } } } } } } },
          responses: { 200: { description: 'Роль обновлена' }, 404: { description: 'Не найдено' } },
        },
        delete: {
          tags: ['roles'],
          summary: 'Удалить роль',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Удалено' }, 400: { description: 'Нельзя удалить' }, 404: { description: 'Не найдено' } },
        },
      },
      // ── Users ─────────────────────────────────────────────────────────────────
      '/users': {
        get: {
          tags: ['users'],
          summary: 'Список пользователей',
          responses: { 200: { description: 'Список пользователей', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/User' } } } } } },
        },
        post: {
          tags: ['users'],
          summary: 'Создать пользователя',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['username', 'password', 'role_id'], properties: { username: { type: 'string' }, password: { type: 'string' }, role_id: { type: 'string' } } } } } },
          responses: { 201: { description: 'Пользователь создан' }, 400: { description: 'Ошибка' } },
        },
      },
      '/users/{id}': {
        put: {
          tags: ['users'],
          summary: 'Обновить пользователя',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { username: { type: 'string' }, password: { type: 'string' }, role_id: { type: 'string' } } } } } },
          responses: { 200: { description: 'Обновлено' }, 404: { description: 'Не найдено' } },
        },
        delete: {
          tags: ['users'],
          summary: 'Удалить пользователя',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Удалено' }, 400: { description: 'Нельзя удалить' }, 404: { description: 'Не найдено' } },
        },
      },
      '/users/export': {
        get: {
          tags: ['users'],
          summary: 'Экспорт пользователей',
          parameters: [{ name: 'format', in: 'query', schema: { type: 'string', enum: ['json', 'csv', 'tsv'], default: 'json' } }],
          responses: { 200: { description: 'Файл экспорта' } },
        },
      },
      '/users/import': {
        post: {
          tags: ['users'],
          summary: 'Импорт пользователей',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { users: { type: 'array' }, on_conflict: { type: 'string', enum: ['skip', 'update'] } } } } } },
          responses: { 200: { description: 'Результат импорта' } },
        },
      },
      // ── Content ───────────────────────────────────────────────────────────────
      '/content': {
        get: {
          tags: ['content'],
          summary: 'Список контента',
          responses: { 200: { description: 'Список', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Content' } } } } } },
        },
      },
      '/content/upload': {
        post: {
          tags: ['content'],
          summary: 'Загрузить файл',
          requestBody: { required: true, content: { 'multipart/form-data': { schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' }, name: { type: 'string' }, duration: { type: 'integer' } } } } } },
          responses: { 201: { description: 'Файл загружен' }, 400: { description: 'Ошибка' } },
        },
      },
      '/content/webpage': {
        post: {
          tags: ['content'],
          summary: 'Добавить веб-страницу',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name', 'url'], properties: { name: { type: 'string' }, url: { type: 'string' }, scroll_behavior: { type: 'string' }, scroll_speed: { type: 'integer' } } } } } },
          responses: { 201: { description: 'Создано' }, 400: { description: 'Ошибка' } },
        },
      },
      '/content/html': {
        post: {
          tags: ['content'],
          summary: 'Добавить HTML-контент',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name', 'html'], properties: { name: { type: 'string' }, html: { type: 'string' } } } } } },
          responses: { 201: { description: 'Создано' }, 400: { description: 'Ошибка' } },
        },
      },
      '/content/{id}': {
        put: {
          tags: ['content'],
          summary: 'Обновить контент',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Content' } } } },
          responses: { 200: { description: 'Обновлено' }, 404: { description: 'Не найдено' } },
        },
        delete: {
          tags: ['content'],
          summary: 'Удалить контент',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Удалено' }, 404: { description: 'Не найдено' } },
        },
      },
      // ── Playlists ─────────────────────────────────────────────────────────────
      '/playlists': {
        get: {
          tags: ['playlists'],
          summary: 'Список плейлистов',
          responses: { 200: { description: 'Список', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Playlist' } } } } } },
        },
        post: {
          tags: ['playlists'],
          summary: 'Создать плейлист',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name'], properties: { name: { type: 'string' } } } } } },
          responses: { 201: { description: 'Создан' }, 400: { description: 'Ошибка' } },
        },
      },
      '/playlists/{id}': {
        get: {
          tags: ['playlists'],
          summary: 'Получить плейлист с элементами',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Плейлист с элементами' }, 404: { description: 'Не найдено' } },
        },
        put: {
          tags: ['playlists'],
          summary: 'Обновить плейлист',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { name: { type: 'string' } } } } } },
          responses: { 200: { description: 'Обновлено' }, 404: { description: 'Не найдено' } },
        },
        delete: {
          tags: ['playlists'],
          summary: 'Удалить плейлист',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Удалено' }, 404: { description: 'Не найдено' } },
        },
      },
      // ── Screens ───────────────────────────────────────────────────────────────
      '/screens': {
        get: {
          tags: ['screens'],
          summary: 'Список экранов',
          responses: { 200: { description: 'Список', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Screen' } } } } } },
        },
        post: {
          tags: ['screens'],
          summary: 'Создать экран',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name'], properties: { name: { type: 'string' } } } } } },
          responses: { 201: { description: 'Создан' }, 400: { description: 'Ошибка' } },
        },
      },
      '/screens/{id}': {
        put: {
          tags: ['screens'],
          summary: 'Обновить экран',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { name: { type: 'string' }, playlist_id: { type: 'string', nullable: true }, scene_id: { type: 'string', nullable: true } } } } } },
          responses: { 200: { description: 'Обновлено' }, 404: { description: 'Не найдено' } },
        },
        delete: {
          tags: ['screens'],
          summary: 'Удалить экран',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Удалено' }, 404: { description: 'Не найдено' } },
        },
      },
      // ── Devices ───────────────────────────────────────────────────────────────
      '/devices': {
        get: {
          tags: ['devices'],
          summary: 'Список устройств',
          responses: { 200: { description: 'Список', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Device' } } } } } },
        },
      },
      '/devices/register': {
        post: {
          tags: ['devices'],
          summary: 'Регистрация устройства (heartbeat)',
          security: [],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['code'], properties: { code: { type: 'string' }, name: { type: 'string' } } } } } },
          responses: { 200: { description: 'device_id и screen_id' } },
        },
      },
      '/devices/{id}': {
        put: {
          tags: ['devices'],
          summary: 'Обновить устройство',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { screen_id: { type: 'string', nullable: true }, name: { type: 'string' } } } } } },
          responses: { 200: { description: 'Обновлено' } },
        },
        delete: {
          tags: ['devices'],
          summary: 'Удалить устройство',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Удалено' } },
        },
      },
      // ── Groups ────────────────────────────────────────────────────────────────
      '/groups': {
        get: {
          tags: ['groups'],
          summary: 'Список групп устройств',
          responses: { 200: { description: 'Список', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Group' } } } } } },
        },
        post: {
          tags: ['groups'],
          summary: 'Создать группу',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name'], properties: { name: { type: 'string' } } } } } },
          responses: { 201: { description: 'Создана' }, 400: { description: 'Ошибка' } },
        },
      },
      '/groups/{id}': {
        put: {
          tags: ['groups'],
          summary: 'Обновить группу',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { name: { type: 'string' }, screen_id: { type: 'string', nullable: true } } } } } },
          responses: { 200: { description: 'Обновлено' }, 404: { description: 'Не найдено' } },
        },
        delete: {
          tags: ['groups'],
          summary: 'Удалить группу',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Удалено' }, 404: { description: 'Не найдено' } },
        },
      },
      // ── Scenes ────────────────────────────────────────────────────────────────
      '/scenes': {
        get: {
          tags: ['scenes'],
          summary: 'Список сцен',
          responses: { 200: { description: 'Список', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Scene' } } } } } },
        },
        post: {
          tags: ['scenes'],
          summary: 'Создать сцену',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, width: { type: 'integer' }, height: { type: 'integer' } } } } } },
          responses: { 201: { description: 'Создана' }, 400: { description: 'Ошибка' } },
        },
      },
      '/scenes/{id}': {
        get: {
          tags: ['scenes'],
          summary: 'Получить сцену с объектами',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Сцена с объектами' }, 404: { description: 'Не найдено' } },
        },
        put: {
          tags: ['scenes'],
          summary: 'Обновить сцену',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { name: { type: 'string' }, width: { type: 'integer' }, height: { type: 'integer' }, duration: { type: 'number' } } } } } },
          responses: { 200: { description: 'Обновлено' }, 404: { description: 'Не найдено' } },
        },
        delete: {
          tags: ['scenes'],
          summary: 'Удалить сцену',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Удалено' }, 404: { description: 'Не найдено' } },
        },
      },
      // ── Webhooks ──────────────────────────────────────────────────────────────
      '/webhooks': {
        get: {
          tags: ['webhooks'],
          summary: 'Список вебхуков',
          responses: { 200: { description: 'Список', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Webhook' } } } } } },
        },
        post: {
          tags: ['webhooks'],
          summary: 'Создать вебхук',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name', 'url'],
                  properties: {
                    name: { type: 'string' },
                    url: { type: 'string', format: 'uri' },
                    secret: { type: 'string' },
                    events: { type: 'array', items: { type: 'string' } },
                    enabled: { type: 'integer', enum: [0, 1] },
                  },
                },
              },
            },
          },
          responses: { 201: { description: 'Создан' }, 400: { description: 'Ошибка' } },
        },
      },
      '/webhooks/{id}': {
        put: {
          tags: ['webhooks'],
          summary: 'Обновить вебхук',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    url: { type: 'string', format: 'uri' },
                    secret: { type: 'string' },
                    events: { type: 'array', items: { type: 'string' } },
                    enabled: { type: 'integer', enum: [0, 1] },
                  },
                },
              },
            },
          },
          responses: { 200: { description: 'Обновлено' }, 404: { description: 'Не найдено' } },
        },
        delete: {
          tags: ['webhooks'],
          summary: 'Удалить вебхук',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Удалено' }, 404: { description: 'Не найдено' } },
        },
      },
      '/webhooks/{id}/test': {
        post: {
          tags: ['webhooks'],
          summary: 'Отправить тестовый запрос на вебхук',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            200: { description: 'Тест успешен' },
            404: { description: 'Не найдено' },
            502: { description: 'Ошибка доставки' },
          },
        },
      },
    },
  },
  apis: [], // paths defined inline above
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = { swaggerSpec };
