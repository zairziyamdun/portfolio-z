import './styles/main.css'
import { formatAltitude, metresAt, sceneProgress, type StopRect } from './content/altitude'
import type { StopId } from './content/schema'
import { detectTier, qualityFor } from './experience/quality'

// Critical path only: altimeter, links, menu, classic mode. Motion and 3D load later as chunks.

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
const root = document.documentElement
const stopEls = [...document.querySelectorAll<HTMLElement>('[data-stop]')]
const labels = new Map(stopEls.map((el) => [el.dataset.stop as StopId, el.dataset.label ?? '']))

// Stop positions are cached and refreshed on layout changes, never read per frame.
let rects: StopRect[] = []
let docHeight = 0
const measure = () => {
  rects = stopEls.map((el) => {
    const r = el.getBoundingClientRect()
    return { id: el.dataset.stop as StopId, top: r.top + scrollY }
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
  const experience = new Experience(document.querySelector<HTMLElement>('.stage')!, qualityFor(tier))
  listeners.push(({ scene }) => experience.setProgress(scene))
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
