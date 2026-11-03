import './styles/main.css'
import { formatAltitude, progressToMetres, zoneOf } from './content/altitude'
import { detectTier, qualityFor } from './experience/quality'

// Critical path only: altimeter, buttons, classic mode. Motion and 3D load later as chunks.

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
const root = document.documentElement

const progress = () => {
  const limit = root.scrollHeight - innerHeight
  return limit > 0 ? Math.min(1, scrollY / limit) : 0
}

// Native scroll events fire for Lenis frames too, so one listener serves both.
const listeners: Array<(p: number) => void> = []
let queued = false
addEventListener(
  'scroll',
  () => {
    if (queued) return
    queued = true
    requestAnimationFrame(() => {
      queued = false
      const p = progress()
      for (const fn of listeners) fn(p)
    })
  },
  { passive: true },
)

// Altimeter
const valueEl = document.querySelector<HTMLElement>('[data-altimeter-value]')!
const unitEl = document.querySelector<HTMLElement>('[data-altimeter-unit]')!
const zoneEl = document.querySelector<HTMLElement>('[data-altimeter-zone]')!
listeners.push((p) => {
  const metres = progressToMetres(p)
  const { value, unit } = formatAltitude(metres)
  valueEl.textContent = value
  unitEl.textContent = unit
  zoneEl.textContent = zoneOf(metres)
})

// Travel: veil animation once motion is loaded, plain jump before that
let travelTo = (target: number | string) => {
  if (typeof target === 'number') scrollTo({ top: target })
  else document.querySelector(target)?.scrollIntoView()
}
// Every in-page jump goes through travelTo: a native anchor jump would desync Lenis.
document.addEventListener('click', (e) => {
  const el = (e.target as Element).closest<HTMLElement>('[data-return], a[href^="#"]')
  if (!el) return
  e.preventDefault()
  const hash = el.hasAttribute('data-return') ? '#top' : el.getAttribute('href')!
  travelTo(hash === '#top' ? 0 : hash)
  // keyboard and screen-reader users land where they were sent
  const target = document.querySelector<HTMLElement>(hash === '#top' ? 'main' : hash)
  if (target) {
    target.tabIndex = -1
    target.focus({ preventScroll: true })
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
  travelTo = motion.startMotion().travelTo
}

async function startExperience(tier: Exclude<ReturnType<typeof detectTier>, 'off'>) {
  const { Experience } = await import('./experience/Experience')
  const experience = new Experience(document.querySelector<HTMLElement>('.stage')!, qualityFor(tier))
  experience.setProgress(progress())
  listeners.push((p) => experience.setProgress(p))
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
