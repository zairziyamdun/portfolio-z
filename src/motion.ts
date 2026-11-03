import Lenis from 'lenis'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

// Smooth scroll, scrubbed reveals and veil travel; loaded lazily after first paint.
export function startMotion() {
  gsap.registerPlugin(ScrollTrigger)

  const lenis = new Lenis({ autoRaf: false, lerp: 0.1 })
  lenis.on('scroll', ScrollTrigger.update)
  gsap.ticker.add((t) => lenis.raf(t * 1000))
  gsap.ticker.lagSmoothing(0)

  // Section reveals: scrubbed, so scrolling back rewinds them
  for (const stop of document.querySelectorAll<HTMLElement>('.stop')) {
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
