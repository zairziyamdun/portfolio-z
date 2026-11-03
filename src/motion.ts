import Lenis from 'lenis'
import Snap from 'lenis/snap'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

// Smooth scroll, stop magnets, scrubbed reveals and veil travel; loaded lazily after first paint.
export function startMotion(stops: HTMLElement[]) {
  gsap.registerPlugin(ScrollTrigger)

  const lenis = new Lenis({ autoRaf: false, lerp: 0.1 })
  lenis.on('scroll', ScrollTrigger.update)
  gsap.ticker.add((t) => lenis.raf(t * 1000))
  gsap.ticker.lagSmoothing(0)

  // Proximity, not mandatory: only a stop start close to the viewport top pulls,
  // so tall sections like the camps stay freely readable.
  const snap = new Snap(lenis, { type: 'proximity', distanceThreshold: '25%', debounce: 350, duration: 0.9, easing: (t) => 1 - Math.pow(1 - t, 4) })
  for (const el of stops) snap.addElement(el, { align: 'start' })

  // Section reveals: scrubbed, so scrolling back rewinds them
  for (const stop of stops) {
    gsap.from(stop.children, {
      y: 40,
      opacity: 0,
      stagger: 0.08,
      ease: 'expo.out',
      scrollTrigger: { trigger: stop, start: 'top 80%', end: 'top 40%', scrub: true },
    })
  }

  // Fast travel behind a veil: the scenes in between are never rendered
  const veil = document.querySelector<HTMLElement>('.veil')!
  async function travelTo(target: number | string) {
    await gsap.to(veil, { opacity: 1, duration: 0.6, ease: 'power2.in' })
    lenis.scrollTo(target, { immediate: true, force: true })
    await gsap.to(veil, { opacity: 0, duration: 0.8, ease: 'power2.out', delay: 0.2 })
  }

  return { travelTo }
}
