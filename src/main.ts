import './styles/main.css'
import Lenis from 'lenis'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { formatAltitude, progressToMetres, zoneOf } from './content/altitude'
import { detectTier, qualityFor } from './experience/quality'

gsap.registerPlugin(ScrollTrigger)

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
const lenis = new Lenis({ autoRaf: false, lerp: reducedMotion ? 1 : 0.1 })
lenis.on('scroll', ScrollTrigger.update)
gsap.ticker.add((t) => lenis.raf(t * 1000))
gsap.ticker.lagSmoothing(0)

const listeners: Array<(p: number) => void> = []
lenis.on('scroll', () => {
  const p = lenis.limit > 0 ? lenis.scroll / lenis.limit : 0
  for (const fn of listeners) fn(p)
})

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

// Section reveals: scrubbed, so scrolling back rewinds them
if (!reducedMotion) {
  for (const stop of document.querySelectorAll<HTMLElement>('.stop')) {
    gsap.from(stop.children, {
      y: 40,
      opacity: 0,
      stagger: 0.08,
      ease: 'expo.out',
      scrollTrigger: { trigger: stop, start: 'top 80%', end: 'top 40%', scrub: true },
    })
  }
}

// Fast travel behind a veil: the scenes in between are never rendered
const veil = document.querySelector<HTMLElement>('.veil')!
async function travelTo(target: number | string) {
  if (reducedMotion) return lenis.scrollTo(target, { immediate: true })
  await gsap.to(veil, { opacity: 1, duration: 0.6, ease: 'power2.in' })
  lenis.scrollTo(target, { immediate: true, force: true })
  await gsap.to(veil, { opacity: 0, duration: 0.8, ease: 'power2.out', delay: 0.2 })
}
for (const el of document.querySelectorAll('[data-return]')) {
  el.addEventListener('click', (e) => {
    e.preventDefault()
    travelTo(0)
  })
}
document.querySelector('[data-launch]')?.addEventListener('click', (e) => {
  e.preventDefault()
  travelTo('#contact')
})

// Classic mode: plain resume without the 3D layer
const classicBtn = document.querySelector<HTMLButtonElement>('[data-classic]')!
classicBtn.addEventListener('click', () => {
  const on = document.documentElement.classList.toggle('classic')
  classicBtn.setAttribute('aria-pressed', String(on))
})

// 3D loads after the content is on screen, as a separate chunk
const tier = detectTier()
if (tier !== 'off') {
  const start = async () => {
    const { Experience } = await import('./experience/Experience')
    const stage = document.querySelector<HTMLElement>('.stage')!
    const experience = new Experience(stage, qualityFor(tier))
    listeners.push((p) => experience.setProgress(p))
    document.documentElement.classList.add('has-3d')
  }
  'requestIdleCallback' in window ? requestIdleCallback(start, { timeout: 1500 }) : setTimeout(start, 300)
}
