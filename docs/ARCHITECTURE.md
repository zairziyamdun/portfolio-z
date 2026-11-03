# Архитектура

## Структура

```
index.html                    контент резюме, SEO (meta, OG, JSON-LD Person)
src/main.ts                   Lenis + GSAP ticker, высотомер, reveal-анимации,
                              переходы под шторкой, классический режим, загрузка 3D
src/content/altitude.ts       прогресс → метры, зоны, формат; чистые функции
src/experience/quality.ts     уровень устройства (off/low/mid/high) и пресеты
src/experience/Experience.ts  рендерер, сцена, камера, цикл кадра
src/shaders/                  GLSL (vite-plugin-glsl)
src/styles/main.css           токены на :root, раскладка, .classic, reduced-motion
scripts/optimize-models.mjs   gltf-transform: assets-src/models → public/models
content/resume.md             исходные данные резюме (локально, не в git)
```

## Поток данных

1. Lenis двигается в тике GSAP (`gsap.ticker` → `lenis.raf`), ScrollTrigger обновляется от Lenis.
2. На событие `scroll` считается `p = scroll / limit` и раздаётся слушателям из `main.ts`.
3. Слушатели: высотомер (`progressToMetres`, `zoneOf`) и `Experience.setProgress(p)`.
4. `Experience` в своём `requestAnimationFrame` читает последний `p` и выставляет uniform-ы, камеру, прозрачности.

Отсюда правило: всё, что зависит от высоты, — функция от `p`. Тогда обратный скролл и переходы работают без отдельного кода.

## Загрузка

- Начальный чанк — только `main.ts` с Lenis и GSAP. Текст виден сразу, LCP — заголовок.
- `Experience` грузится через `import()` в `requestIdleCallback` (таймаут 1,5 с), только если уровень не `off`.
- Следующие этапы: ассеты сцены подгружаются по высоте (космос — при подходе к вершине), шейдеры компилируются заранее (`compileAsync`), чтобы не было фризов на смене сцен.

## Качество

`detectTier()` → `off` (reduced-motion или нет WebGL2), `low`, `mid`, `high` по ядрам, памяти и типу указателя. Пресет задаёт максимальный DPR, количество частиц и постобработку.

В рантайме `adaptResolution` снижает DPR шагом 0,25 (до 0,6), если ~60 кадров подряд дольше 22 мс. Рендер останавливается на скрытой вкладке.

## Переходы под шторкой

`travelTo(target)`: шторка `.veil` до opacity 1 → `lenis.scrollTo(target, { immediate: true })` → шторка обратно. Промежуточные секции не проигрываются. С reduced-motion — мгновенный переход без шторки.

## Запасные варианты

| Условие | Что видно |
| --- | --- |
| Нет JS | Весь контент `index.html` |
| Нет WebGL2 / `prefers-reduced-motion` | Контент без 3D, без полёта; позже — статичные кадры из Blender |
| «Классическая версия» | `.classic`: скрыты сцена и высотомер, секции без `min-height` |

## Контент и будущая админка

Админка — после релиза (этап 10 в [ROADMAP](ROADMAP.md)), но контракт данных закладывается с этапа 1, чтобы потом менялся только источник данных, а не вёрстка.

- **Данные отдельно от разметки.** Публичный контент — типизированные данные (`src/content/types.ts` + `content/site.json`), из них при сборке генерируется HTML. SEO и работа без JS сохраняются. `content/resume.md` остаётся личным черновиком и в сборку не попадает.
- **Одна форма данных на всех.** Сейчас её читает сборка из JSON, потом — из API админки. Компоненты и шаблоны источника не знают.
- **Локализация по полям:** `LocalizedText = string | { ru: string; en?: string }`. Пока только RU, но второй язык добавится без миграции.
- **Каждый элемент списка** (лагерь, проект, навык) — со стабильным `id`, порядком `order` и `status: 'draft' | 'published' | 'hidden'`.
- **Медиа — объектом** `{ url, alt }`, не строкой.
- **Значения по умолчанию** — в коде (`defaultContent`): сайт собирается, даже если источник недоступен.

Референс — админка circleburo (`C:\Users\User\Desktop\circleburo`): типы `shared/types/adminContent.ts`, локализация по полям и `resolveContent()` в `shared/lib/i18nContent.ts`, два вида типов (хранимый с переводами и разрешённый для рендера), Express по слоям `routes → controllers → services → repositories`, Postgres JSONB, MinIO для медиа, JWT-вход, zod → OpenAPI, скрытый путь панели, сид контента только вручную.

## Бюджеты

| Что | Лимит | Сейчас |
| --- | --- | --- |
| Начальный JS (gzip) | ≤ 60 КБ | 51,6 КБ |
| Чанк `Experience` с Three.js (gzip) | ≤ 250 КБ | 131,8 КБ |
| Одна модель | ≤ 300 КБ | — |
| Все 3D-ассеты | ≤ 3 МБ | — |
| Draw calls в кадре | < 100 | — |
| Lighthouse Performance (mobile) | ≥ 90 | не замерялось |
| FPS | 60 десктоп / ≥ 30 средний телефон | — |

Колонку «Сейчас» обновлять, когда меняется бандл или добавляются ассеты.
