# Синхронизация данных между WebApp и Ботом

## Настройка синхронизации

### 1. Запуск API сервера для синхронизации

API сервер должен быть запущен и доступен для webapp. 

**Для локальной разработки:**
```bash
cd bot
python run_sync_api.py
```
Сервер запустится на `http://localhost:8000`

**Для продакшена:**
1. Разместите `sync_api.py` на вашем сервере (например, на Heroku, Railway, или другом хостинге)
2. Установите зависимости: `pip install fastapi uvicorn`
3. Запустите сервер: `uvicorn sync_api:app --host 0.0.0.0 --port 8000`
4. Обновите URL в `webapp/app.js`:
   ```javascript
   this.apiBaseUrl = 'https://your-api-server.com';
   ```

### 2. Настройка WebApp

В `webapp/app.js` обновите URL API сервера:
```javascript
this.apiBaseUrl = 'https://your-api-server.com'; // URL вашего API сервера
```

### 3. Как работает синхронизация

- **WebApp → Бот**: WebApp отправляет данные на `/sync` endpoint
- **Бот → WebApp**: Бот может получать данные через `/sync/{userId}` endpoint
- Данные объединяются: новые задачи добавляются, статистика берет максимальные значения

### 4. Получение userId

WebApp автоматически получает `userId` из Max Web App SDK (`window.MaxWebApp`). 
Если SDK недоступен, данные хранятся только локально в localStorage.

### 5. Структура данных

Синхронизируются:
- `settings` - настройки пользователя
- `tasks` - список задач
- `stats` - статистика (сессии, уровень, достижения)

