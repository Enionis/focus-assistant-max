"""
API эндпоинты для синхронизации данных между webapp и ботом + вызов локальной LLM через LM Studio
"""
import os
import re
import json
import logging
from typing import Optional, List, Dict, Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import httpx

from maxapi.context import MemoryContext  # оставляем, если понадобится в будущем

logger = logging.getLogger(__name__)
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))

# === Память для "синхронизации" webapp <-> бот (как было у вас) ===
sync_storage: Dict[int, Dict[str, Any]] = {}

app = FastAPI()

# === CORS для вашего фронта на GitHub Pages ===
app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("WEBAPP_ORIGIN", "*")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------
# МОДЕЛИ ДАННЫХ ДЛЯ /sync (как было)
# -----------------------------
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

@app.get("/sync/{userId}", response_model=SyncResponse)
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


# -----------------------------
# НОВОЕ: /analyze_task через LM Studio (OpenAI-совместимый сервер)
# -----------------------------
class AnalyzeTaskRequest(BaseModel):
    userId: int
    description: str = Field(..., description="Текст задачи")
    deadline: Optional[str] = None

class SubTask(BaseModel):
    title: str
    estimatedPomodoros: int = Field(..., ge=1)

class AnalyzeTaskResponse(BaseModel):
    success: bool
    subTasks: List[SubTask]
    totalPomodoros: int
    message: Optional[str] = None

def _build_prompt(desc: str, deadline: Optional[str]) -> list[Dict[str, str]]:
    """
    Готовим строгий промпт, чтобы модель вернула JSON нужного формата.
    """
    system = (
        "Ты ассистент по продуктивности. Разбей большую задачу на 3–7 подзадач. "
        "Для каждой подзадачи добавь целое число estimatedPomodoros (25-мин сессии). "
        "Верни строго JSON без комментариев и лишнего текста: "
        '{"subTasks":[{"title":"...", "estimatedPomodoros":2}, ...]}'
    )
    user = f"Задача: {desc}\nДедлайн: {deadline or 'не указан'}\nВерни только JSON."
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]

async def _call_lm(messages: list[Dict[str, str]]) -> Dict[str, Any]:
    """
    Вызов LM Studio (OpenAI-совместимый /v1/chat/completions)
    """
    base_url = os.getenv("LM_BASE_URL", "http://127.0.0.1:1234/v1")
    model = os.getenv("LM_MODEL", "Qwen3-VL-4B-Instruct-Q4_K_M")
    api_key = os.getenv("LM_API_KEY", "")

    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    payload = {
        "model": model,
        "messages": messages,
        "temperature": 0.2,
        # Если сервер не поддерживает строгий response_format — положимся на промпт и мягкий парсер:
        "max_tokens": 800,
    }

    timeout = httpx.Timeout(45.0, connect=10.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        r = await client.post(f"{base_url}/chat/completions", headers=headers, json=payload)
        r.raise_for_status()
        return r.json()

@app.post("/analyze_task", response_model=AnalyzeTaskResponse)
async def analyze_task(req: AnalyzeTaskRequest):
    """
    Декомпозиция задачи через локальную LLM
    """
    try:
        raw = await _call_lm(_build_prompt(req.description, req.deadline))
        content = raw["choices"][0]["message"]["content"]

        # Пытаемся распарсить JSON; если пришло с ограждением ```json, вытащим тело
        try:
            data = json.loads(content)
        except json.JSONDecodeError:
            candidates = re.findall(r"\{[\s\S]*\}", content)
            data = None
            for cand in candidates:
                try:
                    data = json.loads(cand)
                    break
                except json.JSONDecodeError:
                    continue
            if data is None:
                raise

        # Валидация/нормализация
        sub_tasks = []
        for st in data.get("subTasks", []):
            title = (st.get("title") or "").strip()
            est = int(st.get("estimatedPomodoros") or 1)
            est = max(1, min(est, 12))
            if title:
                sub_tasks.append({"title": title, "estimatedPomodoros": est})

        if not sub_tasks:
            # Фолбэк — базовый план
            sub_tasks = [
                {"title": "Подготовка", "estimatedPomodoros": 1},
                {"title": "Основная работа", "estimatedPomodoros": 3},
                {"title": "Завершение", "estimatedPomodoros": 1},
            ]

        total = sum(s["estimatedPomodoros"] for s in sub_tasks)
        return AnalyzeTaskResponse(success=True, subTasks=sub_tasks, totalPomodoros=total)

    except httpx.HTTPError as e:
        logger.exception("LM HTTP error")
        raise HTTPException(status_code=502, detail="Модель недоступна")
    except Exception as e:
        logger.exception("Analyze error")
        raise HTTPException(status_code=500, detail="Ошибка анализа задачи")