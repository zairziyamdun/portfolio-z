import './styles/main.css'
import { campAltitudes, formatAltitude, metresAt, sceneProgress, type StopRect } from './content/altitude'
import type { StopId } from './content/schema'
import { detectTier, qualityFor } from './experience/quality'

// Critical path only: altimeter, links, menu, classic mode. Motion and 3D load later as chunks.

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
const root = document.documentElement
const stopEls = [...document.querySelectorAll<HTMLElement>('[data-stop]')]
const labels = new Map(stopEls.map((el) => [el.dataset.stop as StopId, el.dataset.label ?? '']))

const campEls = [...document.querySelectorAll<HTMLElement>('[data-camp]')]
const layerEls = [...document.querySelectorAll<HTMLElement>('[data-layer]')]
const projectEls = [...document.querySelectorAll<HTMLElement>('[data-project]')]

// Stop and camp positions are cached and refreshed on layout changes, never read per frame.
let rects: StopRect[] = []
let campCentres: number[] = []
let docHeight = 0
const measure = () => {
  rects = stopEls.map((el) => {
    const r = el.getBoundingClientRect()
    return { id: el.dataset.stop as StopId, top: r.top + scrollY }
  })
  campCentres = campEls.map((el) => {
    const r = el.getBoundingClientRect()
    return r.top + scrollY + r.height / 2
  })
  docHeight = root.scrollHeight
  update()
}
new ResizeObserver(measure).observe(document.body)

type Altitude = { metres: number; stop: StopId; scene: number }
const listeners: Array<(a: Altitude) => void> = []
function update() {
  if (!rects.length) return
  const { metres, stop } = metresAt(scrollY, innerHeight, docHeight, rects)
  const a = { metres, stop, scene: sceneProgress(metres) }
  for (const fn of listeners) fn(a)
}

// Native scroll events fire for Lenis frames too, so one listener serves both.
let queued = false
addEventListener(
  'scroll',
  () => {
    if (queued) return
    queued = true
    requestAnimationFrame(() => {
      queued = false
      update()
    })
  },
  { passive: true },
)

// Altimeter: the number eases toward the target, so fast travel visibly rewinds it.
const valueEl = document.querySelector<HTMLElement>('[data-altimeter-value]')!
const unitEl = document.querySelector<HTMLElement>('[data-altimeter-unit]')!
const zoneEl = document.querySelector<HTMLElement>('[data-altimeter-zone]')!
let shown = 0
let target = 0
let ticking = false
const renderMeter = () => {
  const { value, unit } = formatAltitude(shown)
  if (valueEl.textContent !== value) valueEl.textContent = value
  if (unitEl.textContent !== unit) unitEl.textContent = unit
}
const tickMeter = () => {
  const diff = target - shown
  shown = Math.abs(diff) < 1 || reducedMotion ? target : shown + diff * 0.18
  renderMeter()
  ticking = shown !== target
  if (ticking) requestAnimationFrame(tickMeter)
}
listeners.push(({ metres, stop }) => {
  target = metres
  const label = labels.get(stop) ?? ''
  if (zoneEl.textContent !== label) zoneEl.textContent = label
  if (!ticking) {
    ticking = true
    requestAnimationFrame(tickMeter)
  }
})

// Pill: "contact now" on the way up, a direct Telegram link once at the orbit
const pill = document.querySelector<HTMLAnchorElement>('[data-pill]')!
const pillDefault = { href: pill.getAttribute('href')!, html: pill.innerHTML }
let pillHere = false
listeners.push(({ stop }) => {
  const here = stop === 'orbit'
  if (here === pillHere) return
  pillHere = here
  pill.setAttribute('href', here ? pill.dataset.hereHref! : pillDefault.href)
  if (here) pill.textContent = pill.dataset.hereText!
  else pill.innerHTML = pillDefault.html
  pill.classList.toggle('pill--here', here)
  if (here) pill.setAttribute('rel', 'noopener')
  else pill.removeAttribute('rel')
})

// Active camp: the card nearest the viewport centre while in the camps stop
let activeCamp = -1
const campListeners: Array<(i: number) => void> = []
listeners.push(({ stop }) => {
  let next = -1
  if (stop === 'camps') {
    const centre = scrollY + innerHeight / 2
    let best = Infinity
    campCentres.forEach((c, i) => {
      if (Math.abs(c - centre) < best) {
        best = Math.abs(c - centre)
        next = i
      }
    })
    // a card that has scrolled away no longer counts, even if it is still the nearest
    if (best > innerHeight * 0.6) next = -1
  }
  if (next === activeCamp) return
  activeCamp = next
  campEls.forEach((el, i) => el.classList.toggle('camp--active', i === next))
  for (const fn of campListeners) fn(next)
})

// Travel: veil animation once motion is loaded, plain jump before that
let travelTo = (target: number | string) => {
  if (typeof target === 'number') scrollTo({ top: target })
  else document.querySelector(target)?.scrollIntoView()
}

// Every in-page jump goes through travelTo: a native anchor jump would desync Lenis.
const route = document.querySelector<HTMLElement>('#route')
document.addEventListener('click', (e) => {
  const el = (e.target as Element).closest<HTMLElement>('[data-return], a[href^="#"]')
  if (!el) return
  e.preventDefault()
  route?.matches(':popover-open') && route.hidePopover()
  const hash = el.hasAttribute('data-return') ? '#top' : el.getAttribute('href')!
  travelTo(hash === '#top' ? 0 : hash)
  // keyboard and screen-reader users land where they were sent
  const dest = document.querySelector<HTMLElement>(hash === '#top' ? 'main' : hash)
  if (dest) {
    dest.tabIndex = -1
    dest.focus({ preventScroll: true })
  }
})

// Classic mode: plain resume without the 3D layer
const classicBtn = document.querySelector<HTMLButtonElement>('[data-classic]')!
classicBtn.addEventListener('click', () => {
  const on = root.classList.toggle('classic')
  classicBtn.setAttribute('aria-pressed', String(on))
})

async function startMotion() {
  const motion = await import('./motion')
  travelTo = motion.startMotion(stopEls).travelTo
}

async function startExperience(tier: Exclude<ReturnType<typeof detectTier>, 'off'>) {
  const { Experience } = await import('./experience/Experience')
  // Each tent is placed for the exact altitude at which its card becomes active
  // (card centre at viewport centre), so it lands in frame beside the card.
  const campScenes = campCentres.length
    ? campCentres.map((c) => sceneProgress(metresAt(c - innerHeight / 2, innerHeight, docHeight, rects).metres))
    : campAltitudes(campEls.length).map(sceneProgress)
  const skillsByLayer = layerEls.map((el) => [...el.querySelectorAll<HTMLElement>('[data-skill]')])
  const experience = new Experience(document.querySelector<HTMLElement>('.stage')!, qualityFor(tier), {
    camps: campScenes,
    skills: skillsByLayer.map((s) => s.length),
    projects: projectEls.length,
  })
  listeners.push(({ scene }) => experience.setProgress(scene))

  // The active camp's marker follows its tent on screen; transform only, no layout.
  const markers = [...document.querySelectorAll<HTMLElement>('[data-marker]')]
  experience.onCamps = (camps) => {
    camps.forEach((c, i) => {
      const show = i === activeCamp && c.visible && !root.classList.contains('classic')
      if (show) markers[i].style.transform = `translate3d(${c.x.toFixed(1)}px, ${c.y.toFixed(1)}px, 0)`
      markers[i].classList.toggle('camp-marker--shown', show)
    })
  }
  campListeners.push((i) => experience.setActiveCamp(i))
  experience.setActiveCamp(activeCamp)

  // Satellites: labels come from the rendered cards, so the scene holds no copy of the content.
  const skillNames = skillsByLayer.flat().map((el) => el.textContent ?? '')
  const skillLayer = skillsByLayer.flatMap((s, l) => s.map(() => l))
  const projectNames = projectEls.map((el) => el.querySelector('h3')?.textContent?.trim() ?? '')
  const satMarker = document.querySelector<HTMLElement>('[data-sat-marker]')!
  const satLabel = satMarker.querySelector<HTMLElement>('[data-sat-label]')!
  let satKey = ''
  let litProject = -1
  let litLayer = -1
  let hoveredProject = -1
  experience.onSatellite = (sat) => {
    const show = sat.kind !== null && sat.visible && !root.classList.contains('classic')
    if (show) {
      satMarker.style.transform = `translate3d(${sat.x.toFixed(1)}px, ${sat.y.toFixed(1)}px, 0)`
      const key = `${sat.kind}${sat.index}`
      if (key !== satKey) {
        satKey = key
        satLabel.textContent = sat.kind === 'project' ? projectNames[sat.index] : skillNames[sat.index]
      }
    }
    satMarker.classList.toggle('camp-marker--shown', show)
    // a satellite under the pointer lights its card: the project, or the skill's layer
    const project = sat.hovered && sat.kind === 'project' ? sat.index : -1
    const layer = sat.hovered && sat.kind === 'skill' ? skillLayer[sat.index] : -1
    if (project !== litProject) {
      litProject = project
      projectEls.forEach((el, i) => el.classList.toggle('project--active', i === project))
    }
    if (layer !== litLayer) {
      litLayer = layer
      layerEls.forEach((el, i) => el.classList.toggle('layer--active', i === layer))
    }
    hoveredProject = project
    root.classList.toggle('is-picking', sat.hovered)
  }

  // Picking only over the bare scene: text, cards and controls keep their own pointer behaviour.
  const overUi = (t: EventTarget | null) => t instanceof Element && !!t.closest('a, button, .project, [data-layer], .camp, .site-header, .route')
  addEventListener(
    'pointermove',
    (e) => experience.setPointer(root.classList.contains('classic') || overUi(e.target) ? null : e.clientX, e.clientY),
    { passive: true },
  )
  document.documentElement.addEventListener('pointerleave', () => experience.setPointer(null))
  // clicking a project satellite moves focus to its card, the real (accessible) link
  document.addEventListener('click', (e) => {
    if (hoveredProject < 0 || overUi(e.target)) return
    const card = projectEls[hoveredProject]
    const target = card.querySelector<HTMLElement>('a') ?? card
    if (target === card) card.tabIndex = -1
    target.focus({ preventScroll: true })
  })
  projectEls.forEach((el, i) => {
    const on = () => experience.setActiveProject(i)
    const off = () => experience.setActiveProject(-1)
    el.addEventListener('pointerenter', on)
    el.addEventListener('pointerleave', off)
    el.addEventListener('focusin', on)
    el.addEventListener('focusout', off)
  })
  update()
  root.classList.add('has-3d')
}

// Heavy work waits for the first interaction (or a quiet moment after load),
// so it never competes with the first paint; the CSS gradient covers until then.
if (!reducedMotion) {
  const tier = detectTier()
  const events = ['pointermove', 'pointerdown', 'wheel', 'touchstart', 'keydown', 'scroll'] as const
  let started = false
  const kick = () => {
    if (started) return
    started = true
    for (const e of events) removeEventListener(e, kick)
    startMotion()
    if (tier !== 'off') startExperience(tier)
  }
  for (const e of events) addEventListener(e, kick, { passive: true, once: true })
  addEventListener('load', () => setTimeout(() => ('requestIdleCallback' in window ? requestIdleCallback(kick) : kick()), 4000), { once: true })
}
