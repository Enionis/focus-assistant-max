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

app = FastAPI(title="Focus Assistant API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("WEBAPP_ORIGIN", "*")], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {"ok": True, "service": "focus-assistant-api"}

@app.get("/lm/health")
async def lm_health():
    """
    Проверка доступности LM Studio через совместимый OpenAI эндпоинт.
    Требует переменной окружения LM_BASE_URL (например https://xxx.trycloudflare.com/v1)
    """
    base_url = os.getenv("LM_BASE_URL", "").rstrip("/")
    model = os.getenv("LM_MODEL", "")
    if not base_url:
        return {"ok": False, "error": "LM_BASE_URL is empty"}
    url = f"{base_url}/models"
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(12.0)) as client:
            r = await client.get(url)
            data = r.json()
        return {"ok": r.status_code == 200, "status": r.status_code, "base_url": base_url, "wanted_model": model, "models": data}
    except Exception as e:
        return {"ok": False, "base_url": base_url, "error": str(e)}

>>>>>>> 3738b44c3f1edb30cac1cd1630769737c254ecf6
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

<<<<<<< HEAD
=======
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
    system = (
        "Ты ассистент по продуктивности. Разбей большую задачу на 3–7 подзадач. "
        "Для каждой подзадачи добавь целое число estimatedPomodoros (25-мин сессии). "
        "Верни строго JSON без комментариев и лишнего текста: "
        '{"subTasks":[{"title":"...", "estimatedPomodoros":2}, ...]}'
    )
    user = f"Задача: {desc}\nДедлайн: {deadline or 'не указан'}\nВерни только JSON."
    return [{"role": "system", "content": system}, {"role": "user", "content": user}]

async def _call_lm(messages: list[Dict[str, str]]) -> Dict[str, Any]:
    base_url = os.getenv("LM_BASE_URL", "http://127.0.0.1:1234/v1").rstrip("/")
    model = os.getenv("LM_MODEL", "Qwen3-VL-4B-Instruct-Q4_K_M")
    api_key = os.getenv("LM_API_KEY", "")

    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    payload = {
        "model": model,
        "messages": messages,
        "temperature": 0.2,
        "max_tokens": 800,
    }

    timeout = httpx.Timeout(45.0, connect=10.0)
    url = f"{base_url}/chat/completions"
    async with httpx.AsyncClient(timeout=timeout) as client:
        r = await client.post(url, headers=headers, json=payload)
        r.raise_for_status()
        return r.json()

@app.post("/analyze_task", response_model=AnalyzeTaskResponse)
async def analyze_task(req: AnalyzeTaskRequest):
    try:
        raw = await _call_lm(_build_prompt(req.description, req.deadline))
        content = raw["choices"][0]["message"]["content"]

        try:
            data = json.loads(content)
        except json.JSONDecodeError:
            m = re.findall(r"\{[\s\S]*\}", content)
            data = None
            for cand in m:
                try:
                    data = json.loads(cand)
                    break
                except json.JSONDecodeError:
                    continue
            if data is None:
                raise

        sub_tasks: List[Dict[str, Any]] = []
        for st in data.get("subTasks", []):
            title = (st.get("title") or "").strip()
            est = int(st.get("estimatedPomodoros") or 1)
            est = max(1, min(est, 12))
            if title:
                sub_tasks.append({"title": title, "estimatedPomodoros": est})

        if not sub_tasks:
            sub_tasks = [
                {"title": "Подготовка", "estimatedPomodoros": 1},
                {"title": "Основная работа", "estimatedPomodoros": 3},
                {"title": "Завершение", "estimatedPomodoros": 1},
            ]

        total = sum(s["estimatedPomodoros"] for s in sub_tasks)
        return AnalyzeTaskResponse(success=True, subTasks=sub_tasks, totalPomodoros=total)
    except httpx.HTTPError as e:
        logger.exception("LM HTTP error")
        raise HTTPException(status_code=502, detail="Модель недоступна (LM_BASE_URL/туннель?)")
    except Exception as e:
        logger.exception("Analyze error")
        raise HTTPException(status_code=500, detail=f"Ошибка анализа задачи: {e}")
>>>>>>> 3738b44c3f1edb30cac1cd1630769737c254ecf6
