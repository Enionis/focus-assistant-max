"""
API эндпоинты для синхронизации данных между webapp и ботом
"""
import logging
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from maxapi.context import MemoryContext

logger = logging.getLogger(__name__)

sync_storage: Dict[int, Dict[str, Any]] = {}

app = FastAPI()

class SyncData(BaseModel):
    userId: int
    settings: Optional[Dict[str, Any]] = None
    tasks: Optional[List[Dict[str, Any]]] = None
    stats: Optional[Dict[str, Any]] = None

class SyncResponse(BaseModel):
    success: bool
    settings: Optional[Dict[str, Any]] = None
    tasks: Optional[List[Dict[str, Any]]] = None
    stats: Optional[Dict[str, Any]] = None
    message: Optional[str] = None

@app.post("/sync", response_model=SyncResponse)
async def sync_data(data: SyncData):
    """
    Синхронизация данных между webapp и ботом
    """
    try:
        userId = data.userId
        
        current_data = sync_storage.get(userId, {})
        
        if data.settings is not None:
            current_data["settings"] = {**current_data.get("settings", {}), **data.settings}
        
        if data.tasks is not None:
            existing_tasks = {task.get("id"): task for task in current_data.get("tasks", [])}
            for task in data.tasks:
                task_id = task.get("id")
                if task_id and task_id in existing_tasks:
                    existing_tasks[task_id].update(task)
                else:
                    existing_tasks[task_id] = task
            current_data["tasks"] = list(existing_tasks.values())
        
        if data.stats is not None:
            existing_stats = current_data.get("stats", {})
            for key, value in data.stats.items():
                if key in existing_stats:
                    if isinstance(value, (int, float)) and isinstance(existing_stats[key], (int, float)):
                        existing_stats[key] = max(existing_stats[key], value)
                    else:
                        existing_stats[key] = value
                else:
                    existing_stats[key] = value
            current_data["stats"] = existing_stats
        
        sync_storage[userId] = current_data
        
        logger.info(f"Данные синхронизированы для пользователя {userId}")
        
        return SyncResponse(
            success=True,
            settings=current_data.get("settings"),
            tasks=current_data.get("tasks"),
            stats=current_data.get("stats"),
            message="Данные успешно синхронизированы"
        )
    except Exception as e:
        logger.error(f"Ошибка синхронизации данных: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Ошибка синхронизации: {str(e)}")

@app.get("/sync/{userId}")
async def get_sync_data(userId: int):
    """
    Получить синхронизированные данные пользователя
    """
    try:
        user_data = sync_storage.get(userId, {})
        return SyncResponse(
            success=True,
            settings=user_data.get("settings"),
            tasks=user_data.get("tasks"),
            stats=user_data.get("stats"),
            message="Данные получены"
        )
    except Exception as e:
        logger.error(f"Ошибка получения данных: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Ошибка получения данных: {str(e)}")

