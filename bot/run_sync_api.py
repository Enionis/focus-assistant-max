"""
Запуск API сервера для синхронизации данных между webapp и ботом
"""
import os
import uvicorn
from sync_api import app

if __name__ == "__main__":
    port = int(os.getenv("SYNC_API_PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)

