import asyncio
import logging
from datetime import datetime, time
from typing import Set, Dict
from maxapi import Bot
from maxapi.context import MemoryContext

logger = logging.getLogger(__name__)

class ReminderScheduler:
    """Планировщик напоминаний"""
    
    def __init__(self, bot: Bot):
        self.bot = bot
        self.active_users: Set[int] = set()
        self.user_contexts: Dict[int, MemoryContext] = {}
        self.user_data_cache: Dict[int, dict] = {}
        self.running = False
        
    def add_user(self, chat_id: int, context: MemoryContext = None):
        """Добавить пользователя для получения напоминаний"""
        self.active_users.add(chat_id)
        if context:
            self.user_contexts[chat_id] = context
        logger.info(f"Пользователь {chat_id} добавлен в список напоминаний")
    
    def update_user_data(self, chat_id: int, user_data: dict):
        """Обновить кэш данных пользователя"""
        self.user_data_cache[chat_id] = user_data
    
    def remove_user(self, chat_id: int):
        """Удалить пользователя из списка напоминаний"""
        self.active_users.discard(chat_id)
        self.user_contexts.pop(chat_id, None)
        logger.info(f"Пользователь {chat_id} удален из списка напоминаний")
    
    async def get_user_tasks(self, chat_id: int, context: MemoryContext = None) -> list:
        """Получить задачи пользователя"""
        try:
            user_data = None
            
            if chat_id in self.user_data_cache:
                user_data = self.user_data_cache[chat_id]
            
            if not user_data and context:
                try:
                    user_data = await context.get_data()
                    if user_data:
                        self.user_data_cache[chat_id] = user_data
                except Exception as e:
                    logger.warning(f"Не удалось получить данные из контекста для {chat_id}: {e}")
            
            if not user_data:
                user_data = {}
            
            tasks = user_data.get("tasks", [])
            incomplete_tasks = []
            for task in tasks:
                subtasks = task.get("subtasks", [])
                incomplete_subtasks = [st for st in subtasks if not st.get("completed", False)]
                if incomplete_subtasks:
                    incomplete_tasks.append(task)
            
            return incomplete_tasks
        except Exception as e:
            logger.error(f"Ошибка получения задач пользователя {chat_id}: {e}")
            return []
    
    async def send_morning_reminder(self, chat_id: int):
        """Отправить утреннее напоминание пользователю"""
        try:
            context = self.user_contexts.get(chat_id)
            tasks = await self.get_user_tasks(chat_id, context)
            
            if tasks:
                tasks_text = "\n".join([f"• {task.get('description', 'Задача без названия')}" for task in tasks[:5]])
                if len(tasks) > 5:
                    tasks_text += f"\n... и еще {len(tasks) - 5} задач"
                
                message = f"🌅 Доброе утро!\n\nПроверьте, может у вас есть незавершенные дела или вы хотите начать новое?\n\n📋 Ваши незавершенные задачи:\n{tasks_text}\n\n🎯 Используйте /start для работы с задачами!"
            else:
                message = "🌅 Доброе утро!\n\nПроверьте, может у вас есть незавершенные дела или вы хотите начать новое?\n\n🎯 Используйте /start для создания новых задач!"
            
            await self.bot.send_message(
                chat_id=chat_id,
                text=message
            )
            logger.info(f"Утреннее напоминание отправлено пользователю {chat_id}")
        except Exception as e:
            logger.error(f"Ошибка отправки напоминания пользователю {chat_id}: {e}")
    
    async def check_and_send_reminders(self):
        """Проверить время и отправить напоминания в 9:00"""
        while self.running:
            try:
                now = datetime.now()
                current_time = now.time()
                target_time = time(9, 0)
                
                if current_time.hour == target_time.hour and current_time.minute == target_time.minute:
                    logger.info(f"Время для отправки утренних напоминаний: {now}")
                    
                    for chat_id in list(self.active_users):
                        await self.send_morning_reminder(chat_id)
                    
                    await asyncio.sleep(60)
                else:
                    await asyncio.sleep(60)
            except Exception as e:
                logger.error(f"Ошибка в планировщике напоминаний: {e}")
                await asyncio.sleep(60)
    
    async def start(self):
        """Запустить планировщик"""
        self.running = True
        logger.info("Планировщик утренних напоминаний запущен")
        asyncio.create_task(self.check_and_send_reminders())
    
    def stop(self):
        """Остановить планировщик"""
        self.running = False
        logger.info("Планировщик утренних напоминаний остановлен")

