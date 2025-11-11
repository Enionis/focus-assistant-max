import asyncio
import logging
import os
from dotenv import load_dotenv
from maxapi import Bot, Dispatcher
from maxapi.types import BotStarted

import router
from scheduler import ReminderScheduler

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

bot = Bot(os.getenv('BOT_TOKEN'))
dp = Dispatcher()
dp.include_routers(router.router)

scheduler = ReminderScheduler(bot)
router.set_scheduler(scheduler)

@dp.on_started()
async def on_startup():
    logger.info('Бот FocusHelper запущен!')
    await scheduler.start()
    logger.info("Команда /start доступна через обработчик. Черточка может появиться автоматически.")

@dp.bot_started()
async def handle_bot_started(event: BotStarted):
    scheduler.add_user(event.chat_id)
    
    await event.bot.send_message(
        chat_id=event.chat_id,
        text="🎯 Привет! Я FocusHelper - твой помощник по продуктивности с Pomodoro. "
             "Отправь /start чтобы начать разбивать задачи и фокусироваться!\n\n"
             "⏰ Я буду напоминать тебе в 9:00 утра о незавершенных делах!\n\n"
             "💡 Используй /help чтобы увидеть все доступные команды"
    )

async def main():
    await dp.start_polling(bot)

if __name__ == '__main__':
    asyncio.run(main())