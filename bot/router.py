import logging
import os
import asyncio
import json
import aiohttp
from datetime import datetime
from pathlib import Path
from maxapi import F, Router
from maxapi.types import MessageCreated, Command, MessageCallback
from maxapi.context import MemoryContext
from maxapi.utils.inline_keyboard import InlineKeyboardBuilder
from maxapi.types import LinkButton
from maxapi.context import State, StatesGroup
from maxapi.types.input_media import InputMedia
from maxapi.types.errors import Error
from states import UserStates

logger = logging.getLogger(__name__)

async def send_event_message(
    event,
    text: str | None = None,
    *,
    attachments=None,
    link=None,
    notify=None,
    parse_mode=None,
):
    """Отправка сообщения через событие"""
    chat_id = None
    user_id = None

    get_ids = getattr(event, "get_ids", None)
    if callable(get_ids):
        chat_id, user_id = get_ids()

    message = getattr(event, "message", None)
    if message is not None:
        if chat_id is None:
            chat_id = getattr(message.recipient, "chat_id", None)
        if user_id is None:
            user_id = getattr(message.sender, "user_id", None)

    if chat_id is None and user_id is None:
        logger.warning("Не удалось определить chat_id/user_id для отправки сообщения")
        return None

    attachments_list = None
    if attachments:
        if not isinstance(attachments, (list, tuple)):
            attachments_list = [attachments]
        else:
            attachments_list = list(attachments)

    response = await event.bot.send_message(
        chat_id=chat_id,
        user_id=user_id,
        text=text,
        attachments=attachments_list,
        link=link,
        notify=notify,
        parse_mode=parse_mode,
    )

    if isinstance(response, Error):
        raw_code = response.raw.get("code") if isinstance(response.raw, dict) else None
        if raw_code == "chat.denied" or response.code == 403:
            logger.info(
                "Диалог приостановлен, сообщение не отправлено (chat.denied). user_id=%s chat_id=%s",
                user_id,
                chat_id,
            )
        else:
            logger.warning(
                "MAX API вернул ошибку при отправке сообщения: %s", response.raw
            )

    return response

class UserData:
    def __init__(self):
        self.tasks = []
        self.total_sessions = 0
        self.level = 1
        self.joined_date = datetime.now().isoformat()

router = Router()
BASE_DIR = Path(__file__).resolve().parent

SAMPLE_PLANS = {
    "exam": [
        "Собрать материалы",
        "Написать план",
        "Изучить теорию",
        "Практика",
        "Итоги"
    ],
    "report": [
        "Исследовать тему",
        "Собрать данные",
        "Написать черновик",
        "Редактировать",
        "Финализировать"
    ]
}

_scheduler = None

def set_scheduler(scheduler_instance):
    """Установить экземпляр планировщика"""
    global _scheduler
    _scheduler = scheduler_instance

@router.message_callback(F.callback.payload == "quick_start")
async def quick_start_handler(event: MessageCallback, context: MemoryContext):
    """Обработчик быстрой кнопки /start"""
    from maxapi.types import MessageCreated
    chat_id = None
    user_id = None
    try:
        if hasattr(event, 'chat') and hasattr(event.chat, 'chat_id'):
            chat_id = event.chat.chat_id
        if hasattr(event, 'message') and hasattr(event.message, 'recipient'):
            recipient = event.message.recipient
            if hasattr(recipient, 'chat_id'):
                chat_id = recipient.chat_id
        if hasattr(event, 'message') and hasattr(event.message, 'sender'):
            sender = event.message.sender
            if hasattr(sender, 'user_id'):
                user_id = sender.user_id
    except:
        pass
    
    if _scheduler and chat_id:
        _scheduler.add_user(chat_id, context)
    
    user_data = await context.get_data()
    if not user_data:
        user_data = {
            "tasks": [],
            "total_sessions": 0,
            "level": 1,
            "joined_date": datetime.now().isoformat()
        }
        await context.set_data(user_data)
    
    if _scheduler and chat_id:
        _scheduler.update_user_data(chat_id, user_data)
    
    builder = InlineKeyboardBuilder()
    webapp_url = "https://max.ru/t122_hakaton_bot?startapp"
    try:
        builder.row(
            LinkButton(text="📱 Открыть приложение", url=webapp_url)
        )
    except:
        builder.row(
            {"text": "📱 Открыть приложение", "url": webapp_url}
        )
    builder.row(
        {"text": "ℹ️ Как работает", "payload": "how_it_works"}
    )
    builder.row(
        {"text": "🤖 Умный помощник", "payload": "ai_assistant"}
    )

    welcome_text = """📱 Открой веб-приложение для удобной работы с задачами!

Я помогу:
• Разбить большие задачи на шаги
• Фокусироваться с Pomodoro
• Отслеживать прогресс и мотивацию

"""

    await send_event_message(
        event, 
        text=welcome_text, 
        attachments=[builder.as_markup()]
    )

# Обработчик AI помощника должен быть зарегистрирован раньше команд
@router.message_created(UserStates.waiting_ai_question)
async def handle_ai_question(event: MessageCreated, context: MemoryContext):
    """Обработка вопросов пользователя к AI"""
    try:
        logger.info("Обработчик AI вопроса вызван")
        
        # Проверяем текущее состояние
        current_state = await context.get_state()
        logger.info(f"Текущее состояние: {current_state}")
        
        # Получаем текст сообщения - в maxapi текст находится в event.message.body.text
        question = None
        
        if hasattr(event, 'message') and event.message:
            if hasattr(event.message, 'body') and event.message.body:
                # body - это объект MessageBody, у которого есть атрибут text
                if hasattr(event.message.body, 'text'):
                    question = event.message.body.text
                    logger.info(f"Текст сообщения: {question}")
        
        # Если не нашли, пробуем альтернативные способы
        if not question:
            if hasattr(event, 'message') and hasattr(event.message, 'text'):
                question = event.message.text
                logger.info(f"Текст из event.message.text: {question}")
        
        logger.info(f"Итоговый текст сообщения: {question}")
        
        # Проверяем, что это не команда
        if question and question.startswith('/'):
            logger.info("Пропущена команда в режиме AI")
            return
        
        if not question or not question.strip():
            logger.warning("Получено пустое сообщение в режиме AI")
            builder = InlineKeyboardBuilder()
            builder.row({"text": "◀️ Выйти из чата", "payload": "back_to_main"})
            await send_event_message(event, "Пожалуйста, задайте вопрос текстом.", attachments=[builder.as_markup()])
            return
        
        logger.info(f"Обработка вопроса к AI: {question[:50]}...")
        
        # Отправляем сообщение о том, что обрабатываем запрос
        builder = InlineKeyboardBuilder()
        builder.row({"text": "◀️ Выйти из чата", "payload": "back_to_main"})
        
        await send_event_message(
            event,
            "🤔 Думаю...",
            attachments=[builder.as_markup()]
        )
        
        # Получаем ответ от AI
        answer = await ask_openrouter(question)
        logger.info(f"Получен ответ от AI (длина: {len(answer)})")
        
        # Отправляем ответ
        builder = InlineKeyboardBuilder()
        builder.row({"text": "◀️ Выйти из чата", "payload": "back_to_main"})
        
        await send_event_message(
            event,
            answer,
            attachments=[builder.as_markup()]
        )
    except Exception as e:
        logger.error(f"Ошибка в обработчике AI вопроса: {e}", exc_info=True)
        builder = InlineKeyboardBuilder()
        builder.row({"text": "◀️ Выйти из чата", "payload": "back_to_main"})
        await send_event_message(
            event,
            f"❌ Произошла ошибка при обработке вопроса: {str(e)}",
            attachments=[builder.as_markup()]
        )

@router.message_created(Command("start"))
async def start_command(event: MessageCreated, context: MemoryContext):
    chat_id = None
    try:
        if not hasattr(start_command, '_debugged'):
            logger.info(f"Доступные атрибуты event: {[attr for attr in dir(event) if not attr.startswith('_')]}")
            if hasattr(event, 'chat'):
                logger.info(f"event.chat = {event.chat} (тип: {type(event.chat)})")
                if hasattr(event.chat, 'id'):
                    logger.info(f"event.chat.id = {event.chat.id}")
            if hasattr(event, 'from_user'):
                logger.info(f"event.from_user = {event.from_user} (тип: {type(event.from_user)})")
                if hasattr(event.from_user, 'id'):
                    logger.info(f"event.from_user.id = {event.from_user.id}")
            if hasattr(event, 'message'):
                logger.info(f"Доступные атрибуты event.message: {[attr for attr in dir(event.message) if not attr.startswith('_')]}")
                if hasattr(event.message, 'recipient'):
                    logger.info(f"event.message.recipient = {event.message.recipient} (тип: {type(event.message.recipient)})")
                if hasattr(event.message, 'sender'):
                    logger.info(f"event.message.sender = {event.message.sender} (тип: {type(event.message.sender)})")
            start_command._debugged = True
        
        if hasattr(event, 'chat') and hasattr(event.chat, 'chat_id'):
            chat_id = event.chat.chat_id
            logger.debug(f"Получен chat_id из event.chat.chat_id: {chat_id}")
        
        if not chat_id and hasattr(event, 'message') and hasattr(event.message, 'recipient'):
            recipient = event.message.recipient
            if hasattr(recipient, 'chat_id'):
                chat_id = recipient.chat_id
                logger.debug(f"Получен chat_id из event.message.recipient.chat_id: {chat_id}")
        
        if not chat_id and hasattr(event, 'chat') and hasattr(event.chat, 'id'):
            chat_id = event.chat.id
            logger.debug(f"Получен chat_id из event.chat.id: {chat_id}")
        
    except Exception as e:
        logger.warning(f"Ошибка получения chat_id: {e}", exc_info=True)
    
    logger.info(f"Получена команда /start от пользователя {chat_id} (тип события: {type(event)})")
    try:
        if _scheduler and chat_id:
            _scheduler.add_user(chat_id, context)
        
        user_data = await context.get_data()
        if not user_data:
            logger.info("Инициализация данных нового пользователя")
            user_data = {
                "tasks": [],
                "total_sessions": 0,
                "level": 1,
                "joined_date": datetime.now().isoformat()
            }
            await context.set_data(user_data)
        
        if _scheduler and chat_id:
            _scheduler.update_user_data(chat_id, user_data)
        
        builder = InlineKeyboardBuilder()
        logger.info("Создание кнопок клавиатуры")
        
        webapp_url = "https://max.ru/t122_hakaton_bot?startapp"
        try:
            builder.row(
                LinkButton(text="📱 Открыть приложение", url=webapp_url)
            )
            logger.info(f"Кнопка 'Открыть приложение' добавлена (LinkButton с {webapp_url})")
        except Exception as e:
            logger.warning(f"Не удалось создать LinkButton: {e}, используем dict формат")
            builder.row(
                {"text": "📱 Открыть приложение", "url": webapp_url}
            )
            logger.info(f"Кнопка 'Открыть приложение' добавлена (dict с {webapp_url})")
        
        builder.row(
            {"text": "ℹ️ Как работает", "payload": "how_it_works"}
        )
        logger.info("Кнопка 'Как работает' добавлена")
        builder.row(
            {"text": "🤖 Умный помощник", "payload": "ai_assistant"}
        )
        logger.info("Кнопка 'Умный помощник' добавлена")

        welcome_text = """📱 Открой веб-приложение для удобной работы с задачами!

Я помогу:
• Разбить большие задачи на шаги
• Фокусироваться с Pomodoro
• Отслеживать прогресс и мотивацию"""

        logger.info("Отправка приветственного сообщения")
        markup = builder.as_markup()
        logger.info(f"Созданная клавиатура: {markup}, тип: {type(markup)}")
        await send_event_message(
            event, 
            text=welcome_text, 
            attachments=[markup]
        )
        logger.info("Приветственное сообщение отправлено успешно")
    except Exception as e:
        logger.error(f"Ошибка в обработчике /start: {e}", exc_info=True)

@router.message_created(Command("help"))
async def help_command(event: MessageCreated, context: MemoryContext):
    """Показать меню со всеми командами"""
    help_text = """📋 Меню команд FocusHelper:

/start - Начать работу с ботом
/help или /menu - Показать это меню
/test_reminder - Тест утреннего напоминания

📱 Используй кнопки в сообщениях для быстрого доступа к функциям!"""
    
    builder = InlineKeyboardBuilder()
    webapp_url = "https://max.ru/t122_hakaton_bot?startapp"
    try:
        builder.row(
            LinkButton(text="📱 Открыть приложение", url=webapp_url)
        )
    except:
        builder.row(
            {"text": "📱 Открыть приложение", "url": webapp_url}
        )
    builder.row(
        {"text": "ℹ️ Как работает", "payload": "how_it_works"}
    )
    builder.row(
        {"text": "🤖 Умный помощник", "payload": "ai_assistant"}
    )
    
    await send_event_message(event, text=help_text, attachments=[builder.as_markup()])

@router.message_created(Command("menu"))
async def menu_command(event: MessageCreated, context: MemoryContext):
    await help_command(event, context)

@router.message_created(Command("test_reminder"))
async def test_reminder_command(event: MessageCreated, context: MemoryContext):
    """Тестовая команда для проверки утреннего напоминания"""
    chat_id = None
    try:
        if hasattr(event, 'chat') and hasattr(event.chat, 'chat_id'):
            chat_id = event.chat.chat_id
        if not chat_id and hasattr(event, 'message') and hasattr(event.message, 'recipient'):
            recipient = event.message.recipient
            if hasattr(recipient, 'chat_id'):
                chat_id = recipient.chat_id
        if not chat_id and hasattr(event, 'chat') and hasattr(event.chat, 'id'):
            chat_id = event.chat.id
    except Exception as e:
        logger.warning(f"Ошибка получения chat_id: {e}")
    
    if chat_id and _scheduler:
        if context:
            _scheduler.add_user(chat_id, context)
            try:
                user_data = await context.get_data() or {}
                _scheduler.update_user_data(chat_id, user_data)
            except Exception as e:
                logger.warning(f"Не удалось обновить данные пользователя: {e}")
        
        await _scheduler.send_morning_reminder(chat_id)
        await send_event_message(
            event,
            "✅ Тестовое утреннее напоминание отправлено!"
        )
    else:
        await send_event_message(
            event,
            "❌ Не удалось отправить тестовое напоминание. Проверьте логи."
        )

@router.message_callback(F.callback.payload == "create_task")
async def create_task_start(event: MessageCallback, context: MemoryContext):
    await context.set_state(UserStates.waiting_task_description)
    builder = InlineKeyboardBuilder()
    builder.row({"text": "❌ Отмена", "payload": "back_to_main"})
    
    await send_event_message(
        event,
        "Опиши свою задачу одним сообщением.\n\n"
        "Например: 'Подготовиться к экзамену по экономике'",
        attachments=[builder.as_markup()]
    )

@router.message_created(UserStates.waiting_task_description)
async def handle_task_description(event: MessageCreated, context: MemoryContext):
    task_desc = event.message.text
    await context.set_data({"current_task": {"description": task_desc}})
    await context.set_state(UserStates.waiting_deadline)
    
    builder = InlineKeyboardBuilder()
    builder.row(
        {"text": "📅 Указать дедлайн", "payload": "set_deadline"},
        {"text": "➡️ Продолжить без", "payload": "no_deadline"}
    )
    builder.row({"text": "❌ Отмена", "payload": "back_to_main"})
    
    await send_event_message(
        event,
        f"Задача: {task_desc}\n\n"
        f"Хочешь указать дедлайн? (опционально)",
        attachments=[builder.as_markup()]
    )

@router.message_callback(F.callback.payload == "set_deadline")
async def set_deadline(event: MessageCallback, context: MemoryContext):
    await context.set_state(UserStates.waiting_deadline)
    await send_event_message(
        event,
        "Укажи дедлайн (например: 'через неделю' или '15 декабря')",
        attachments=None
    )

@router.message_created(UserStates.waiting_deadline)
async def handle_deadline(event: MessageCreated, context: MemoryContext):
    deadline = event.message.text
    user_data = await context.get_data()
    current_task = user_data.get("current_task", {})
    current_task["deadline"] = deadline
    
    plan_steps = SAMPLE_PLANS.get("exam", ["Шаг 1", "Шаг 2", "Шаг 3"])
    current_task["subtasks"] = [{"title": step, "pomodoros": 2} for step in plan_steps]
    
    await context.set_data({"current_task": current_task})
    await context.set_state(None)
    
    builder = InlineKeyboardBuilder()
    for i, step in enumerate(plan_steps):
        builder.row({"text": f"{i+1}. {step}", "payload": f"view_step_{i}"})
    builder.row(
        {"text": "✅ Сохранить план", "payload": "save_task"},
        {"text": "✏️ Редактировать", "payload": "edit_plan"}
    )
    builder.row({"text": "◀️ Назад", "payload": "back_to_main"})
    
    plan_text = f"🧠 План готов (заглушка AI)!\n\n" + "\n".join([f"{i+1}. {step}" for i, step in enumerate(plan_steps)])
    
    await send_event_message(event, text=plan_text, attachments=[builder.as_markup()])

@router.message_callback(F.payload.startswith("view_step_"))
async def view_step(event: MessageCallback, context: MemoryContext):
    step_num = int(event.callback.payload.split("_")[2])
    user_data = await context.get_data()
    subtasks = user_data.get("current_task", {}).get("subtasks", [])
    if step_num < len(subtasks):
        step = subtasks[step_num]
        builder = InlineKeyboardBuilder()
        builder.row({"text": "◀️ Назад к плану", "payload": "show_plan"})
        await send_event_message(
            event,
            f"Шаг {step_num + 1}: {step['title']}\n\nОценочное время: {step['pomodoros']} сессий Pomodoro",
            attachments=[builder.as_markup()]
        )

@router.message_callback(F.callback.payload == "save_task")
async def save_task(event: MessageCallback, context: MemoryContext):
    user_data = await context.get_data()
    tasks = user_data.get("tasks", [])
    current_task = user_data.get("current_task", {})
    tasks.append(current_task)
    user_data["tasks"] = tasks
    await context.set_data(user_data)
    
    if _scheduler:
        chat_id = None
        try:
            if hasattr(event, 'chat_id'):
                chat_id = event.chat_id
            elif hasattr(event, 'message') and hasattr(event.message, 'chat_id'):
                chat_id = event.message.chat_id
            elif hasattr(event, 'chat') and hasattr(event.chat, 'chat_id'):
                chat_id = event.chat.chat_id
            elif hasattr(event, 'message') and hasattr(event.message, 'recipient') and hasattr(event.message.recipient, 'chat_id'):
                chat_id = event.message.recipient.chat_id
        except Exception as e:
            logger.warning(f"Ошибка получения chat_id в save_task: {e}")
        
        if chat_id:
            _scheduler.update_user_data(chat_id, user_data)
    
    builder = InlineKeyboardBuilder()
    builder.row({"text": "🍅 Начать первый шаг", "payload": "start_first_step"})
    builder.row({"text": "📋 Посмотреть все задачи", "payload": "list_tasks"})
    builder.row({"text": "◀️ Главное меню", "payload": "back_to_main"})
    
    await send_event_message(
        event,
        "✅ План сохранен!\n\nГотов начать работу?",
        attachments=[builder.as_markup()]
    )

@router.message_callback(F.callback.payload == "quick_pomodoro")
async def quick_pomodoro(event: MessageCallback, context: MemoryContext):
    await context.set_state(UserStates.waiting_task_description)
    builder = InlineKeyboardBuilder()
    builder.row({"text": "❌ Отмена", "payload": "back_to_main"})
    await send_event_message(
        event,
        "Для быстрой сессии: опиши, на чем фокусируешься (например: 'Чтение статьи')",
        attachments=[builder.as_markup()]
    )


@router.message_callback(F.callback.payload == "how_it_works")
async def how_it_works(event: MessageCallback):
    builder = InlineKeyboardBuilder()
    webapp_url = "https://max.ru/t122_hakaton_bot?startapp"
    try:
        builder.row(
            LinkButton(text="📱 Открыть приложение", url=webapp_url)
        )
    except:
        builder.row(
            {"text": "📱 Открыть приложение", "url": webapp_url}
        )
    builder.row({"text": "◀️ Назад", "payload": "back_to_main"})
    
    how_it_works_text = """🍅 Как работает FocusHelper:

📋 Работа с задачами:
• Создай задачу в веб-приложении
• Приложение разобьет её на шаги
• Каждый шаг можно выполнить за несколько Pomodoro сессий

⏱️ Pomodoro техника:
1. Выбери задачу или шаг
2. Работай 25 минут без отвлечений
3. Отдохни 5 минут
4. После 4 сессий - длинный перерыв 15-30 минут

📊 Статистика и мотивация:
• Отслеживай свой прогресс
• Получай достижения за активность
• Повышай уровень и зарабатывай XP

⏰ Утренние напоминания:
• Каждый день в 9:00 утра я напомню о незавершенных делах
• Это поможет не забыть важные задачи

📱 Используй веб-приложение для полного функционала!"""
    
    await send_event_message(
        event,
        how_it_works_text,
        attachments=[builder.as_markup()]
    )

@router.message_callback(F.callback.payload == "back_to_main")
async def back_to_main(event: MessageCallback, context: MemoryContext):
    await context.set_state(None)
    builder = InlineKeyboardBuilder()
    webapp_url = "https://max.ru/t122_hakaton_bot?startapp"
    try:
        builder.row(
            LinkButton(text="📱 Открыть приложение", url=webapp_url)
        )
    except:
        builder.row(
            {"text": "📱 Открыть приложение", "url": webapp_url}
        )
    builder.row(
        {"text": "ℹ️ Как работает", "payload": "how_it_works"}
    )
    builder.row(
        {"text": "🤖 Умный помощник", "payload": "ai_assistant"}
    )

    welcome_text = """🎯 FocusHelper!

📱 Открой веб-приложение для работы с задачами!"""

    await send_event_message(event, text=welcome_text, attachments=builder.as_markup())

@router.message_callback(F.callback.payload == "complete_session")
async def complete_session(event: MessageCallback, context: MemoryContext):
    user_data = await context.get_data()
    user_data["total_sessions"] += 1
    if user_data["total_sessions"] % 10 == 0:
        user_data["level"] += 1
    await context.set_data(user_data)
    
    builder = InlineKeyboardBuilder()
    builder.row({"text": "🍅 Новая сессия", "payload": "quick_pomodoro"})
    await send_event_message(
        event,
        "🎉 Сессия завершена! +10 XP\n\nОтдохни и продолжи!",
        attachments=[builder.as_markup()]
    )

async def ask_openrouter(question: str) -> str:
    """Отправка запроса в OpenRouter API с fallback на несколько моделей"""
    api_key = os.getenv('OPENROUTER_API_KEY')
    if not api_key:
        logger.error("OPENROUTER_API_KEY не установлен в переменных окружения")
        return "❌ Ошибка: API ключ не настроен. Обратитесь к администратору."
    
    url = "https://openrouter.ai/api/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://max.ru/t122_hakaton_bot",
        "X-Title": "FocusHelper Bot"
    }
    
    # Список моделей для попыток (в порядке приоритета)
    models = [
        "anthropic/claude-3-haiku",  # Быстрая и доступная модель
        "meta-llama/llama-3.2-3b-instruct",  # Бесплатная модель
        "mistralai/mistral-7b-instruct",  # Бесплатная модель
        "google/gemini-pro",  # Gemini Pro
    ]
    
    system_message = {
        "role": "system",
        "content": "Ты умный помощник в боте FocusHelper. Помогай пользователям с вопросами о продуктивности, планировании задач, технике Pomodoro и других вопросах. Отвечай кратко и по делу."
    }
    
    user_message = {
        "role": "user",
        "content": question
    }
    
    # Пробуем каждую модель по очереди
    for model in models:
        try:
            logger.info(f"Пробую модель: {model}")
            payload = {
                "model": model,
                "messages": [system_message, user_message]
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=payload, headers=headers, timeout=aiohttp.ClientTimeout(total=30)) as response:
                    if response.status == 200:
                        data = await response.json()
                        if 'choices' in data and len(data['choices']) > 0:
                            logger.info(f"Успешно получен ответ от модели {model}")
                            return data['choices'][0]['message']['content']
                        else:
                            logger.error(f"Неожиданный формат ответа от OpenRouter: {data}")
                            continue  # Пробуем следующую модель
                    else:
                        error_text = await response.text()
                        logger.warning(f"Ошибка OpenRouter API для модели {model}: {response.status} - {error_text}")
                        
                        # Если это ошибка региона, пробуем следующую модель
                        try:
                            error_data = json.loads(error_text)
                            error_msg = error_data.get('error', {}).get('message', '')
                            if 'country' in error_msg.lower() or 'region' in error_msg.lower() or 'territory' in error_msg.lower():
                                logger.info(f"Модель {model} не поддерживает регион, пробую следующую")
                                continue
                        except:
                            pass
                        
                        # Если это 404 (модель не найдена), пробуем следующую
                        if response.status == 404:
                            logger.info(f"Модель {model} не найдена, пробую следующую")
                            continue
                        
                        # Для других ошибок пробуем следующую модель
                        continue
        except asyncio.TimeoutError:
            logger.warning(f"Таймаут при запросе к модели {model}, пробую следующую")
            continue
        except Exception as e:
            logger.warning(f"Ошибка при запросе к модели {model}: {e}, пробую следующую")
            continue
    
    # Если все модели не сработали
    return "❌ Не удалось получить ответ от AI. Все доступные модели недоступны. Попробуйте позже."

@router.message_callback(F.callback.payload == "ai_assistant")
async def ai_assistant_handler(event: MessageCallback, context: MemoryContext):
    """Обработчик кнопки 'Умный помощник'"""
    logger.info("Кнопка 'Умный помощник' нажата, устанавливаю состояние")
    await context.set_state(UserStates.waiting_ai_question)
    
    # Проверяем, что состояние установлено
    current_state = await context.get_state()
    logger.info(f"Текущее состояние после установки: {current_state}")
    
    builder = InlineKeyboardBuilder()
    builder.row({"text": "◀️ Выйти из чата", "payload": "back_to_main"})
    
    await send_event_message(
        event,
        "🤖 Привет! Я умный помощник. Задай мне любой вопрос, и я постараюсь помочь!\n\n"
        "Например:\n"
        "• Как лучше планировать задачи?\n"
        "• Что такое техника Pomodoro?\n"
        "• Как повысить продуктивность?",
        attachments=[builder.as_markup()]
    )