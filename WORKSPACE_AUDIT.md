# Аудит и сохранение рабочего состояния Sinex

Дата: 2026-11-13. Объём изменения: сохранение рабочего состояния, избранное и история. Остальные релизы ТЗ в этот этап не входят.

## Исходное состояние

Установлены Next.js 16.4.5, React 19.3.1, TypeScript 5.9.3; графики — lightweight-charts 5.2.1. Проверено локально через package.json и npm ls. Библиотеки не добавлялись и не обновлялись.

| Функция | Уже существовало | Доработка этого этапа | Файлы | Риск |
| --- | --- | --- | --- | --- |
| Выбор рынка | Spot, биржа, базовый актив, валюта котировки, интервал | Использован существующий переход для сохранённых пар | components/market/MarketDashboard.tsx, lib/market/pair-selection.ts | Автоматический выбор доступной пары при отсутствии выбранной — существующее поведение |
| Избранное | Звёзды, уникальный ключ exchange:marketType:symbol, фильтр по текущему рынку | Отдельный список между биржами, удаление недоступных записей, устранение дублей при чтении | components/market/MarketsPanel.tsx, components/market/SavedMarkets.tsx, lib/ui/market-panel-settings.ts | Ошибка каталога не должна удалять записи |
| История | Не найдена | 30 уникальных инструментов, повторный просмотр в начало, очистка | lib/ui/recent-pairs.ts, components/market/MarketDashboard.tsx, components/market/SavedMarkets.tsx | Записывается после загрузки свечей, без секретов и цен |
| Настройки | Выбор биржи, пары, интервала и панелей, изоляция аккаунтов | Версия 2, миграция документов без версии, поля истории и диапазонов | lib/ui/workspace-settings.ts, lib/ui/workspace-client.ts | Повреждённый локальный документ отклоняется существующим валидатором |
| График | Свечи, отдельная панель объёмов, масштабирование | Диапазон времени по бирже/рынку/символу/интервалу, максимум 100 записей | components/market/CandlestickChart.tsx, hooks/use-chart-viewport.ts | Сохранённый участок вне загруженной истории заменяется последними свечами |
| Индикаторы | Чистые расчёты в lib/indicators, EMA/SMA/RSI, настройки областей действия | Существующий механизм сохранён | hooks/use-indicator-preferences.ts, lib/server/indicator-store.ts, hooks/use-chart-indicators.ts | Индикаторы и объёмы используют отдельное существующее хранилище |
| Рисование | Уровни и трендовые линии, координаты время/цена, приватное хранение | Не изменялось | components/market/ChartDrawings.tsx, components/market/TrendLines.tsx, lib/drawings, lib/server/private-drawing-store.ts | Вне объёма |
| REST/OHLCV | API market, биржевые адаптеры, отмена запросов | Не изменялось | app/api/market, lib/market/exchanges, hooks/use-market-candles.ts | Свечи не помещаются в настройки |
| WebSocket | Отдельные candle/trade/orderbook потоки, cleanup, reconnect/backoff | Не изменялось; готовность к мультиграфикам отдельно не подтверждалась | lib/market/stream.ts, lib/market/trades/stream.ts, lib/market/orderbook/stream.ts | Управление общими подписками — отдельный этап |
| Кэш | Ограниченный TTL-кэш публичных данных с разделением in-flight запросов | Не изменялось | lib/server/cache.ts, lib/market/exchanges/shared.ts | Общий кэш не используется для пользовательских настроек |
| Авторизация | Cookie-сессии, локальные аккаунты, Google/Yandex OAuth | Не изменялось | lib/server/accounts.ts, lib/server/account-store.ts, app/api/auth | Существующая проверка владельца workspace сохранена |
| SQLite | account_users, workspace_owners, account_sessions, приватные документы/линии/индикаторы, private_workspace_settings и paper/demo-таблицы | Новые поля только внутри JSON settings существующей таблицы | lib/server/account-store.ts, lib/server/workspace-store.ts | SQL-схема не менялась |
| Ордера | Paper/demo API и исполнения | Не изменялось | app/api/paper, lib/server/demo-orders.ts, lib/paper | Бизнес-логика не изменялась; реальное исполнение ордеров не проверялось |
| Knowledge Base | MDX-разделы help/learn/developers/blog | Обновлена существующая статья графика | content/help/charts.mdx | Отдельная система документации не создавалась |

## Хранение и границы

Аккаунт использует существующий /api/workspace и SQLite с локальной копией и отложенными изменениями. Гость использует sinex:workspace:guest в localStorage. Старые документы без новых полей получают schemaVersion=2, пустую историю и диапазоны через значения по умолчанию. Неизвестная версия отклоняется валидатором. Избранное, история и настройки аккаунтов разделены существующими ключами пользователя.

Лимит тела запроса только /api/workspace увеличен с 4096 до 65536 символов для полного документа. Проверка same-origin, авторизации и X-Workspace-Id сохранена. Auth/OAuth не менялись.

Доступен существующий свечной тип графика; новые типы не добавлялись. Сохраняется временной диапазон (горизонтальный масштаб), ценовая шкала остаётся автоматической. При запрете localStorage гостевые настройки работают только в памяти. Серверная синхронизация зависит от сети; используется существующая очередь повторов. Между разными вкладками одновременные изменения одного поля могут перезаписать друг друга — существующая модель синхронизации.

C#-контракты, новые адаптеры, Redis, фоновые сервисы и новые базы данных не добавлялись. Торговые API и правила исполнения ордеров не изменены по diff. Production не публиковался.

## Проверки

До интеграции: typecheck, lint и 133 unit-теста прошли. Итоговые проверки: npm run typecheck — успешно; npm run lint — без ошибок и предупреждений; npm test — 136/136; npm run build — успешно; node tests/workspace-state-browser.mjs — успешно в Chrome. git diff --check — без ошибок. Браузерная проверка использовала отдельную SQLite в .qa и подмену публичных рыночных ответов; реальное исполнение ордеров и работа живых бирж в этом этапе не проверялись. Тестовый сервер остановлен.

tests/workspace-state-browser.mjs использует детерминированные фикстуры только в тесте: избранное, история, интервал, запись диапазона, перезагрузка, очистка, мобильная ширина, ошибки JavaScript, большой документ аккаунта и защита от старого owner ID. Запуск: BASE_URL=http://127.0.0.1:3017 node tests/workspace-state-browser.mjs с локальным сервером и отдельной тестовой БД.

Изменённые файлы: app/api/workspace/route.ts, app/globals.css, components/market/CandlestickChart.tsx, components/market/MarketDashboard.tsx, components/market/MarketsPanel.tsx, content/help/charts.mdx, lib/ui/market-panel-settings.ts, lib/ui/workspace-client.ts, lib/ui/workspace-settings.ts, tests/workspace-settings.test.ts. Добавлены components/market/SavedMarkets.tsx, hooks/use-chart-viewport.ts, lib/ui/recent-pairs.ts, tests/recent-pairs.test.ts, tests/workspace-state-browser.mjs и этот отчёт. AGENTS.md автоматически создан next dev.
