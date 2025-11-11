from maxapi.context import State, StatesGroup

class UserStates(StatesGroup):
    waiting_task_description = State()
    waiting_deadline = State()
    editing_subtask = State()
    pomodoro_active = State()

class UserData:
    def __init__(self):
        self.tasks = []
        self.total_sessions = 0
        self.level = 1
        self.joined_date = None