class FocusHelperApp {
    constructor() {
        this.currentView = 'onboarding';
        this.userData = null;
        this.eventListenersAttached = false;
        this.apiBaseUrl = 'http://localhost:8000'; 
        this.initUserData(); 
        this.timerInterval = null;
        this.timeLeft = 30;
        this.isRunning = false;
        this.isPaused = false;
        this.activeTask = null;
        this.selectedTaskId = null;
        this.lastPomodoroFocus = null;
        this.pendingTaskPlan = null;
        this.settings = {
            dailyHours: 4,
            productiveTime: 'morning',
            pomodoroLength: 0.5,
            breakLength: 5,
            isOnboarded: false
        };
        this.tasks = [];
        this.stats = {
            totalSessions: 0,
            totalFocusTime: 0,
            currentStreak: 0,
            longestStreak: 0,
            level: 1,
            xp: 0,
            achievements: []
        };
        this.init();
    }

    initUserData() {
        try {
            if (typeof window !== 'undefined' && window.MaxWebApp) {
                const maxWebApp = window.MaxWebApp;
                if (maxWebApp.getUserData) {
                    this.userData = maxWebApp.getUserData();
                } else if (maxWebApp.user) {
                    this.userData = { userId: maxWebApp.user.id || maxWebApp.user.user_id };
                } else if (maxWebApp.initData) {
                    const initData = maxWebApp.initData;
                    if (initData.user) {
                        this.userData = { userId: initData.user.id || initData.user.user_id };
                    }
                }
                console.log('Данные пользователя из Max Web App SDK:', this.userData);
            } else {
                console.log('Max Web App SDK не найден, данные будут храниться только локально');
            }
        } catch (error) {
            console.warn('Ошибка получения данных пользователя:', error);
        }
    }

    init() {
        if (!this.isLocalStorageAvailable()) {
            console.error('❌ localStorage недоступен! Данные не будут сохраняться.');
            alert('⚠️ Внимание: localStorage недоступен. Статистика не будет сохраняться после закрытия браузера.\n\nВозможные причины:\n- Режим инкогнито\n- Браузер заблокировал хранилище\n- Недостаточно места');
        }
        
        this.loadData();
        this.lastPomodoroFocus = localStorage.getItem('lastPomodoroFocus') || null;
        this.attachEventListeners();
        this.renderApp();
    }

    isLocalStorageAvailable() {
        try {
            const test = '__localStorage_test__';
            localStorage.setItem(test, test);
            localStorage.removeItem(test);
            return true;
        } catch (e) {
            return false;
        }
    }

    async loadData() {
        try {
            const savedSettings = JSON.parse(localStorage.getItem('focus_settings') || '{}');
            this.settings = {
                dailyHours: 4,
                productiveTime: 'morning',
                pomodoroLength: 0.5,
                breakLength: 5,
                isOnboarded: false,
                ...savedSettings
            };
            this.settings.pomodoroLength = 0.5;
            this.tasks = JSON.parse(localStorage.getItem('focus_tasks') || '[]');
            this.stats = JSON.parse(localStorage.getItem('focus_stats') || '{}');

            if (!this.stats || typeof this.stats !== 'object') {
                this.stats = {
                    totalSessions: 0,
                    totalFocusTime: 0,
                    currentStreak: 0,
                    longestStreak: 0,
                    level: 1,
                    xp: 0,
                    achievements: []
                };
            }
            
            if (!Array.isArray(this.stats.achievements)) {
                this.stats.achievements = [];
            }

            if (this.userData?.userId) {
                await this.syncWithBot();
            }

            if (!this.settings.isOnboarded) {
                this.currentView = 'onboarding';
            } else {
                this.currentView = 'home';
            }
        } catch (error) {
            console.error('Ошибка загрузки данных:', error);
            if (!this.stats || typeof this.stats !== 'object') {
                this.stats = {
                    totalSessions: 0,
                    totalFocusTime: 0,
                    currentStreak: 0,
                    longestStreak: 0,
                    level: 1,
                    xp: 0,
                    achievements: []
                };
            }
            if (!Array.isArray(this.stats.achievements)) {
                this.stats.achievements = [];
            }
        }
    }

    saveSettings(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
        localStorage.setItem('focus_settings', JSON.stringify(this.settings));
    }

    saveTasks(newTasks) {
        this.tasks = newTasks;
        localStorage.setItem('focus_tasks', JSON.stringify(newTasks));
    }

    saveStats(newStats) {
        this.stats = newStats;
        try {
            localStorage.setItem('focus_stats', JSON.stringify(newStats));
            const saved = localStorage.getItem('focus_stats');
            if (!saved) {
                console.warn('⚠️ Не удалось сохранить статистику в localStorage');
            }
        } catch (error) {
            console.error('❌ Ошибка сохранения статистики:', error);
            if (error.name === 'QuotaExceededError') {
                console.warn('⚠️ localStorage переполнен, очищаем старые данные...');
                try {
                    localStorage.removeItem('focus_tasks');
                    localStorage.setItem('focus_stats', JSON.stringify(newStats));
                } catch (e) {
                    console.error('❌ Критическая ошибка: не удалось сохранить статистику');
                }
            }
        }
    }

    async syncWithBot() {
        let userId = this.userData?.userId;
        
        if (!userId && typeof window !== 'undefined' && window.MaxWebApp) {
            try {
                const maxWebApp = window.MaxWebApp;
                if (maxWebApp.user?.id) {
                    userId = maxWebApp.user.id;
                } else if (maxWebApp.user?.user_id) {
                    userId = maxWebApp.user.user_id;
                } else if (maxWebApp.initData?.user?.id) {
                    userId = maxWebApp.initData.user.id;
                } else if (maxWebApp.initData?.user?.user_id) {
                    userId = maxWebApp.initData.user.user_id;
                }
            } catch (e) {
                console.warn('Не удалось получить userId из Max Web App SDK:', e);
            }
        }
        
        if (!userId) {
            console.log('ℹ️ Данные хранятся только локально (localStorage). userId не найден.');
            return;
        }

        try {
            const response = await fetch(`${this.apiBaseUrl}/sync`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: userId,
                    settings: this.settings,
                    tasks: this.tasks,
                    stats: this.stats
                })
            });

            if (response.ok) {
                const data = await response.json();
                if (data.settings) this.saveSettings(data.settings);
                if (data.tasks) this.saveTasks(data.tasks);
                if (data.stats) this.saveStats(data.stats);
                console.log('✅ Данные синхронизированы с сервером');
            } else {
                console.warn('⚠️ Синхронизация не удалась, данные сохранены локально');
            }
        } catch (error) {
            console.warn('⚠️ Ошибка синхронизации, данные сохранены локально:', error.message);
        }
    }

    navigateTo(view) {
        console.log('navigateTo called with view:', view, 'current view:', this.currentView);
        this.currentView = view;
        this.renderApp();
    }

    completeOnboarding(settings) {
        this.saveSettings({ ...this.settings, ...settings, isOnboarded: true });
        this.navigateTo('home');
        this.syncWithBot();
    }

    async generateTaskPlanWithAI(taskDescription, statusCallback = null) {
        // Используем OpenRouter API для генерации плана или локальную логику как fallback
        
        const updateStatus = (message) => {
            if (statusCallback) statusCallback(message);
        };
        
        // Пробуем OpenRouter API
        try {
            const openRouterApiKey = localStorage.getItem('openrouter_api_key');
            if (openRouterApiKey) {
                updateStatus('🌐 Генерирую план с помощью OpenRouter AI...');
                const plan = await this.generatePlanWithOpenRouter(taskDescription, openRouterApiKey);
                if (plan && plan.length > 0) {
                    updateStatus('✅ План сгенерирован с помощью OpenRouter AI');
                    return plan;
                }
            } else {
                updateStatus('📝 API ключ не найден, использую локальную логику...');
            }
        } catch (error) {
            console.log('OpenRouter API недоступен:', error);
            updateStatus('⚠️ OpenRouter недоступен, использую локальную логику...');
        }
        
        // Fallback: используем улучшенную локальную логику
        console.log('Используется локальная логика генерации плана');
        updateStatus('📝 Генерирую план с помощью локальной логики...');
        return this.generateTaskPlanFallback(taskDescription);
    }
    
    async generatePlanWithHuggingFace(taskDescription, proxyUrl = null) {
        // ВАЖНО: Hugging Face Inference API НЕ РАБОТАЕТ напрямую из браузера из-за CORS!
        // Для использования нужен прокси-сервер или бэкенд
        // Используйте Groq или Together AI для работы из браузера
        
        // Используем бесплатные модели через Hugging Face Inference API
        // Пробуем несколько моделей на случай проблем с CORS или доступностью
        
        const prompt = `Ты помощник по планированию задач. Разбей следующую задачу на конкретные шаги (подзадачи) для выполнения методом Pomodoro.

Задача: "${taskDescription}"

Верни ТОЛЬКО JSON массив подзадач в следующем формате (без дополнительного текста):
[
  {"title": "Название подзадачи 1", "estimatedPomodoros": число},
  {"title": "Название подзадачи 2", "estimatedPomodoros": число}
]

Где:
- title: краткое и конкретное название подзадачи
- estimatedPomodoros: оценка количества сессий Pomodoro (по 30 минут каждая) для выполнения подзадачи (от 1 до 10)

Создай 3-7 подзадач в зависимости от сложности задачи. Подзадачи должны быть конкретными и выполнимыми.`;

        // Получаем токен из localStorage (если есть)
        const hfToken = localStorage.getItem('hf_api_key') || '';
        
        // Формируем заголовки с токеном, если он есть
        const headers = {
            'Content-Type': 'application/json',
        };
        if (hfToken) {
            headers['Authorization'] = `Bearer ${hfToken}`;
        }

        // Список моделей для попыток (от более мощных к более простым)
        const models = [
            'mistralai/Mistral-7B-Instruct-v0.2',
            'HuggingFaceH4/zephyr-7b-beta',
            'microsoft/Phi-3-mini-4k-instruct'
        ];

        // Если есть прокси, используем его
        const apiUrl = proxyUrl || 'https://api-inference.huggingface.co';
        
        for (const model of models) {
            try {
                const url = proxyUrl 
                    ? `${proxyUrl}/models/${model}` 
                    : `https://api-inference.huggingface.co/models/${model}`;
                
                const response = await fetch(url, {
                        method: 'POST',
                        headers: headers,
                        body: JSON.stringify({
                            inputs: prompt,
                            parameters: {
                                max_new_tokens: 500,
                                temperature: 0.7,
                                return_full_text: false
                            }
                        })
                    }
                );

                // Если модель загружается, ждем немного
                if (response.status === 503) {
                    const data = await response.json();
                    if (data.estimated_time) {
                        console.log(`Модель ${model} загружается, ожидание ${data.estimated_time} секунд...`);
                        await new Promise(resolve => setTimeout(resolve, Math.min(data.estimated_time * 1000, 10000)));
                        continue; // Пробуем следующую модель
                    }
                }

                if (!response.ok) {
                    continue; // Пробуем следующую модель
                }

                const data = await response.json();
                
                // Извлекаем текст ответа
                let text = '';
                if (Array.isArray(data) && data[0] && data[0].generated_text) {
                    text = data[0].generated_text;
                } else if (data.generated_text) {
                    text = data.generated_text;
                } else if (typeof data === 'string') {
                    text = data;
                }

                if (!text) {
                    continue; // Пробуем следующую модель
                }

                // Очищаем текст от markdown форматирования и извлекаем JSON
                text = text.trim();
                text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
                
                // Пытаемся найти JSON в тексте
                const jsonMatch = text.match(/\[[\s\S]*\]/);
                if (jsonMatch) {
                    const jsonText = jsonMatch[0];
                    const parsed = JSON.parse(jsonText);
                    
                    // Преобразуем в нужный формат
                    return parsed.map((item, index) => ({
                        id: Date.now() + index,
                        title: item.title || item.name || `Подзадача ${index + 1}`,
                        estimatedPomodoros: Math.max(1, Math.min(10, parseInt(item.estimatedPomodoros) || 2)),
                        completedPomodoros: 0
                    }));
                }
            } catch (error) {
                // Если это CORS ошибка, это ожидаемо - Hugging Face API не поддерживает CORS
                if (error.name === 'TypeError' && (error.message.includes('fetch') || error.message.includes('CORS'))) {
                    console.log(`CORS ошибка для модели ${model} (ожидаемо - Hugging Face API не поддерживает CORS из браузера)`);
                    throw new Error('CORS_ERROR: Hugging Face API не поддерживает запросы из браузера. Используйте Groq или Together AI, или настройте прокси-сервер.');
                }
                console.log(`Ошибка для модели ${model}:`, error.message);
                continue;
            }
        }
        
        throw new Error('Все модели Hugging Face недоступны');
    }
    
    async generatePlanWithGroq(taskDescription, apiKey) {
        // Groq API - очень быстрый и бесплатный (требует регистрацию и API ключ)
        // Получить ключ можно на https://console.groq.com/
        
        const prompt = `Ты помощник по планированию задач. Разбей следующую задачу на конкретные шаги (подзадачи) для выполнения методом Pomodoro.

Задача: "${taskDescription}"

Верни ТОЛЬКО JSON массив подзадач в следующем формате (без дополнительного текста):
[
  {"title": "Название подзадачи 1", "estimatedPomodoros": число},
  {"title": "Название подзадачи 2", "estimatedPomodoros": число}
]

Где:
- title: краткое и конкретное название подзадачи
- estimatedPomodoros: оценка количества сессий Pomodoro (по 30 минут каждая) для выполнения подзадачи (от 1 до 10)

Создай 3-7 подзадач в зависимости от сложности задачи. Подзадачи должны быть конкретными и выполнимыми.`;

        try {
            const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: 'llama-3.1-8b-instant', // Бесплатная быстрая модель
                    messages: [
                        {
                            role: 'system',
                            content: 'Ты помощник, который всегда отвечает только валидным JSON без дополнительного текста.'
                        },
                        {
                            role: 'user',
                            content: prompt
                        }
                    ],
                    temperature: 0.7,
                    max_tokens: 500
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            const text = data.choices[0]?.message?.content || '';
            
            // Очищаем текст и извлекаем JSON
            let cleanText = text.trim();
            cleanText = cleanText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            
            const jsonMatch = cleanText.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                const jsonText = jsonMatch[0];
                const parsed = JSON.parse(jsonText);
                
                return parsed.map((item, index) => ({
                    id: Date.now() + index,
                    title: item.title || item.name || `Подзадача ${index + 1}`,
                    estimatedPomodoros: Math.max(1, Math.min(10, parseInt(item.estimatedPomodoros) || 2)),
                    completedPomodoros: 0
                }));
            }
            
            throw new Error('Не удалось извлечь JSON из ответа');
        } catch (error) {
            console.error('Ошибка при генерации плана через Groq:', error);
            throw error;
        }
    }
    
    async generatePlanWithTogetherAI(taskDescription, apiKey) {
        // Together AI - бесплатный tier с хорошими моделями
        // Получить ключ можно на https://api.together.xyz/
        
        const prompt = `Ты помощник по планированию задач. Разбей следующую задачу на конкретные шаги (подзадачи) для выполнения методом Pomodoro.

Задача: "${taskDescription}"

Верни ТОЛЬКО JSON массив подзадач в следующем формате (без дополнительного текста):
[
  {"title": "Название подзадачи 1", "estimatedPomodoros": число},
  {"title": "Название подзадачи 2", "estimatedPomodoros": число}
]

Где:
- title: краткое и конкретное название подзадачи
- estimatedPomodoros: оценка количества сессий Pomodoro (по 30 минут каждая) для выполнения подзадачи (от 1 до 10)

Создай 3-7 подзадач в зависимости от сложности задачи. Подзадачи должны быть конкретными и выполнимыми.`;

        try {
            const response = await fetch('https://api.together.xyz/inference', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: 'meta-llama/Llama-3-8b-chat-hf', // Бесплатная модель
                    prompt: prompt,
                    max_tokens: 500,
                    temperature: 0.7,
                    top_p: 0.7,
                    top_k: 50,
                    repetition_penalty: 1,
                    stop: ['</s>', '\n\n\n']
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            const text = data.output?.choices?.[0]?.text || data.output?.text || '';
            
            if (!text) {
                throw new Error('Пустой ответ от API');
            }
            
            // Очищаем текст и извлекаем JSON
            let cleanText = text.trim();
            cleanText = cleanText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            
            const jsonMatch = cleanText.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                const jsonText = jsonMatch[0];
                const parsed = JSON.parse(jsonText);
                
                return parsed.map((item, index) => ({
                    id: Date.now() + index,
                    title: item.title || item.name || `Подзадача ${index + 1}`,
                    estimatedPomodoros: Math.max(1, Math.min(10, parseInt(item.estimatedPomodoros) || 2)),
                    completedPomodoros: 0
                }));
            }
            
            throw new Error('Не удалось извлечь JSON из ответа');
        } catch (error) {
            console.error('Ошибка при генерации плана через Together AI:', error);
            throw error;
        }
    }
    
    async generatePlanWithGemini(taskDescription, apiKey) {
        // Google Gemini API - бесплатный tier, работает из браузера
        // Получить ключ можно на https://aistudio.google.com/apikey
        
        const prompt = `Ты помощник по планированию задач. Разбей следующую задачу на конкретные шаги (подзадачи) для выполнения методом Pomodoro.

Задача: "${taskDescription}"

Верни ТОЛЬКО JSON массив подзадач в следующем формате (без дополнительного текста):
[
  {"title": "Название подзадачи 1", "estimatedPomodoros": число},
  {"title": "Название подзадачи 2", "estimatedPomodoros": число}
]

Где:
- title: краткое и конкретное название подзадачи
- estimatedPomodoros: оценка количества сессий Pomodoro (по 30 минут каждая) для выполнения подзадачи (от 1 до 10)

Создай 3-7 подзадач в зависимости от сложности задачи. Подзадачи должны быть конкретными и выполнимыми.`;

        try {
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        contents: [{
                            parts: [{
                                text: prompt
                            }]
                        }],
                        generationConfig: {
                            temperature: 0.7,
                            maxOutputTokens: 500
                        }
                    })
                }
            );

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
            
            if (!text) {
                throw new Error('Пустой ответ от API');
            }
            
            // Очищаем текст и извлекаем JSON
            let cleanText = text.trim();
            cleanText = cleanText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            
            const jsonMatch = cleanText.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                const jsonText = jsonMatch[0];
                const parsed = JSON.parse(jsonText);
                
                return parsed.map((item, index) => ({
                    id: Date.now() + index,
                    title: item.title || item.name || `Подзадача ${index + 1}`,
                    estimatedPomodoros: Math.max(1, Math.min(10, parseInt(item.estimatedPomodoros) || 2)),
                    completedPomodoros: 0
                }));
            }
            
            throw new Error('Не удалось извлечь JSON из ответа');
        } catch (error) {
            console.error('Ошибка при генерации плана через Gemini:', error);
            throw error;
        }
    }
    
    async generatePlanWithOpenRouter(taskDescription, apiKey) {
        // OpenRouter API - агрегатор с бесплатными моделями
        // Получить ключ можно на https://openrouter.ai/keys
        // Поддерживает множество бесплатных моделей
        
        const prompt = `Ты помощник по планированию задач. Разбей следующую задачу на конкретные шаги (подзадачи) для выполнения методом Pomodoro.

Задача: "${taskDescription}"

Верни ТОЛЬКО JSON массив подзадач в следующем формате (без дополнительного текста):
[
  {"title": "Название подзадачи 1", "estimatedPomodoros": число},
  {"title": "Название подзадачи 2", "estimatedPomodoros": число}
]

Где:
- title: краткое и конкретное название подзадачи
- estimatedPomodoros: оценка количества сессий Pomodoro (по 30 минут каждая) для выполнения подзадачи (от 1 до 10)

Создай 3-7 подзадач в зависимости от сложности задачи. Подзадачи должны быть конкретными и выполнимыми.`;

        // Список бесплатных моделей для попыток (от более мощных к более простым)
        const freeModels = [
            'meta-llama/llama-3.2-3b-instruct:free',
            'google/gemma-2-2b-it:free',
            'mistralai/mistral-7b-instruct:free',
            'qwen/qwen-2-1.5b-instruct:free'
        ];

        for (const model of freeModels) {
            try {
                const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`,
                        'HTTP-Referer': window.location.origin,
                        'X-Title': 'Focus Assistant'
                    },
                    body: JSON.stringify({
                        model: model,
                        messages: [
                            {
                                role: 'system',
                                content: 'Ты помощник, который всегда отвечает только валидным JSON без дополнительного текста. Отвечай строго в формате JSON массива.'
                            },
                            {
                                role: 'user',
                                content: prompt
                            }
                        ],
                        temperature: 0.7,
                        max_tokens: 500
                    })
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    // Если модель недоступна, пробуем следующую
                    if (response.status === 400 || response.status === 404) {
                        console.log(`Модель ${model} недоступна, пробуем следующую`);
                        continue;
                    }
                    throw new Error(`HTTP error! status: ${response.status}, message: ${errorData.error?.message || 'Unknown error'}`);
                }

                const data = await response.json();
                const text = data.choices?.[0]?.message?.content || '';
                
                if (!text) {
                    console.log(`Пустой ответ от модели ${model}, пробуем следующую`);
                    continue;
                }
                
                // Очищаем текст и извлекаем JSON
                let cleanText = text.trim();
                cleanText = cleanText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
                
                // Убираем возможные префиксы
                cleanText = cleanText.replace(/^[^{[]*/, '').replace(/[^}\]]*$/, '');
                
                const jsonMatch = cleanText.match(/\[[\s\S]*\]/);
                if (jsonMatch) {
                    try {
                        const jsonText = jsonMatch[0];
                        const parsed = JSON.parse(jsonText);
                        
                        if (Array.isArray(parsed) && parsed.length > 0) {
                            return parsed.map((item, index) => ({
                                id: Date.now() + index,
                                title: item.title || item.name || `Подзадача ${index + 1}`,
                                estimatedPomodoros: Math.max(1, Math.min(10, parseInt(item.estimatedPomodoros) || 2)),
                                completedPomodoros: 0
                            }));
                        }
                    } catch (parseError) {
                        console.log(`Ошибка парсинга JSON от модели ${model}:`, parseError);
                        continue;
                    }
                }
                
                console.log(`Не удалось извлечь JSON от модели ${model}, пробуем следующую`);
            } catch (error) {
                // Если это не ошибка модели, пробуем следующую
                if (error.message && !error.message.includes('HTTP error')) {
                    console.log(`Ошибка с моделью ${model}:`, error.message);
                    continue;
                }
                // Если это критическая ошибка (например, неверный API ключ), пробрасываем дальше
                if (error.message && error.message.includes('401') || error.message.includes('403')) {
                    throw error;
                }
                continue;
            }
        }
        
        throw new Error('Все бесплатные модели OpenRouter недоступны');
    }
    
    async generatePlanWithCohere(taskDescription, apiKey) {
        // Cohere API - бесплатный tier
        // Получить ключ можно на https://dashboard.cohere.com/api-keys
        
        const prompt = `Ты помощник по планированию задач. Разбей следующую задачу на конкретные шаги (подзадачи) для выполнения методом Pomodoro.

Задача: "${taskDescription}"

Верни ТОЛЬКО JSON массив подзадач в следующем формате (без дополнительного текста):
[
  {"title": "Название подзадачи 1", "estimatedPomodoros": число},
  {"title": "Название подзадачи 2", "estimatedPomodoros": число}
]

Где:
- title: краткое и конкретное название подзадачи
- estimatedPomodoros: оценка количества сессий Pomodoro (по 30 минут каждая) для выполнения подзадачи (от 1 до 10)

Создай 3-7 подзадач в зависимости от сложности задачи. Подзадачи должны быть конкретными и выполнимыми.`;

        try {
            const response = await fetch('https://api.cohere.ai/v1/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    model: 'command',
                    prompt: prompt,
                    max_tokens: 500,
                    temperature: 0.7,
                    stop_sequences: ['\n\n\n']
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            const text = data.generations?.[0]?.text || '';
            
            if (!text) {
                throw new Error('Пустой ответ от API');
            }
            
            // Очищаем текст и извлекаем JSON
            let cleanText = text.trim();
            cleanText = cleanText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            
            const jsonMatch = cleanText.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                const jsonText = jsonMatch[0];
                const parsed = JSON.parse(jsonText);
                
                return parsed.map((item, index) => ({
                    id: Date.now() + index,
                    title: item.title || item.name || `Подзадача ${index + 1}`,
                    estimatedPomodoros: Math.max(1, Math.min(10, parseInt(item.estimatedPomodoros) || 2)),
                    completedPomodoros: 0
                }));
            }
            
            throw new Error('Не удалось извлечь JSON из ответа');
        } catch (error) {
            console.error('Ошибка при генерации плана через Cohere:', error);
            throw error;
        }
    }
    
    // Улучшенная функция для анализа задачи и генерации плана
    analyzeTaskDescription(taskDescription) {
        const desc = taskDescription.toLowerCase();
        const words = desc.split(/\s+/);
        
        // Определяем тип задачи и сложность
        let taskType = 'general';
        let complexity = 'medium';
        let subject = null;
        
        // Типы задач
        if (desc.includes('экзамен') || desc.includes('экзамену') || desc.includes('экзамены')) {
            taskType = 'exam';
            complexity = desc.includes('финал') || desc.includes('итогов') ? 'high' : 'medium';
        } else if (desc.includes('курсовая') || desc.includes('курсовую') || desc.includes('курсовая работа')) {
            taskType = 'coursework';
            complexity = 'high';
        } else if (desc.includes('диплом') || desc.includes('дипломная')) {
            taskType = 'thesis';
            complexity = 'very_high';
        } else if (desc.includes('проект') || desc.includes('проекта')) {
            taskType = 'project';
            complexity = desc.includes('большой') || desc.includes('крупный') ? 'high' : 'medium';
        } else if (desc.includes('изуч') || desc.includes('учить') || desc.includes('обучен') || desc.includes('изучить')) {
            taskType = 'learning';
            complexity = 'medium';
        } else if (desc.includes('подготов') || desc.includes('подготовить')) {
            taskType = 'preparation';
            complexity = 'medium';
        } else if (desc.includes('написать') || desc.includes('написат')) {
            taskType = 'writing';
            complexity = desc.includes('стать') || desc.includes('эссе') ? 'medium' : 'high';
        } else if (desc.includes('создать') || desc.includes('разработ')) {
            taskType = 'creation';
            complexity = 'medium';
        }
        
        // Определяем предмет/область
        const subjects = {
            'математик': 'math',
            'физик': 'physics',
            'хими': 'chemistry',
            'биолог': 'biology',
            'истори': 'history',
            'литератур': 'literature',
            'английск': 'english',
            'программирован': 'programming',
            'код': 'programming',
            'алгоритм': 'programming',
            'веб': 'web',
            'дизайн': 'design'
        };
        
        for (const [key, value] of Object.entries(subjects)) {
            if (desc.includes(key)) {
                subject = value;
                break;
            }
        }
        
        return { taskType, complexity, subject, words };
    }

    generateTaskPlanFallback(taskDescription) {
        // Улучшенная умная логика на основе детального анализа
        const analysis = this.analyzeTaskDescription(taskDescription);
        const { taskType, complexity, subject } = analysis;
        let subTasks = [];
        const baseId = Date.now();

        // Шаблоны планов для разных типов задач
        const planTemplates = {
            exam: {
                low: [
                    { title: 'Повторить основные темы', pomodoros: 2 },
                    { title: 'Решить типовые задачи', pomodoros: 2 },
                    { title: 'Проверить знания', pomodoros: 1 }
                ],
                medium: [
                    { title: 'Собрать материалы и конспекты', pomodoros: 2 },
                    { title: 'Составить план изучения', pomodoros: 1 },
                    { title: 'Изучить теорию и основные понятия', pomodoros: 4 },
                    { title: 'Решить практические задачи', pomodoros: 3 },
                    { title: 'Повторить и закрепить материал', pomodoros: 2 }
                ],
                high: [
                    { title: 'Собрать все материалы и конспекты', pomodoros: 3 },
                    { title: 'Составить детальный план изучения', pomodoros: 2 },
                    { title: 'Изучить теорию по всем темам', pomodoros: 6 },
                    { title: 'Решить задачи всех типов', pomodoros: 5 },
                    { title: 'Повторить сложные моменты', pomodoros: 3 },
                    { title: 'Провести финальное повторение', pomodoros: 2 }
                ]
            },
            coursework: {
                medium: [
                    { title: 'Выбрать тему и собрать источники', pomodoros: 2 },
                    { title: 'Составить план работы', pomodoros: 1 },
                    { title: 'Изучить литературу', pomodoros: 3 },
                    { title: 'Написать основную часть', pomodoros: 6 },
                    { title: 'Оформить и проверить работу', pomodoros: 2 }
                ],
                high: [
                    { title: 'Выбрать тему и провести исследование', pomodoros: 3 },
                    { title: 'Составить детальный план работы', pomodoros: 2 },
                    { title: 'Изучить научную литературу', pomodoros: 4 },
                    { title: 'Написать введение и основную часть', pomodoros: 8 },
                    { title: 'Написать заключение и выводы', pomodoros: 3 },
                    { title: 'Оформить работу и проверить', pomodoros: 3 }
                ]
            },
            thesis: {
                very_high: [
                    { title: 'Выбрать тему и провести анализ', pomodoros: 4 },
                    { title: 'Составить структуру работы', pomodoros: 2 },
                    { title: 'Изучить научные источники', pomodoros: 6 },
                    { title: 'Написать теоретическую часть', pomodoros: 8 },
                    { title: 'Провести практическое исследование', pomodoros: 10 },
                    { title: 'Написать практическую часть', pomodoros: 8 },
                    { title: 'Написать заключение', pomodoros: 4 },
                    { title: 'Оформить и проверить работу', pomodoros: 4 }
                ]
            },
            project: {
                low: [
                    { title: 'Планирование проекта', pomodoros: 1 },
                    { title: 'Реализация основных функций', pomodoros: 3 },
                    { title: 'Тестирование и доработка', pomodoros: 2 }
                ],
                medium: [
                    { title: 'Планирование и анализ требований', pomodoros: 2 },
                    { title: 'Проектирование решения', pomodoros: 3 },
                    { title: 'Реализация основной функциональности', pomodoros: 5 },
                    { title: 'Тестирование и отладка', pomodoros: 3 },
                    { title: 'Документация и финализация', pomodoros: 2 }
                ],
                high: [
                    { title: 'Детальное планирование и анализ', pomodoros: 3 },
                    { title: 'Проектирование архитектуры', pomodoros: 4 },
                    { title: 'Реализация базовой функциональности', pomodoros: 6 },
                    { title: 'Реализация расширенной функциональности', pomodoros: 6 },
                    { title: 'Тестирование всех компонентов', pomodoros: 4 },
                    { title: 'Оптимизация и рефакторинг', pomodoros: 3 },
                    { title: 'Документация и финализация', pomodoros: 3 }
                ]
            },
            learning: {
                low: [
                    { title: 'Подготовить материалы', pomodoros: 1 },
                    { title: 'Изучить основы', pomodoros: 2 },
                    { title: 'Практика', pomodoros: 2 }
                ],
                medium: [
                    { title: 'Подготовить материалы для изучения', pomodoros: 1 },
                    { title: 'Изучить базовые концепции', pomodoros: 3 },
                    { title: 'Практические упражнения', pomodoros: 4 },
                    { title: 'Повторение и закрепление', pomodoros: 2 }
                ],
                high: [
                    { title: 'Подготовить учебные материалы', pomodoros: 2 },
                    { title: 'Изучить базовые концепции', pomodoros: 4 },
                    { title: 'Изучить продвинутые темы', pomodoros: 4 },
                    { title: 'Практические упражнения', pomodoros: 5 },
                    { title: 'Решение сложных задач', pomodoros: 4 },
                    { title: 'Повторение и систематизация', pomodoros: 3 }
                ]
            },
            preparation: {
                medium: [
                    { title: 'Определить цели подготовки', pomodoros: 1 },
                    { title: 'Собрать необходимые материалы', pomodoros: 2 },
                    { title: 'Составить план подготовки', pomodoros: 1 },
                    { title: 'Изучить материал', pomodoros: 4 },
                    { title: 'Практика и закрепление', pomodoros: 3 }
                ]
            },
            writing: {
                low: [
                    { title: 'Подготовить материалы', pomodoros: 1 },
                    { title: 'Написать текст', pomodoros: 3 },
                    { title: 'Проверить и отредактировать', pomodoros: 1 }
                ],
                medium: [
                    { title: 'Исследовать тему', pomodoros: 2 },
                    { title: 'Составить план текста', pomodoros: 1 },
                    { title: 'Написать черновик', pomodoros: 4 },
                    { title: 'Отредактировать и улучшить', pomodoros: 2 },
                    { title: 'Проверить и финализировать', pomodoros: 1 }
                ],
                high: [
                    { title: 'Провести исследование темы', pomodoros: 3 },
                    { title: 'Составить детальный план', pomodoros: 2 },
                    { title: 'Написать введение и основную часть', pomodoros: 6 },
                    { title: 'Написать заключение', pomodoros: 2 },
                    { title: 'Редактирование и улучшение', pomodoros: 3 },
                    { title: 'Финальная проверка', pomodoros: 2 }
                ]
            },
            creation: {
                medium: [
                    { title: 'Планирование и концепция', pomodoros: 2 },
                    { title: 'Подготовка материалов', pomodoros: 1 },
                    { title: 'Создание основной части', pomodoros: 4 },
                    { title: 'Доработка и улучшение', pomodoros: 2 },
                    { title: 'Финализация', pomodoros: 1 }
                ]
            },
            general: {
                medium: [
                    { title: 'Подготовка и планирование', pomodoros: 1 },
                    { title: 'Основная работа', pomodoros: 3 },
                    { title: 'Проверка и завершение', pomodoros: 2 }
                ]
            }
        };

        // Выбираем план на основе типа и сложности
        const template = planTemplates[taskType];
        if (template) {
            const complexityKey = complexity === 'very_high' ? 'very_high' : 
                                 complexity === 'high' ? 'high' : 
                                 complexity === 'low' ? 'low' : 'medium';
            
            let plan = template[complexityKey] || template.medium || template.low || template.high;
            
            // Если нет плана для конкретной сложности, используем средний
            if (!plan) {
                plan = Object.values(template)[0];
            }
            
            subTasks = plan.map((step, idx) => ({
                id: baseId + idx + 1,
                title: step.title,
                estimatedPomodoros: Math.min(Math.max(step.pomodoros, 1), 10), // Ограничиваем 1-10
                completed: false,
                completedPomodoros: 0
            }));
        } else {
            // Fallback для неизвестных типов
            subTasks = [
                { id: baseId + 1, title: 'Подготовка и планирование', estimatedPomodoros: 1, completed: false, completedPomodoros: 0 },
                { id: baseId + 2, title: 'Основная работа', estimatedPomodoros: 3, completed: false, completedPomodoros: 0 },
                { id: baseId + 3, title: 'Проверка и завершение', estimatedPomodoros: 2, completed: false, completedPomodoros: 0 }
            ];
        }

        return subTasks;
    }

    async createTask(taskDescription, deadline = null, subTasks = null) {
        let finalSubTasks = subTasks;
        
        if (!finalSubTasks) {
            finalSubTasks = this.generateTaskPlanFallback(taskDescription);
        }

        let deadlineDate = undefined;
        if (deadline) {
            if (typeof deadline === 'string' && deadline.trim()) {
                const date = new Date(deadline);
                if (!isNaN(date.getTime())) {
                    deadlineDate = date.toISOString();
                } else {
                    deadlineDate = deadline;
                }
            } else {
                deadlineDate = deadline;
            }
        }
        
        const task = {
            id: Date.now().toString(),
            title: taskDescription,
            deadline: deadlineDate,
            subTasks: finalSubTasks,
            createdAt: new Date().toISOString(),
            totalPomodoros: finalSubTasks.reduce((sum, st) => sum + st.estimatedPomodoros, 0),
            completedPomodoros: 0
        };

        this.tasks.push(task);
        this.saveTasks(this.tasks);
        await this.syncWithBot();
        this.selectedTaskId = task.id;
        this.navigateTo('taskDetails');
    }

    isSubTaskCompleted(subTask) {
        return subTask.completedPomodoros >= subTask.estimatedPomodoros;
    }

    isTaskCompleted(task) {
        if (!task || !task.subTasks || task.subTasks.length === 0) {
            return false;
        }
        return task.subTasks.every(st => this.isSubTaskCompleted(st));
    }

    canStartPomodoroForSubTask(task, subTaskId) {
        if (!task || !task.subTasks || task.subTasks.length === 0) {
            return false;
        }
        
        const currentIndex = task.subTasks.findIndex(st => Number(st.id) === Number(subTaskId));
        if (currentIndex === -1) {
            return false;
        }
        
        const currentSubTask = task.subTasks[currentIndex];
        
        if (this.isSubTaskCompleted(currentSubTask)) {
            return false;
        }
        
        for (let i = 0; i < currentIndex; i++) {
            if (!this.isSubTaskCompleted(task.subTasks[i])) {
                return false;
            }
        }
        
        return true;
    }

    startPomodoro(taskId, subTaskId, focusText = null) {
        if (!taskId || !subTaskId) {
            console.error('startPomodoro: missing taskId or subTaskId', { taskId, subTaskId });
            return;
        }
        
        const task = this.tasks.find(t => String(t.id) === String(taskId));
        if (!task) {
            console.error('startPomodoro: task not found', { taskId });
            return;
        }
        
        const subTask = task.subTasks.find(st => Number(st.id) === Number(subTaskId));
        if (!subTask) {
            console.error('startPomodoro: subTask not found', { subTaskId });
            return;
        }
        
        if (this.isTaskCompleted(task)) {
            alert('Эта задача уже завершена! Все подзадачи выполнены.');
            return;
        }
        
        if (this.isSubTaskCompleted(subTask)) {
            alert('Эта подзадача уже завершена! Все сессии Pomodoro выполнены.');
            return;
        }
        
        if (!this.canStartPomodoroForSubTask(task, subTaskId)) {
            const firstIncomplete = task.subTasks.find(st => !this.isSubTaskCompleted(st));
            if (firstIncomplete) {
                alert(`Сначала завершите предыдущие подзадачи! Начните с подзадачи "${firstIncomplete.title}"`);
            } else {
                alert('Все подзадачи уже завершены!');
            }
            return;
        }
        
        this.activeTask = { taskId: String(taskId), subTaskId: Number(subTaskId), focusText: focusText || '' };
        this.timeLeft = Math.round((this.settings.pomodoroLength || 0.5) * 60);
        this.isRunning = false;
        this.isPaused = false;
        this.navigateTo('pomodoro');
    }

    startTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }
        this.isRunning = true;
        this.isPaused = false;
        console.log('Таймер запущен, timeLeft:', this.timeLeft);
        
        this.timerInterval = setInterval(() => {
            if (this.isRunning && !this.isPaused) {
                this.timeLeft--;
                console.log('Таймер тик, timeLeft:', this.timeLeft);
                if (this.timeLeft <= 0) {
                    console.log('Таймер завершен, вызываем completePomodoro');
                    clearInterval(this.timerInterval);
                    this.timerInterval = null;
                    this.completePomodoro();
                    return;
                }
            }
            this.updateTimerDisplay();
        }, 1000);
        this.renderApp();
    }

    pausePomodoro() {
        this.isPaused = !this.isPaused;
    }

    updateTimerDisplay() {
        if (this.currentView !== 'pomodoro' || !this.activeTask) {
            return;
        }
        
        const minutes = Math.floor(this.timeLeft / 60);
        const seconds = this.timeLeft % 60;
        const timeText = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        const timerTextElements = document.querySelectorAll('.timer-text');
        timerTextElements.forEach(el => {
            if (el.textContent !== timeText) {
                el.textContent = timeText;
            }
        });
        
        const totalTime = Math.round((this.settings.pomodoroLength || 0.5) * 60);
        const progress = totalTime > 0 ? Math.min(Math.max(((totalTime - this.timeLeft) / totalTime) * 100, 0), 100) : 0;
        const progressFillElements = document.querySelectorAll('.progress-fill');
        progressFillElements.forEach(el => {
            if (el.style.width !== `${progress}%`) {
                el.style.width = `${progress}%`;
            }
        });
    }

    cancelPomodoro() {
        if (this.activeTask?.focusText) {
            this.lastPomodoroFocus = this.activeTask.focusText;
            localStorage.setItem('lastPomodoroFocus', this.lastPomodoroFocus);
            console.log('Saved last pomodoro focus:', this.lastPomodoroFocus);
        }
        clearInterval(this.timerInterval);
        this.timerInterval = null;
        this.isRunning = false;
        this.isPaused = false;
        this.activeTask = null;
        this.navigateTo('home');
    }

    checkAndUnlockAchievements() {
        if (!Array.isArray(this.stats.achievements)) {
            this.stats.achievements = [];
        }

        const hasAchievement = (id) => {
            return this.stats.achievements.some(a => a && a.id === id);
        };

        const levelAchievements = {
            1: { id: 'first_steps', title: 'Первые шаги', icon: '🎯' },
            2: { id: 'level_2', title: 'Новичок', icon: '⭐' },
            3: { id: 'level_3', title: 'Опытный', icon: '🌟' },
            5: { id: 'level_5', title: 'Профессионал', icon: '💪' },
            10: { id: 'level_10', title: 'Мастер', icon: '👑' }
        };

        if (levelAchievements[this.stats.level] && !hasAchievement(levelAchievements[this.stats.level].id)) {
            this.stats.achievements.push(levelAchievements[this.stats.level]);
        }

        const conditionAchievements = [
            {
                id: 'first_steps',
                title: 'Первые шаги',
                icon: '🎯',
                check: () => this.stats.totalSessions >= 1 && !hasAchievement('first_steps')
            },
            {
                id: 'marathon',
                title: 'Марафонец',
                icon: '🏃',
                check: () => this.stats.totalFocusTime >= 600 && !hasAchievement('marathon')
            },
            {
                id: 'dedication',
                title: 'Преданность',
                icon: '🔥',
                check: () => this.stats.totalSessions >= 50 && !hasAchievement('dedication')
            },
            {
                id: 'streak_7',
                title: 'Неделя силы',
                icon: '📅',
                check: () => this.stats.currentStreak >= 7 && !hasAchievement('streak_7')
            },
            {
                id: 'streak_30',
                title: 'Месяц дисциплины',
                icon: '🗓️',
                check: () => this.stats.currentStreak >= 30 && !hasAchievement('streak_30')
            },
            {
                id: 'legend',
                title: 'Легенда',
                icon: '🏆',
                check: () => this.stats.totalFocusTime >= 6000 && !hasAchievement('legend')
            }
        ];

        conditionAchievements.forEach(ach => {
            if (ach.check()) {
                this.stats.achievements.push({ id: ach.id, title: ach.title, icon: ach.icon });
            }
        });
    }

    completePomodoro() {
        console.log('completePomodoro вызван');
        clearInterval(this.timerInterval);
        this.timerInterval = null;
        this.isRunning = false;
        this.timeLeft = 0;

        if (!this.stats) {
            this.stats = {
                totalSessions: 0,
                totalFocusTime: 0,
                currentStreak: 0,
                longestStreak: 0,
                level: 1,
                xp: 0,
                achievements: []
            };
        }

        const xpGained = 10;
        this.stats.totalSessions = (this.stats.totalSessions || 0) + 1;
        this.stats.totalFocusTime = (this.stats.totalFocusTime || 0) + (this.settings.pomodoroLength || 0.5);
        const oldLevel = this.stats.level || 1;
        this.stats.xp = (this.stats.xp || 0) + xpGained;
        this.stats.level = Math.floor(this.stats.xp / 100) + 1;
        const levelUp = this.stats.level > oldLevel;

        this.updateStreak();
        this.checkAndUnlockAchievements();

        console.log('Статистика после завершения сессии:', {
            totalSessions: this.stats.totalSessions,
            totalFocusTime: this.stats.totalFocusTime,
            xp: this.stats.xp,
            level: this.stats.level,
            currentStreak: this.stats.currentStreak,
            longestStreak: this.stats.longestStreak
        });

        this.saveStats(this.stats);

        if (this.activeTask?.taskId && this.activeTask?.subTaskId) {
            const task = this.tasks.find(t => String(t.id) === String(this.activeTask.taskId));
            if (task) {
                const subTask = task.subTasks.find(st => Number(st.id) === Number(this.activeTask.subTaskId));
                if (subTask) {
                    subTask.completedPomodoros++;
                    task.completedPomodoros++;
                    if (subTask.completedPomodoros >= subTask.estimatedPomodoros) {
                        subTask.completed = true;
                    }
                    this.saveTasks(this.tasks);
                }
            }
        }

        this.activeTask = null;
        this.renderApp();
        console.log('Показываем модальное окно завершения, xpGained:', xpGained, 'levelUp:', levelUp);
        this.showPomodoroCompleteModal(xpGained, levelUp);
        
        this.syncWithBot();
    }

    updateStreak() {
        const today = new Date().toDateString();
        const lastSessionDate = localStorage.getItem('lastPomodoroDate');
        
        if (this.stats.currentStreak === undefined || this.stats.currentStreak === null) {
            this.stats.currentStreak = 0;
        }
        if (this.stats.longestStreak === undefined || this.stats.longestStreak === null) {
            this.stats.longestStreak = 0;
        }
        
        if (!lastSessionDate) {
            this.stats.currentStreak = 1;
            localStorage.setItem('lastPomodoroDate', today);
        } else if (lastSessionDate === today) {
            localStorage.setItem('lastPomodoroDate', today);
        } else {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayString = yesterday.toDateString();
            
            if (lastSessionDate === yesterdayString) {
                this.stats.currentStreak = (this.stats.currentStreak || 0) + 1;
                localStorage.setItem('lastPomodoroDate', today);
            } else {
                this.stats.currentStreak = 1;
                localStorage.setItem('lastPomodoroDate', today);
            }
        }
        
        if (this.stats.currentStreak > this.stats.longestStreak) {
            this.stats.longestStreak = this.stats.currentStreak;
        }
        
        console.log('Streak updated:', {
            currentStreak: this.stats.currentStreak,
            longestStreak: this.stats.longestStreak,
            lastSessionDate: localStorage.getItem('lastPomodoroDate'),
            today: today
        });
    }

    getRandomExercise() {
        const exercises = [
            "💪 10 отжиманий",
            "🏃 20 приседаний",
            "🤸 30 секунд планки",
            "🧘 5 минут растяжки",
            "🚶 Пройдись по комнате 2 минуты",
            "👆 20 наклонов головы в стороны",
            "🔄 10 круговых движений плечами",
            "🦵 15 выпадов на каждую ногу",
            "🤲 10 подъемов на носки",
            "💨 Глубокое дыхание: 5 вдохов-выдохов",
            "👋 20 махов руками",
            "🦶 15 подъемов коленей"
        ];
        return exercises[Math.floor(Math.random() * exercises.length)];
    }

    showPomodoroCompleteModal(xpGained, levelUp) {
        console.log('showPomodoroCompleteModal вызван');
        const exercise = this.getRandomExercise();
        
        const existingModal = document.querySelector('.pomodoro-complete-modal');
        if (existingModal) {
            existingModal.remove();
        }
        
        const modal = document.createElement('div');
        modal.className = 'pomodoro-complete-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.6);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10000;
            animation: fadeIn 0.3s ease;
        `;

        const modalContent = document.createElement('div');
        modalContent.className = 'pomodoro-complete-modal-content';
        modalContent.style.cssText = `
            background: white;
            border-radius: 24px;
            padding: 32px;
            max-width: 400px;
            width: 90%;
            text-align: center;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            animation: slideUp 0.3s ease;
        `;

        let levelUpText = '';
        if (levelUp) {
            levelUpText = `<div style="color: var(--primary); font-weight: bold; margin-bottom: 16px; font-size: 18px;">🎉 Новый уровень! 🎉</div>`;
        }

        modalContent.innerHTML = `
            <div style="font-size: 64px; margin-bottom: 16px;">🎉</div>
            <h2 style="font-size: 24px; margin-bottom: 8px; color: var(--text);">Молодец!</h2>
            <p style="color: var(--text-secondary); margin-bottom: 24px;">Сессия завершена успешно</p>
            ${levelUpText}
            <div style="background: linear-gradient(135deg, var(--primary), var(--accent)); 
                        color: white; 
                        padding: 16px; 
                        border-radius: 12px; 
                        margin-bottom: 24px;">
                <div style="font-size: 14px; opacity: 0.9; margin-bottom: 4px;">Получено XP</div>
                <div style="font-size: 32px; font-weight: bold;">+${xpGained}</div>
            </div>
            <div style="background: var(--background-secondary); 
                        padding: 20px; 
                        border-radius: 12px; 
                        margin-bottom: 24px;">
                <div style="font-size: 16px; font-weight: 600; margin-bottom: 12px; color: var(--text);">
                    ⏰ Отдохни 5 минут
                </div>
                <div style="font-size: 14px; color: var(--text-secondary); margin-bottom: 16px;">
                    Предлагаем сделать физ разминку:
                </div>
                <div style="font-size: 18px; font-weight: 600; color: var(--primary);">
                    ${exercise}
                </div>
            </div>
            <button class="btn primary" style="width: 100%;" id="closePomodoroModal">
                Продолжить
            </button>
        `;

        modal.appendChild(modalContent);
        document.body.appendChild(modal);

        const closeModal = () => {
            console.log('Закрываем модальное окно');
            if (document.body.contains(modal)) {
                document.body.removeChild(modal);
            }
            this.navigateTo('home');
        };

        setTimeout(() => {
            const closeBtn = document.getElementById('closePomodoroModal');
            if (closeBtn) {
                closeBtn.addEventListener('click', closeModal);
            }
            modal.addEventListener('click', (e) => {
                if (e.target === modal) closeModal();
            });
        }, 100);
        
        console.log('Модальное окно добавлено в DOM');
    }

    startQuickPomodoro() {
        console.log('startQuickPomodoro called, activeTask exists:', !!this.activeTask);
        if (this.activeTask) {
            this.navigateTo('pomodoro');
        } else {
            this.showQuickPomodoroModal();
        }
    }

    deleteTask(taskId) {
        if (!taskId) {
            console.error('deleteTask: taskId is missing');
            return;
        }
        const idStr = String(taskId);
        const beforeCount = this.tasks.length;
        console.log('deleteTask before filter:', { taskId: idStr, tasks: this.tasks.map(t => ({ id: String(t.id), title: t.title })) });
        
        const originalTasks = [...this.tasks];
        this.tasks = this.tasks.filter(t => {
            const taskIdStr = String(t.id);
            const shouldKeep = taskIdStr !== idStr;
            console.log('Filtering task:', { taskId: taskIdStr, shouldKeep, match: taskIdStr === idStr });
            return shouldKeep;
        });
        
        const afterCount = this.tasks.length;
        console.log('deleteTask after filter:', { 
            taskId: idStr, 
            beforeCount, 
            afterCount, 
            deleted: beforeCount > afterCount,
            originalTasks: originalTasks.map(t => String(t.id)),
            remainingTasks: this.tasks.map(t => String(t.id))
        });
        
        if (beforeCount === afterCount) {
            console.error('deleteTask: Task was not deleted!', { 
                taskId: idStr, 
                allTaskIds: this.tasks.map(t => String(t.id)),
                originalTaskIds: originalTasks.map(t => String(t.id))
            });
            alert('Ошибка: задача не была удалена. Проверьте консоль для деталей.');
            return;
        }
        
        this.saveTasks(this.tasks);
        this.syncWithBot();
        if (this.selectedTaskId === idStr) {
            this.selectedTaskId = null;
            this.navigateTo('home');
        } else {
            this.renderApp();
        }
    }

    showDeleteTaskConfirm(taskId) {
        const modal = document.createElement('div');
        modal.className = 'confirm-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        `;
        
        const modalContent = document.createElement('div');
        modalContent.className = 'confirm-modal-content';
        modalContent.style.cssText = `
            background: white;
            padding: 24px;
            border-radius: 12px;
            max-width: 400px;
            width: 90%;
        `;
        
        modalContent.innerHTML = `
            <h2 style="margin-bottom: 16px;">Удалить задачу?</h2>
            <p style="margin-bottom: 24px; color: #666;">Это действие нельзя отменить.</p>
            <div style="display: flex; gap: 12px;">
                <button class="btn primary" id="confirmDeleteTask" style="flex: 1; background: var(--error);">Удалить</button>
                <button class="btn secondary" id="cancelDeleteTask" style="flex: 1;">Отмена</button>
            </div>
        `;
        
        modal.appendChild(modalContent);
        document.body.appendChild(modal);
        
        const confirmBtn = document.getElementById('confirmDeleteTask');
        const cancelBtn = document.getElementById('cancelDeleteTask');
        
        const closeModal = () => {
            if (document.body.contains(modal)) {
                document.body.removeChild(modal);
            }
        };
        
        confirmBtn.addEventListener('click', () => {
            console.log('Calling deleteTask with:', taskId);
            this.deleteTask(taskId);
            closeModal();
        });
        
        cancelBtn.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
    }

    showDeleteSubTaskConfirm(taskId, subTaskId) {
        const modal = document.createElement('div');
        modal.className = 'confirm-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        `;
        
        const modalContent = document.createElement('div');
        modalContent.className = 'confirm-modal-content';
        modalContent.style.cssText = `
            background: white;
            padding: 24px;
            border-radius: 12px;
            max-width: 400px;
            width: 90%;
        `;
        
        modalContent.innerHTML = `
            <h2 style="margin-bottom: 16px;">Удалить действие из плана?</h2>
            <p style="margin-bottom: 24px; color: #666;">Это действие нельзя отменить.</p>
            <div style="display: flex; gap: 12px;">
                <button class="btn primary" id="confirmDeleteSubTask" style="flex: 1; background: var(--error);">Удалить</button>
                <button class="btn secondary" id="cancelDeleteSubTask" style="flex: 1;">Отмена</button>
            </div>
        `;
        
        modal.appendChild(modalContent);
        document.body.appendChild(modal);
        
        const confirmBtn = document.getElementById('confirmDeleteSubTask');
        const cancelBtn = document.getElementById('cancelDeleteSubTask');
        
        const closeModal = () => {
            if (document.body.contains(modal)) {
                document.body.removeChild(modal);
            }
        };
        
        confirmBtn.addEventListener('click', () => {
            this.deleteSubTask(taskId, subTaskId);
            closeModal();
        });
        
        cancelBtn.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
    }

    deleteSubTask(taskId, subTaskId) {
        const task = this.tasks.find(t => String(t.id) === String(taskId));
        if (!task) return;
        
        const subTask = task.subTasks.find(st => Number(st.id) === Number(subTaskId));
        if (!subTask) return;

        const oldPomodoros = subTask.estimatedPomodoros;
        const oldCompleted = subTask.completedPomodoros;
        task.subTasks = task.subTasks.filter(st => Number(st.id) !== Number(subTaskId));
        
        task.totalPomodoros = task.totalPomodoros - oldPomodoros;
        task.completedPomodoros = Math.max(0, task.completedPomodoros - oldCompleted);
        
        this.saveTasks(this.tasks);
        this.syncWithBot();
        this.renderApp();
    }

    showQuickPomodoroModal() {
        const modal = document.createElement('div');
        modal.className = 'focus-input-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        `;
        
        const modalContent = document.createElement('div');
        modalContent.className = 'focus-input-modal-content';
        modalContent.style.cssText = `
            background: white;
            padding: 24px;
            border-radius: 12px;
            max-width: 400px;
            width: 90%;
        `;
        
        modalContent.innerHTML = `
            <h2 style="margin-bottom: 16px;">На что фокус?</h2>
            <label style="display: block; margin-bottom: 8px; font-weight: 600;">Опиши задачу для фокуса:</label>
            <input type="text" id="focusInput" value="${this.lastPomodoroFocus || ''}" placeholder="Например: Изучить новую тему" style="width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 8px; margin-bottom: 16px; font-size: 16px;">
            <div style="display: flex; gap: 12px;">
                <button class="btn primary" id="startQuickFocusPomodoro" style="flex: 1;">Начать Pomodoro</button>
                <button class="btn secondary" id="cancelQuickFocusInput" style="flex: 1;">Отмена</button>
            </div>
        `;
        
        modal.appendChild(modalContent);
        document.body.appendChild(modal);
        
        const focusInput = document.getElementById('focusInput');
        setTimeout(() => focusInput.focus(), 100);
        
        const startBtn = document.getElementById('startQuickFocusPomodoro');
        const cancelBtn = document.getElementById('cancelQuickFocusInput');
        
        const closeModal = () => {
            if (document.body.contains(modal)) {
                document.body.removeChild(modal);
            }
        };
        
        const startPomodoro = () => {
            const focusText = document.getElementById('focusInput').value.trim();
            if (!focusText) {
                alert('Пожалуйста, введите задачу для фокуса');
                return;
            }
            
            this.lastPomodoroFocus = focusText;
            localStorage.setItem('lastPomodoroFocus', focusText);
            this.activeTask = { focusText: focusText };
            this.timeLeft = Math.round((this.settings.pomodoroLength || 0.5) * 60);
            this.isRunning = false;
            this.isPaused = false;
            
            closeModal();
            this.navigateTo('pomodoro');
        };
        
        startBtn.addEventListener('click', startPomodoro);
        cancelBtn.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
    }

    showFocusInputModal() {
        const modal = document.createElement('div');
        modal.className = 'focus-input-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        `;
        
        const modalContent = document.createElement('div');
        modalContent.className = 'focus-input-modal-content';
        modalContent.style.cssText = `
            background: white;
            padding: 24px;
            border-radius: 12px;
            max-width: 400px;
            width: 90%;
        `;
        
        modalContent.innerHTML = `
            <h2 style="margin-bottom: 16px;">На что фокус?</h2>
            <label style="display: block; margin-bottom: 8px; font-weight: 600;">Опиши задачу для фокуса:</label>
            <input type="text" id="focusInput" value="${this.lastPomodoroFocus || ''}" placeholder="Например: Изучить новую тему" style="width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 8px; margin-bottom: 16px; font-size: 16px;">
            <div style="display: flex; gap: 12px;">
                <button class="btn primary" id="startFocusPomodoro" style="flex: 1;">Начать Pomodoro</button>
                <button class="btn secondary" id="cancelFocusInput" style="flex: 1;">Отмена</button>
            </div>
        `;
        
        modal.appendChild(modalContent);
        document.body.appendChild(modal);
        
        const focusInput = document.getElementById('focusInput');
        setTimeout(() => focusInput.focus(), 100);
        
        const startBtn = document.getElementById('startFocusPomodoro');
        const cancelBtn = document.getElementById('cancelFocusInput');
        
        const closeModal = () => {
            if (document.body.contains(modal)) {
                document.body.removeChild(modal);
            }
        };
        
        const startPomodoro = () => {
            const focusText = document.getElementById('focusInput').value.trim();
            if (!focusText) {
                alert('Пожалуйста, введите задачу для фокуса');
                return;
            }
            
            this.lastPomodoroFocus = focusText;
            localStorage.setItem('lastPomodoroFocus', focusText);
            
            if (this.tasks.length > 0) {
                const lastTask = this.tasks[this.tasks.length - 1];
                if (lastTask && lastTask.subTasks.length > 0) {
                    const activeSubTask = lastTask.subTasks.find(st => !st.completed) || lastTask.subTasks[0];
                    this.startPomodoro(lastTask.id, activeSubTask.id, focusText);
                } else {
                    this.createTask(focusText).then(() => {
                        const newTask = this.tasks[this.tasks.length - 1];
                        if (newTask && newTask.subTasks.length > 0) {
                            this.startPomodoro(newTask.id, newTask.subTasks[0].id, focusText);
                        }
                    });
                }
            } else {
                this.createTask(focusText).then(() => {
                    const newTask = this.tasks[this.tasks.length - 1];
                    if (newTask && newTask.subTasks.length > 0) {
                        this.startPomodoro(newTask.id, newTask.subTasks[0].id, focusText);
                    }
                });
            }
            closeModal();
        };
        
        startBtn.addEventListener('click', startPomodoro);
        cancelBtn.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
        
        focusInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                startPomodoro();
            }
        });
    }

    editSubTask(taskId, subTaskId) {
        const task = this.tasks.find(t => String(t.id) === String(taskId));
        if (!task) return;
        
        const subTask = task.subTasks.find(st => Number(st.id) === Number(subTaskId));
        if (!subTask) return;

        const modal = document.createElement('div');
        modal.className = 'edit-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        `;
        
        const modalContent = document.createElement('div');
        modalContent.className = 'edit-modal-content';
        modalContent.style.cssText = `
            background: white;
            padding: 24px;
            border-radius: 12px;
            max-width: 400px;
            width: 90%;
        `;
        
        modalContent.innerHTML = `
            <h2 style="margin-bottom: 16px;">Редактировать подзадачу</h2>
            <label style="display: block; margin-bottom: 8px; font-weight: 600;">Название:</label>
            <input type="text" id="editSubTaskTitle" value="${subTask.title}" style="width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 8px; margin-bottom: 16px; font-size: 16px;">
            <label style="display: block; margin-bottom: 8px; font-weight: 600;">Количество pomodoro сессий:</label>
            <input type="number" id="editSubTaskPomodoros" value="${subTask.estimatedPomodoros}" min="1" style="width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 8px; margin-bottom: 16px; font-size: 16px;">
            <div style="display: flex; gap: 12px;">
                <button class="btn primary" id="saveEditSubTask" style="flex: 1;">Сохранить</button>
                <button class="btn secondary" id="cancelEditSubTask" style="flex: 1;">Отмена</button>
            </div>
        `;
        
        modal.appendChild(modalContent);
        document.body.appendChild(modal);
        
        const titleInput = document.getElementById('editSubTaskTitle');
        setTimeout(() => titleInput.focus(), 100);
        
        const saveBtn = document.getElementById('saveEditSubTask');
        const cancelBtn = document.getElementById('cancelEditSubTask');
        
        const closeModal = () => {
            document.body.removeChild(modal);
        };
        
        const saveChanges = () => {
            const newTitle = document.getElementById('editSubTaskTitle').value.trim();
            const newPomodoros = parseInt(document.getElementById('editSubTaskPomodoros').value);
            
            if (newTitle) {
                subTask.title = newTitle;
            }
            
            if (!isNaN(newPomodoros) && newPomodoros > 0) {
                const oldPomodoros = subTask.estimatedPomodoros;
                subTask.estimatedPomodoros = newPomodoros;
                task.totalPomodoros = task.totalPomodoros - oldPomodoros + newPomodoros;
            }
            
            this.saveTasks(this.tasks);
            this.syncWithBot();
            this.renderApp();
            closeModal();
        };
        
        saveBtn.addEventListener('click', saveChanges);
        cancelBtn.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
        
        titleInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                document.getElementById('editSubTaskPomodoros').focus();
            }
        });
        
        document.getElementById('editSubTaskPomodoros').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                saveChanges();
            }
        });
    }

    renderOnboarding() {
        return `
            <div class="app-container">
                <div class="container">
                    <div class="flex column center" style="text-align: center; margin-bottom: 32px;">
                        <div style="font-size: 80px; margin-bottom: 16px;">🎯</div>
                        <h1 class="title">Добро пожаловать в FocusHelper!</h1>
                        <p class="body">Настроим Pomodoro под тебя для максимальной продуктивности.</p>
                    </div>

                    <div class="panel">
                        <div class="label">Сколько часов в день ты готов уделять задачам?</div>
                        <div class="grid cols-3 gap-12">
                            <button class="btn secondary ${Number(this.settings.dailyHours) === 2 ? 'selected' : ''}" data-action="setDailyHours" data-value="2">2 часа</button>
                            <button class="btn secondary ${Number(this.settings.dailyHours) === 4 ? 'selected' : ''}" data-action="setDailyHours" data-value="4">4 часа</button>
                            <button class="btn secondary ${Number(this.settings.dailyHours) === 6 ? 'selected' : ''}" data-action="setDailyHours" data-value="6">6+ часов</button>
                        </div>
                    </div>

                    <div class="panel">
                        <div class="label">В какое время ты наиболее продуктивен?</div>
                        <div class="grid cols-2 gap-12">
                            <button class="btn secondary ${String(this.settings.productiveTime) === 'morning' ? 'selected' : ''}" data-action="setProductiveTime" data-value="morning">🌅 Утро</button>
                            <button class="btn secondary ${String(this.settings.productiveTime) === 'afternoon' ? 'selected' : ''}" data-action="setProductiveTime" data-value="afternoon">☀️ День</button>
                            <button class="btn secondary ${String(this.settings.productiveTime) === 'evening' ? 'selected' : ''}" data-action="setProductiveTime" data-value="evening">🌆 Вечер</button>
                            <button class="btn secondary ${String(this.settings.productiveTime) === 'night' ? 'selected' : ''}" data-action="setProductiveTime" data-value="night">🌙 Ночь</button>
                        </div>
                    </div>

                    <div class="panel">
                        <div class="label">Длина сессии Pomodoro</div>
                        <div class="grid cols-3 gap-12">
                            <button class="btn secondary ${Number(this.settings.pomodoroLength) === 25 ? 'selected' : ''}" data-action="setPomodoro" data-value="25">25 мин</button>
                            <button class="btn secondary ${Number(this.settings.pomodoroLength) === 50 ? 'selected' : ''}" data-action="setPomodoro" data-value="50">50 мин</button>
                            <button class="btn secondary ${Number(this.settings.pomodoroLength) === 90 ? 'selected' : ''}" data-action="setPomodoro" data-value="90">90 мин</button>
                        </div>
                    </div>

                    <button class="btn primary" data-action="completeOnboarding">Начать!</button>
                </div>
                ${this.renderNavigation()}
            </div>
        `;
    }

    renderHome() {
        const taskList = this.tasks.map(task => {
            const isTaskDone = this.isTaskCompleted(task);
            return `
            <div class="task-item" ${isTaskDone ? 'style="opacity: 0.7;"' : ''}>
                <div class="task-item-header">
                    <div class="flex center">
                        <div class="emoji-icon">📝</div>
                        <div class="task-item-content">
                            <div class="task-item-title">
                                ${task.title} ${isTaskDone ? '✅' : ''}
                            </div>
                            <div class="task-item-meta">${task.subTasks.length} шагов • ${task.completedPomodoros}/${task.totalPomodoros} сессий ${isTaskDone ? '• Завершено' : ''}</div>
                        </div>
                    </div>
                    ${!isTaskDone ? `
                    <div class="flex gap-8">
                        <button class="icon-btn" data-action="viewTask" data-id="${task.id}" title="Просмотр">👁️</button>
                        <button class="icon-btn" data-action="deleteTask" data-id="${task.id}" title="Удалить">🗑️</button>
                    </div>
                    ` : ''}
                </div>
                <div class="progress-bar" style="margin-top: 12px;">
                    <div class="progress-fill" style="width: ${Math.min((task.completedPomodoros / task.totalPomodoros) * 100, 100)}%;"></div>
                </div>
            </div>
        `;
        }).join('');

        return `
            <div class="app-container">
                <div class="container">
                    <h1 class="title">Твои задачи</h1>
                    <button class="btn primary" data-action="createTask" style="margin-bottom: 16px;">+ Создать задачу</button>
                    <div class="task-list">${taskList || '<p class="caption">Нет задач. Создай первую!</p>'}</div>
                </div>
                ${this.renderNavigation()}
            </div>
        `;
    }

    renderCreateTask() {
        const today = new Date();
        const minDate = today.toISOString().split('T')[0];
        
        return `
            <div class="app-container">
                <div class="container">
                    <h1 class="title">Создать задачу</h1>
                    <div class="panel">
                        <label class="label">Опиши задачу</label>
                        <textarea class="input text-area" id="taskDescription" placeholder="Например: Подготовиться к экзамену по математике"></textarea>
                        <label class="label">Дедлайн (опционально)</label>
                        <input type="date" class="input" id="deadline" min="${minDate}" style="font-size: 16px;">
                        <button class="btn primary" id="analyzeTaskBtn" data-action="analyzeTask" style="margin-top: 16px;">
                            <span id="analyzeTaskText">🤖 Разобрать с AI</span>
                            <span id="analyzeTaskLoader" style="display: none;">⏳ Генерирую план...</span>
                        </button>
                        <div id="generatedPlan" style="margin-top: 16px;"></div>
                        <button class="btn primary" id="saveTask" style="display: none; margin-top: 16px;" data-action="saveTask">Сохранить план</button>
                    </div>
                    <div class="panel" style="margin-top: 16px; padding: 16px; background: var(--background-secondary);">
                        <div class="caption" style="opacity: 0.7;">
                            💡 <strong>Совет:</strong> Используется умная логика для автоматической генерации плана на основе описания задачи. 
                            Система анализирует тип задачи, сложность и создает оптимальный план действий.
                        </div>
                    </div>
                </div>
                ${this.renderNavigation()}
            </div>
        `;
    }

    renderTaskDetails(taskId) {
        const task = this.tasks.find(t => t.id === taskId);
        if (!task) return this.renderHome();

        const isTaskDone = this.isTaskCompleted(task);
        const subTasksList = task.subTasks.map((st, index) => {
            const isSubTaskDone = this.isSubTaskCompleted(st);
            const canStart = this.canStartPomodoroForSubTask(task, st.id);
            return `
            <div class="task-item" data-subtask-id="${st.id}" ${isSubTaskDone ? 'style="opacity: 0.7;"' : ''}>
                <div class="task-item-header">
                    <div class="flex center" style="flex: 1;">
                        <div class="task-item-number">${index + 1}</div>
                        <div class="task-item-content" style="flex: 1;">
                            <div class="task-item-title editable-title" data-editable="true" data-subtask-id="${st.id}">
                                ${st.title} ${isSubTaskDone ? '✅' : ''}
                            </div>
                            <div class="task-item-meta">🍅 ${st.completedPomodoros}/${st.estimatedPomodoros} сессий ${isSubTaskDone ? '(Завершено)' : !canStart ? '(Сначала завершите предыдущие)' : ''}</div>
                        </div>
                    </div>
                    ${!isSubTaskDone && !isTaskDone ? `
                    <div class="flex gap-8">
                        <button class="icon-btn" data-action="editSubTask" data-task-id="${task.id}" data-subtask-id="${st.id}" title="Редактировать">✏️</button>
                        <button class="icon-btn" data-action="deleteSubTask" data-task-id="${task.id}" data-subtask-id="${st.id}" title="Удалить">🗑️</button>
                    </div>
                    ` : ''}
                </div>
                ${!isSubTaskDone && !isTaskDone ? `
                <div style="margin-top: 12px; display: flex; justify-content: flex-end;">
                    ${canStart ? `
                    <button class="btn primary" style="padding: 8px 12px; font-size: 14px;" data-action="startPomodoro" data-task="${task.id}" data-subtask="${st.id}">▶️ Начать</button>
                    ` : `
                    <button class="btn secondary" style="padding: 8px 12px; font-size: 14px; opacity: 0.5; cursor: not-allowed;" disabled title="Сначала завершите предыдущие подзадачи">⏸️ Заблокировано</button>
                    `}
                </div>
                ` : ''}
                ${st.completedPomodoros > 0 ? `
                    <div class="progress-bar" style="margin-top: 12px;">
                        <div class="progress-fill" style="width: ${Math.min((st.completedPomodoros / st.estimatedPomodoros) * 100, 100)}%;"></div>
                    </div>
                ` : ''}
            </div>
        `;
        }).join('');

        return `
            <div class="app-container">
                <div class="container">
                    <div class="flex between center" style="margin-bottom: 16px;">
                        <div style="flex: 1;">
                            <button class="btn tertiary" data-action="navigate" data-view="home" style="padding: 8px 16px; font-size: 14px; width: auto; margin-bottom: 8px;">← Назад</button>
                            <h1 class="title" style="margin-bottom: 0;">${task.title}</h1>
                        </div>
                    </div>
                    ${task.deadline ? `<p class="subtitle" style="margin-top: 8px;">📅 Дедлайн: ${new Date(task.deadline).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</p>` : ''}
                    <div class="panel">
                        <div class="flex between center" style="margin-bottom: 12px;">
                            <div class="body">Прогресс</div>
                            <div class="progress-percentage">${Math.round((task.completedPomodoros / task.totalPomodoros) * 100)}%</div>
                        </div>
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${ (task.completedPomodoros / task.totalPomodoros) * 100 }%;"></div>
                        </div>
                        <div class="grid cols-3 gap-12" style="margin-top: 16px;">
                            <div class="stat-box">
                                <div class="stat-value">${task.completedPomodoros}</div>
                                <div class="stat-label">Завершено</div>
                            </div>
                            <div class="stat-box">
                                <div class="stat-value">${task.totalPomodoros - task.completedPomodoros}</div>
                                <div class="stat-label">Осталось</div>
                            </div>
                            <div class="stat-box">
                                <div class="stat-value">${task.subTasks.filter(st => st.completed).length}/${task.subTasks.length}</div>
                                <div class="stat-label">Шаги</div>
                            </div>
                        </div>
                    </div>
                    <div class="panel">
                        <h2 class="subtitle" style="margin-bottom: 16px;">
                            План действий 
                            ${isTaskDone ? '<span style="color: var(--primary); font-size: 14px;">✅ Завершено</span>' : ''}
                        </h2>
                        <div class="task-list">${subTasksList}</div>
                    </div>
                </div>
                ${this.renderNavigation()}
            </div>
        `;
    }

    renderPomodoro() {
        if (!this.activeTask) return this.renderHome();

        const isQuickPomodoro = !this.activeTask.taskId || !this.activeTask.subTaskId;
        
        let focusText = 'Фокус';
        if (isQuickPomodoro) {
            focusText = this.activeTask.focusText || 'Фокус';
        } else {
            const task = this.tasks.find(t => String(t.id) === String(this.activeTask.taskId));
            const subTask = task?.subTasks.find(st => Number(st.id) === Number(this.activeTask.subTaskId));
            focusText = this.activeTask.focusText || (subTask ? subTask.title : 'Фокус');
            
            if (!task || !subTask) {
                console.error('renderPomodoro: task or subTask not found', { 
                    taskId: this.activeTask.taskId, 
                    subTaskId: this.activeTask.subTaskId,
                    tasks: this.tasks.map(t => ({ id: t.id, title: t.title }))
                });
                return this.renderHome();
            }
        }

        const minutes = Math.floor(this.timeLeft / 60);
        const seconds = this.timeLeft % 60;
        const totalTime = Math.round((this.settings.pomodoroLength || 0.5) * 60);
        const progress = totalTime > 0 ? Math.min(Math.max(((totalTime - this.timeLeft) / totalTime) * 100, 0), 100) : 0;

        if (!this.isRunning && !this.isPaused) {
            return `
                <div class="app-container">
                    <div class="container flex column center" style="text-align: center;">
                        <div class="flex center" style="margin-bottom: 16px;">
                            <div class="emoji-icon">🍅</div>
                            <div class="body">Фокус на: ${focusText}</div>
                        </div>
                        <div class="timer-container">
                            <div class="timer-circle">
                                <div class="timer-text">${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}</div>
                                <div class="timer-label">Готов начать?</div>
                            </div>
                        </div>
                        <div class="flex gap-16" style="margin-top: 24px;">
                            <button class="btn primary" data-action="startTimer" style="min-width: 200px;">▶️ Начать Pomodoro</button>
                        </div>
                        <div class="flex gap-16" style="margin-top: 16px;">
                            <button class="btn secondary" data-action="cancelPomodoro" style="min-width: 200px;">❌ Отмена</button>
                        </div>
                    </div>
                    ${this.renderNavigation()}
                </div>
            `;
        }

        return `
            <div class="app-container">
                <div class="container flex column center" style="text-align: center;">
                    <div class="flex center" style="margin-bottom: 16px;">
                        <div class="emoji-icon">🍅</div>
                        <div class="body">Фокус на: ${focusText}</div>
                    </div>
                    <div class="timer-container ${this.isRunning && !this.isPaused ? 'pulsing' : ''}">
                        <div class="timer-circle">
                            <div class="timer-text">${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}</div>
                            <div class="timer-label">${this.isPaused ? 'Пауза' : 'Фокус-режим'}</div>
                        </div>
                    </div>
                    <div class="progress-bar" style="width: 100%; max-width: 280px; margin: 16px 0;">
                        <div class="progress-fill" style="width: ${progress}%;"></div>
                    </div>
                    <div class="flex gap-16">
                        <button class="btn primary" data-action="pausePomodoro" style="min-width: 120px;">
                            ${this.isPaused ? '▶️ Продолжить' : '⏸️ Пауза'}
                        </button>
                        <button class="btn secondary" data-action="cancelPomodoro" style="min-width: 120px;">❌ Отмена</button>
                    </div>
                    <p class="caption" style="margin-top: 16px;">Сосредоточься! Уведомлю по завершении.</p>
                </div>
                ${this.renderNavigation()}
            </div>
        `;
    }

    renderSettings() {
        
        return `
            <div class="app-container">
                <div class="container">
                    <div class="flex column center" style="text-align: center; margin-bottom: 32px;">
                        <div style="font-size: 80px; margin-bottom: 16px;">⚙️</div>
                        <h1 class="title">Настройки Pomodoro</h1>
                        <p class="body">Настрой Pomodoro под себя для максимальной продуктивности.</p>
                    </div>

                    <div class="panel">
                        <div class="label">Сколько часов в день ты готов уделять задачам?</div>
                        <div class="grid cols-3 gap-12">
                            <button class="btn secondary ${Number(this.settings.dailyHours) === 2 ? 'selected' : ''}" data-action="setDailyHours" data-value="2">2 часа</button>
                            <button class="btn secondary ${Number(this.settings.dailyHours) === 4 ? 'selected' : ''}" data-action="setDailyHours" data-value="4">4 часа</button>
                            <button class="btn secondary ${Number(this.settings.dailyHours) === 6 ? 'selected' : ''}" data-action="setDailyHours" data-value="6">6+ часов</button>
                        </div>
                    </div>

                    <div class="panel">
                        <div class="label">В какое время ты наиболее продуктивен?</div>
                        <div class="grid cols-2 gap-12">
                            <button class="btn secondary ${String(this.settings.productiveTime) === 'morning' ? 'selected' : ''}" data-action="setProductiveTime" data-value="morning">🌅 Утро</button>
                            <button class="btn secondary ${String(this.settings.productiveTime) === 'afternoon' ? 'selected' : ''}" data-action="setProductiveTime" data-value="afternoon">☀️ День</button>
                            <button class="btn secondary ${String(this.settings.productiveTime) === 'evening' ? 'selected' : ''}" data-action="setProductiveTime" data-value="evening">🌆 Вечер</button>
                            <button class="btn secondary ${String(this.settings.productiveTime) === 'night' ? 'selected' : ''}" data-action="setProductiveTime" data-value="night">🌙 Ночь</button>
                        </div>
                    </div>

                    <div class="panel">
                        <div class="label">Длина сессии Pomodoro</div>
                        <div class="grid cols-3 gap-12">
                            <button class="btn secondary ${Number(this.settings.pomodoroLength) === 25 ? 'selected' : ''}" data-action="setPomodoro" data-value="25">25 мин</button>
                            <button class="btn secondary ${Number(this.settings.pomodoroLength) === 50 ? 'selected' : ''}" data-action="setPomodoro" data-value="50">50 мин</button>
                            <button class="btn secondary ${Number(this.settings.pomodoroLength) === 90 ? 'selected' : ''}" data-action="setPomodoro" data-value="90">90 мин</button>
                        </div>
                    </div>

                    <button class="btn primary" data-action="saveSettings">💾 Сохранить настройки</button>
                </div>
                ${this.renderNavigation()}
            </div>
        `;
    }

    renderStatistics() {
        console.log('renderStatistics called, current stats:', this.stats);
        
        const savedStats = localStorage.getItem('focus_stats');
        if (savedStats) {
            try {
                const parsed = JSON.parse(savedStats);
                console.log('Loaded stats from localStorage:', parsed);
                this.stats = { ...this.stats, ...parsed };
            } catch (e) {
                console.error('Error parsing stats:', e);
            }
        }
        
        if (!this.stats) {
            this.stats = {
                totalSessions: 0,
                totalFocusTime: 0,
                currentStreak: 0,
                longestStreak: 0,
                level: 1,
                xp: 0,
                achievements: []
            };
        }
        
        if (!Array.isArray(this.stats.achievements)) {
            this.stats.achievements = [];
        }
        
        this.stats.totalSessions = this.stats.totalSessions || 0;
        this.stats.totalFocusTime = this.stats.totalFocusTime || 0;
        this.stats.currentStreak = this.stats.currentStreak || 0;
        this.stats.longestStreak = this.stats.longestStreak || 0;
        this.stats.level = this.stats.level || 1;
        this.stats.xp = this.stats.xp || 0;
        
        this.checkAndUnlockAchievements();
        
        console.log('Using stats for render:', this.stats);
        
        const hours = Math.floor(this.stats.totalFocusTime / 60);
        const minutes = this.stats.totalFocusTime % 60;
        const levelProgress = this.stats.xp % 100;

        const hasAchievement = (id) => {
            return Array.isArray(this.stats.achievements) && 
                this.stats.achievements.some(a => a && a.id === id);
        };

        const allAchievements = [
            { 
                id: 'first_steps', 
                title: 'Первые шаги', 
                icon: '🎯',
                description: 'Заверши первую сессию',
                unlockLevel: 1
            },
            { 
                id: 'level_2', 
                title: 'Новичок', 
                icon: '⭐',
                description: 'Достигни 2 уровня',
                unlockLevel: 2
            },
            { 
                id: 'level_3', 
                title: 'Опытный', 
                icon: '🌟',
                description: 'Достигни 3 уровня',
                unlockLevel: 3
            },
            { 
                id: 'level_5', 
                title: 'Профессионал', 
                icon: '💪',
                description: 'Достигни 5 уровня',
                unlockLevel: 5
            },
            { 
                id: 'level_10', 
                title: 'Мастер', 
                icon: '👑',
                description: 'Достигни 10 уровня',
                unlockLevel: 10
            },
            { 
                id: 'marathon', 
                title: 'Марафонец', 
                icon: '🏃',
                description: '10 часов фокуса',
                unlockLevel: 3,
                checkCondition: () => this.stats.totalFocusTime >= 600
            },
            { 
                id: 'dedication', 
                title: 'Преданность', 
                icon: '🔥',
                description: '50 завершенных сессий',
                unlockLevel: 4,
                checkCondition: () => this.stats.totalSessions >= 50
            },
            { 
                id: 'streak_7', 
                title: 'Неделя силы', 
                icon: '📅',
                description: '7 дней подряд',
                unlockLevel: 2,
                checkCondition: () => this.stats.currentStreak >= 7
            },
            { 
                id: 'streak_30', 
                title: 'Месяц дисциплины', 
                icon: '🗓️',
                description: '30 дней подряд',
                unlockLevel: 6,
                checkCondition: () => this.stats.currentStreak >= 30
            },
            { 
                id: 'legend', 
                title: 'Легенда', 
                icon: '🏆',
                description: '100 часов фокуса',
                unlockLevel: 8,
                checkCondition: () => this.stats.totalFocusTime >= 6000
            }
        ];

        const availableAchievements = allAchievements.filter(ach => 
            this.stats.level >= ach.unlockLevel
        );

        const achievements = availableAchievements
            .filter(ach => hasAchievement(ach.id))
            .map(ach => `
            <div class="task-item">
                <div class="flex center">
                    <span class="emoji-icon" style="opacity: 1;">${ach.icon}</span>
                    <div class="task-item-content" style="flex: 1;">
                        <div class="task-item-title" style="opacity: 1;">${ach.title}</div>
                        <div class="task-item-meta" style="opacity: 0.7;">${ach.description}</div>
                    </div>
                    <span style="color: var(--success); font-size: 20px;">✓</span>
                </div>
            </div>
        `).join('');

        const availableButLocked = availableAchievements
            .filter(ach => !hasAchievement(ach.id))
            .map(ach => `
            <div class="task-item achievement-locked">
                <div class="flex center">
                    <span class="emoji-icon" style="opacity: 0.3;">${ach.icon}</span>
                    <div class="task-item-content" style="flex: 1;">
                        <div class="task-item-title" style="opacity: 0.5;">${ach.title}</div>
                        <div class="task-item-meta" style="opacity: 0.4;">${ach.description}</div>
                    </div>
                    <span style="color: var(--text-tertiary); font-size: 16px;">🔒</span>
                </div>
            </div>
        `).join('');
        
        const levelLockedAchievements = allAchievements
            .filter(ach => this.stats.level < ach.unlockLevel)
            .slice(0, 3)
            .map(ach => `
            <div class="task-item achievement-locked">
                <div class="flex center">
                    <span class="emoji-icon" style="opacity: 0.2;">${ach.icon}</span>
                    <div class="task-item-content" style="flex: 1;">
                        <div class="task-item-title" style="opacity: 0.4;">${ach.title}</div>
                        <div class="task-item-meta" style="opacity: 0.3;">Откроется на уровне ${ach.unlockLevel}</div>
                    </div>
                    <span style="color: var(--text-tertiary); font-size: 16px;">🔒</span>
                </div>
            </div>
        `).join('');

        return `
            <div class="app-container">
                <div class="container">
                    <div style="margin-bottom: 16px;">
                        <button class="btn tertiary" data-action="navigate" data-view="home" style="padding: 8px 16px; font-size: 14px; width: auto; margin-bottom: 8px;">← Назад</button>
                        <h1 class="title" style="margin-bottom: 0;">Статистика</h1>
                    </div>
                    <div class="panel">
                        <div class="flex center" style="gap: 16px; margin-bottom: 16px;">
                            <div style="font-size: 32px;">🏆</div>
                            <div>
                                <div class="body">Уровень ${this.stats.level}</div>
                                <div class="caption">${levelProgress}/100 XP</div>
                            </div>
                        </div>
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${levelProgress}%;"></div>
                        </div>
                    </div>
                    <div class="stats-grid">
                        <div class="stat-box">
                            <div class="stat-value">${this.stats.totalSessions}</div>
                            <div class="stat-label">Сессий</div>
                        </div>
                        <div class="stat-box">
                            <div class="stat-value">${hours}ч ${minutes}м</div>
                            <div class="stat-label">Время фокуса</div>
                        </div>
                        <div class="stat-box">
                            <div class="stat-value">${this.stats.currentStreak}</div>
                            <div class="stat-label">Серия дней</div>
                        </div>
                        <div class="stat-box">
                            <div class="stat-value">${this.stats.longestStreak}</div>
                            <div class="stat-label">Рекорд</div>
                        </div>
                    </div>
                    <div class="panel">
                        <h2 class="subtitle" style="margin-bottom: 16px;">Достижения</h2>
                        <div class="task-list">${achievements || '<p class="caption" style="opacity: 0.6;">Пока нет разблокированных достижений</p>'}</div>
                        ${(availableButLocked || levelLockedAchievements) ? `
                            <div style="margin-top: 24px; padding-top: 24px; border-top: 1px solid var(--border);">
                                <h3 class="subtitle" style="margin-bottom: 16px; opacity: 0.6;">Следующие достижения</h3>
                                <div class="task-list">${availableButLocked}${levelLockedAchievements}</div>
                            </div>
                        ` : ''}
                    </div>
                </div>
                ${this.renderNavigation()}
            </div>
        `;
    }

    renderApp() {
        const appDiv = document.getElementById('app');
        let content = '<div class="loading">Загрузка...</div>';

        switch (this.currentView) {
            case 'onboarding':
                content = this.renderOnboarding();
                break;
            case 'home':
                content = this.renderHome();
                break;
            case 'createTask':
                content = this.renderCreateTask();
                break;
            case 'taskDetails':
                const taskId = this.selectedTaskId || ''; 
                content = this.renderTaskDetails(taskId);
                break;
            case 'pomodoro':
                content = this.renderPomodoro();
                break;
            case 'statistics':
                content = this.renderStatistics();
                break;
            case 'settings':
                content = this.renderSettings();
                break;
        }

        appDiv.innerHTML = content;
        this.attachDynamicEventListeners();
    }

    renderNavigation() {
        return `
            <nav class="navigation">
                <button class="nav-item ${this.currentView === 'home' ? 'active' : ''}" data-action="navigate" data-view="home">
                    <span class="icon">📋</span>
                    <span class="text">Задачи</span>
                </button>
                <button class="nav-item ${this.currentView === 'createTask' ? 'active' : ''}" data-action="navigate" data-view="createTask">
                    <span class="icon">+</span>
                    <span class="text">Новая</span>
                </button>
                <button class="nav-item ${this.currentView === 'pomodoro' ? 'active' : ''}" data-action="startQuickPomodoro">
                    <span class="icon">🍅</span>
                    <span class="text">Pomodoro</span>
                </button>
                <button class="nav-item ${this.currentView === 'statistics' ? 'active' : ''}" data-action="navigate" data-view="statistics">
                    <span class="icon">📊</span>
                    <span class="text">Статистика</span>
                </button>
                <button class="nav-item ${this.currentView === 'settings' ? 'active' : ''}" data-action="navigate" data-view="settings">
                    <span class="icon">⚙️</span>
                    <span class="text">Настройки</span>
                </button>
            </nav>
        `;
    }

    attachEventListeners() {
        if (this.clickHandler) {
            document.removeEventListener('click', this.clickHandler);
        }
        
        this.clickHandler = async (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
                return;
            }
            
            if (e.target.closest('.edit-modal') || e.target.closest('.focus-input-modal') || e.target.closest('.confirm-modal')) {
                return;
            }
            
            let actionElement = null;
            let current = e.target;
            
            while (current && current !== document.body) {
                if (current.hasAttribute && current.hasAttribute('data-action')) {
                    actionElement = current;
                    break;
                }
                if (current.dataset && current.dataset.action) {
                    actionElement = current;
                    break;
                }
                current = current.parentElement;
            }
            
            if (!actionElement) {
                return;
            }
            
            const action = actionElement.getAttribute('data-action') || actionElement.dataset.action;
            if (!action) {
                return;
            }

            console.log('Action clicked:', action, 'element:', actionElement, 'target:', e.target, 'has data-view:', actionElement.hasAttribute('data-view'), 'dataset.view:', actionElement.dataset.view);

            e.stopPropagation();

            if (actionElement.tagName === 'BUTTON' || actionElement.closest('button')) {
                e.preventDefault();
            }

            if (action === 'navigate') {
                const view = actionElement.getAttribute('data-view') || actionElement.dataset.view;
                console.log('navigate clicked:', view, 'element:', actionElement);
                if (view) {
                    console.log('Navigating to:', view);
                    this.navigateTo(view);
                } else {
                    console.error('navigate: view is missing', {
                        actionElement,
                        allAttributes: Array.from(actionElement.attributes).map(attr => ({ name: attr.name, value: attr.value }))
                    });
                }
            } else if (action === 'setDailyHours') {
                const value = actionElement.getAttribute('data-value') || actionElement.dataset.value;
                this.settings.dailyHours = parseInt(value);
                this.saveSettings(this.settings);
                this.renderApp();
            } else if (action === 'setProductiveTime') {
                const value = actionElement.getAttribute('data-value') || actionElement.dataset.value;
                this.settings.productiveTime = value;
                this.saveSettings(this.settings);
                this.renderApp();
            } else if (action === 'setPomodoro') {
                const value = actionElement.getAttribute('data-value') || actionElement.dataset.value;
                this.settings.pomodoroLength = parseInt(value);
                this.settings.breakLength = parseInt(value) / 5;
                this.saveSettings(this.settings);
                this.renderApp();
            } else if (action === 'saveSettings') {
                const pomodoroLength = parseInt(document.getElementById('pomodoroLength')?.value) || this.settings.pomodoroLength;
                const dailyHours = parseInt(document.getElementById('dailyHours')?.value) || this.settings.dailyHours;
                const breakLength = parseInt(document.getElementById('breakLength')?.value) || this.settings.breakLength;
                
                // Сохраняем OpenRouter API ключ
                const openRouterKey = document.getElementById('openRouterApiKey')?.value?.trim() || '';
                if (openRouterKey) {
                    localStorage.setItem('openrouter_api_key', openRouterKey);
                } else {
                    localStorage.removeItem('openrouter_api_key');
                }
                
                this.settings.pomodoroLength = pomodoroLength;
                this.settings.dailyHours = dailyHours;
                this.settings.breakLength = breakLength;
                
                this.saveSettings(this.settings);
                alert('✅ Настройки сохранены!');
                this.navigateTo('home');
            } else if (action === 'clearHfToken') {
                localStorage.removeItem('hf_api_key');
                alert('✅ Токен Hugging Face удален');
                this.renderApp();
            } else if (action === 'completeOnboarding') {
                this.completeOnboarding(this.settings);
            } else if (action === 'createTask') {
                this.navigateTo('createTask');
            } else if (action === 'analyzeTask') {
                const desc = document.getElementById('taskDescription')?.value?.trim();
                if (!desc) {
                    alert('Пожалуйста, опишите задачу');
                    return;
                }
                
                const analyzeBtn = document.getElementById('analyzeTaskBtn');
                const analyzeText = document.getElementById('analyzeTaskText');
                const analyzeLoader = document.getElementById('analyzeTaskLoader');
                const planDiv = document.getElementById('generatedPlan');
                const saveBtn = document.getElementById('saveTask');
                
                // Показываем загрузку
                if (analyzeBtn) analyzeBtn.disabled = true;
                if (analyzeText) analyzeText.style.display = 'none';
                if (analyzeLoader) analyzeLoader.style.display = 'inline';
                if (planDiv) planDiv.innerHTML = '<div style="padding: 16px; text-align: center; color: var(--text-secondary);">⏳ Подключаюсь к AI сервису...</div>';
                
                try {
                    // Обновляем статус во время генерации
                    const updateStatus = (message) => {
                        if (planDiv) {
                            planDiv.innerHTML = `<div style="padding: 16px; text-align: center; color: var(--text-secondary);">${message}</div>`;
                        }
                    };
                    
                    // Генерируем план с помощью AI
                    updateStatus('⏳ Генерирую план с помощью AI...');
                    const subTasks = await this.generateTaskPlanWithAI(desc, updateStatus);
                    
                    // Показываем сгенерированный план
                    if (planDiv) {
                        planDiv.innerHTML = `
                            <div style="margin-top: 16px;">
                                <h3 class="subtitle" style="margin-bottom: 12px;">🤖 Сгенерированный план:</h3>
                                <div class="task-list">
                                    ${subTasks.map((st, idx) => `
                                        <div class="task-item">
                                            <div class="flex center">
                                                <div class="task-item-number">${idx + 1}</div>
                                                <div class="task-item-content" style="flex: 1;">
                                                    <div class="task-item-title">${st.title}</div>
                                                    <div class="task-item-meta">🍅 ${st.estimatedPomodoros} сессий Pomodoro</div>
                                                </div>
                                            </div>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        `;
                    }
                    
                    // Сохраняем план для последующего использования
                    this.pendingTaskPlan = {
                        description: desc,
                        deadline: document.getElementById('deadline')?.value || null,
                        subTasks: subTasks
                    };
                    
                    if (saveBtn) saveBtn.style.display = 'block';
                    
                } catch (error) {
                    console.error('Ошибка генерации плана:', error);
                    if (planDiv) {
                        planDiv.innerHTML = `
                            <div style="padding: 16px; background: var(--error-light); border-radius: 8px; color: var(--error);">
                                ⚠️ Ошибка генерации плана. Используется базовый план.
                            </div>
                        `;
                    }
                    // Используем fallback
                    const fallbackSubTasks = this.generateTaskPlanFallback(desc);
                    this.pendingTaskPlan = {
                        description: desc,
                        deadline: document.getElementById('deadline')?.value || null,
                        subTasks: fallbackSubTasks
                    };
                    if (saveBtn) saveBtn.style.display = 'block';
                } finally {
                    // Убираем загрузку
                    if (analyzeBtn) analyzeBtn.disabled = false;
                    if (analyzeText) analyzeText.style.display = 'inline';
                    if (analyzeLoader) analyzeLoader.style.display = 'none';
                }
            } else if (action === 'saveTask') {
                if (this.pendingTaskPlan) {
                    await this.createTask(
                        this.pendingTaskPlan.description,
                        this.pendingTaskPlan.deadline,
                        this.pendingTaskPlan.subTasks
                    );
                    this.pendingTaskPlan = null;
                } else {
                    // Fallback: создаем задачу без AI плана
                    const desc = document.getElementById('taskDescription')?.value?.trim();
                    const deadline = document.getElementById('deadline')?.value || null;
                    if (desc) {
                        await this.createTask(desc, deadline);
                    }
                }
            } else if (action === 'viewTask') {
                const taskId = actionElement.getAttribute('data-id') || actionElement.dataset.id;
                if (taskId) {
                    this.selectedTaskId = taskId;
                    this.navigateTo('taskDetails');
                }
            } else if (action === 'deleteTask') {
                let taskId = actionElement.getAttribute('data-id') || actionElement.dataset.id;
                
                if (!taskId) {
                    let current = actionElement;
                    for (let i = 0; i < 5 && current; i++) {
                        if (current.hasAttribute && current.hasAttribute('data-id')) {
                            taskId = current.getAttribute('data-id');
                            break;
                        }
                        if (current.dataset && current.dataset.id) {
                            taskId = current.dataset.id;
                            break;
                        }
                        current = current.parentElement;
                    }
                }
                
                console.log('deleteTask clicked:', {
                    taskId,
                    actionElement,
                    target: e.target
                });
                
                if (taskId) {
                    this.showDeleteTaskConfirm(taskId);
                } else {
                    console.error('deleteTask: taskId not found', {
                        actionElement,
                        allAttributes: Array.from(actionElement.attributes).map(attr => ({ name: attr.name, value: attr.value }))
                    });
                    alert('Ошибка: не удалось найти ID задачи для удаления. Проверьте консоль.');
                }
            } else if (action === 'startPomodoro') {
                const taskId = actionElement.getAttribute('data-task') || actionElement.dataset.task;
                const subTaskId = parseInt(actionElement.getAttribute('data-subtask') || actionElement.dataset.subtask);
                if (taskId && subTaskId && !isNaN(subTaskId)) {
                    this.startPomodoro(taskId, subTaskId);
                }
            } else if (action === 'pausePomodoro') {
                this.pausePomodoro();
                this.renderApp();
            } else if (action === 'cancelPomodoro') {
                this.cancelPomodoro();
            } else if (action === 'startQuickPomodoro') {
                this.startQuickPomodoro();
            } else if (action === 'startTimer') {
                this.startTimer();
            } else if (action === 'editSubTask') {
                const taskId = actionElement.getAttribute('data-task-id') || actionElement.dataset.taskId;
                const subTaskId = parseInt(actionElement.getAttribute('data-subtask-id') || actionElement.dataset.subtaskId);
                if (taskId && subTaskId) {
                    this.editSubTask(taskId, subTaskId);
                }
            } else if (action === 'deleteSubTask') {
                const taskId = actionElement.getAttribute('data-task-id') || actionElement.dataset.taskId;
                const subTaskId = parseInt(actionElement.getAttribute('data-subtask-id') || actionElement.dataset.subtaskId);
                if (taskId && subTaskId) {
                    this.showDeleteSubTaskConfirm(taskId, subTaskId);
                }
            }
            
            if (e.target.classList.contains('editable-title') && e.target.dataset.subtaskId) {
                const taskItem = e.target.closest('.task-item');
                if (taskItem) {
                    const taskId = this.selectedTaskId;
                    const subTaskId = parseInt(e.target.dataset.subtaskId);
                    if (taskId && subTaskId) {
                        this.editSubTask(taskId, subTaskId);
                    }
                }
            }
        };
        
        document.addEventListener('click', this.clickHandler);
    }

    attachDynamicEventListeners() {
    }
}

const app = new FocusHelperApp();
window.app = app;