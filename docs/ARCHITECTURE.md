# Архитектура

## Структура

```
index.html                    шаблон: <!-- content:head --> и <!-- content:body -->
content/site.json             публичный контент сайта (источник для сборки)
content/resume.md             личный черновик резюме (локально, не в git)
scripts/content-plugin.ts     Vite-плагин: site.json → zod-проверка → HTML
src/content/schema.ts         zod-схема и типы контента (контракт для админки)
src/content/render.ts         данные → HTML-строки, JSON-LD; только при сборке
src/content/altitude.ts       диапазоны высот разделов, скролл → метры, метры → сцена, формат
src/main.ts                   критический путь: высотомер, ссылки, классический режим,
                              ленивая загрузка motion и 3D
src/motion.ts                 Lenis + Snap, GSAP + ScrollTrigger, reveal-анимации, шторка
src/experience/quality.ts     уровень устройства (off/low/mid/high) и пресеты
src/experience/Experience.ts  рендерер, сцена, камера, цикл кадра
src/shaders/                  GLSL (vite-plugin-glsl)
src/styles/fonts.css          Inter и JetBrains Mono: только latin + cyrillic(-ext)
src/styles/main.css           токены на :root, раскладка, .classic, reduced-motion
scripts/optimize-models.mjs   gltf-transform: assets-src/models → public/models
public/robots.txt             разрешение для поисковиков
```

## Сборка контента

`contentPlugin` в `transformIndexHtml` читает `content/site.json`, проверяет `siteSchema` (ошибка схемы роняет сборку с понятным сообщением) и подставляет `render.head()` и `render.body()` в шаблон. В dev изменение `site.json` перезагружает страницу. `render.ts` и `schema.ts` в браузерный бандл не попадают.

## Поток данных

1. Позиции разделов (`[data-stop]`) кешируются в `main.ts` и обновляются через `ResizeObserver` на `body` — в кадре layout не читается.
2. Один нативный слушатель `scroll` (через `requestAnimationFrame`) вызывает `metresAt()`: раздел, в котором сейчас верх экрана, и доля пути до следующего раздела → метры по `STOP_ALTITUDES`. Последний раздел идёт до конца прокрутки. Lenis скроллит окно, поэтому тот же слушатель работает и до, и после его загрузки.
3. Из метров считается `sceneProgress()` (0..1 для шейдеров: 60 % — гора, по 20 % — атмосфера и космос).
4. Слушатели получают `{ metres, stop, scene }`: высотомер (плавно догоняет цель), пилюля (меняется на орбите), `Experience.setProgress(scene)`.
5. Все внутренние переходы (`a[href^="#"]`, `[data-return]`, пункты меню «Маршрут») идут через `travelTo`: до загрузки motion — обычный прыжок, после — шторка. Нативный переход по якорю рассинхронизировал бы Lenis. Меню закрывается, фокус переносится на цель.

Отсюда правило: всё, что зависит от высоты, — функция от метров (или `scene`). Тогда обратный скролл и переходы работают без отдельного кода. Диапазоны разделов меняются только в `STOP_ALTITUDES` — подписи, метр, меню и сцена подхватят их сами.

## Примагничивание

`lenis/snap` в `motion.ts`: `type: 'proximity'`, порог 25 % высоты экрана, `debounce` 350 мс, точки — начала разделов. Mandatory не используется: раздел «Лагеря» выше экрана, и его нужно читать свободно.

## Загрузка

- Начальный чанк — только `main.ts` (~2,4 КБ gzip). Текст виден сразу, LCP — заголовок.
- `motion` (Lenis + GSAP) и `Experience` (Three.js) грузятся через `import()` по первому взаимодействию (`pointermove`, `wheel`, `touchstart`, `keydown`, `scroll`…) или через 4 с после `load`. До этого фон — CSS-градиент того же цвета, что небо на 0 м, поэтому появление canvas незаметно.
- С `prefers-reduced-motion` не грузится ни motion, ни 3D.
- Следующие этапы: ассеты сцены подгружаются по высоте (космос — при подходе к вершине), шейдеры компилируются заранее (`compileAsync`), чтобы не было фризов на смене сцен.

## Качество

`detectTier()` → `off` (reduced-motion или нет WebGL2), `low`, `mid`, `high` по ядрам, памяти и типу указателя. Пресет задаёт максимальный DPR, количество частиц и постобработку.

В рантайме `adaptResolution` снижает DPR шагом 0,25 (до 0,6), если ~60 кадров подряд дольше 22 мс. Рендер останавливается на скрытой вкладке.

## Переходы под шторкой

`travelTo(target)` в `motion.ts`: шторка `.veil` до opacity 1 → `lenis.scrollTo(target, { immediate: true })` → шторка обратно. Промежуточные секции не проигрываются. Без motion (reduced-motion или до загрузки) — мгновенный переход без шторки.

## Запасные варианты

| Условие | Что видно |
| --- | --- |
| Нет JS | Весь контент `index.html` |
| Нет WebGL2 / `prefers-reduced-motion` | Контент без 3D, без полёта; позже — статичные кадры из Blender |
| «Классическая версия» | `.classic`: скрыты сцена и высотомер, секции без `min-height` |

## Контент и будущая админка

Админка — после релиза (этап 10 в [ROADMAP](ROADMAP.md)), но контракт данных закладывается с этапа 1, чтобы потом менялся только источник данных, а не вёрстка.

- **Данные отдельно от разметки.** Публичный контент — `content/site.json` по zod-схеме `src/content/schema.ts`, из них при сборке генерируется HTML. SEO и работа без JS сохраняются. `content/resume.md` остаётся личным черновиком и в сборку не попадает. Та же схема потом проверяет запросы API админки.
- **Одна форма данных на всех.** Сейчас её читает сборка из JSON, потом — из API админки. Компоненты и шаблоны источника не знают.
- **Локализация по полям:** `LocalizedText = string | { ru: string; en?: string }`. Пока только RU, но второй язык добавится без миграции.
- **Каждый элемент списка** (лагерь, проект, навык) — со стабильным `id`, порядком `order` и `status: 'draft' | 'published' | 'hidden'`.
- **Медиа — объектом** `{ url, alt }`, не строкой.
- **Значения по умолчанию:** сейчас источник — сам `site.json` в репозитории. Когда появится API, `site.json` останется запасным вариантом: сайт соберётся, даже если API недоступен.

Референс — админка circleburo (`C:\Users\User\Desktop\circleburo`): типы `shared/types/adminContent.ts`, локализация по полям и `resolveContent()` в `shared/lib/i18nContent.ts`, два вида типов (хранимый с переводами и разрешённый для рендера), Express по слоям `routes → controllers → services → repositories`, Postgres JSONB, MinIO для медиа, JWT-вход, zod → OpenAPI, скрытый путь панели, сид контента только вручную.

## Бюджеты

| Что | Лимит | Сейчас |
| --- | --- | --- |
| Начальный JS (gzip) | ≤ 60 КБ | 2,8 КБ |
| Чанк `motion` с GSAP, Lenis и Snap (gzip) | ≤ 60 КБ | 51,3 КБ |
| Чанк `Experience` с Three.js (gzip) | ≤ 250 КБ | 131,7 КБ |
| CSS (gzip) | ≤ 10 КБ | 2,5 КБ |
| Шрифты, реально загружаемые для RU-страницы | ≤ 150 КБ | ~120 КБ (Inter latin + cyrillic, JetBrains Mono latin + cyrillic) |
| Одна модель | ≤ 300 КБ | — |
| Все 3D-ассеты | ≤ 3 МБ | — |
| Draw calls в кадре | < 100 | — |
| Lighthouse (mobile): Performance / A11y / Best Practices / SEO | ≥ 95 / 100 / 100 / 100 | 99 / 100 / 100 / 100 |
| FPS | 60 десктоп / ≥ 30 средний телефон | — |

Колонку «Сейчас» обновлять, когда меняется бандл или добавляются ассеты.

**Как мерили Lighthouse (04.11.2026):** `vite preview` локально, Lighthouse 12, мобильный профиль, три прогона. На этой машине Kaspersky встраивает в каждую страницу свой скрипт (~180 КБ, блокирует отрисовку), поэтому замер — с `--blocked-url-patterns="*kaspersky-labs.com*"`. С этим скриптом Performance ~78. `vite preview` не сжимает файлы и работает по HTTP; на Cloudflare будут Brotli и HTTPS.

```bash
npx lighthouse@12 http://localhost:4173/ --chrome-flags="--headless=new" --blocked-url-patterns="*kaspersky-labs.com*" --only-categories=performance,accessibility,best-practices,seo
```

Запускать из короткого пути (например, `%TEMP%`): из длинных путей Windows не стартует Chrome.
