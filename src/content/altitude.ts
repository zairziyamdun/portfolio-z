import type { StopId } from './schema'

// Altitude range each stop covers while it scrolls past; the single source for
// the altimeter, the kickers and the scene. Summit and orbit are plateaus: the meter holds there.
// Past the Kármán line (100 km) the meter jumps to orbit; its easing makes that read as a launch.
export const STOP_ALTITUDES: Record<StopId, readonly [from: number, to: number]> = {
  base: [0, 1_000],
  foothills: [1_000, 3_000],
  camps: [3_000, 8_848],
  summit: [8_848, 8_848],
  atmosphere: [8_848, 100_000],
  orbit: [400_000, 400_000],
}

export interface StopRect {
  id: StopId
  top: number
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

// A stop's range spans from its top reaching the viewport top to the next stop's top doing the same,
// so arriving at a stop shows exactly its lower bound. The last stop runs until max scroll.
export function metresAt(scrollY: number, viewport: number, docHeight: number, stops: StopRect[]) {
  const limit = Math.max(0, docHeight - viewport)
  const y = Math.min(scrollY, limit)
  let i = 0
  for (let k = 0; k < stops.length; k++) if (y >= Math.min(stops[k].top, limit) - 1) i = k
  const stop = stops[i]
  const start = Math.min(stop.top, limit)
  const end = i + 1 < stops.length ? Math.min(stops[i + 1].top, limit) : limit
  const [from, to] = STOP_ALTITUDES[stop.id]
  // sub-pixel spans (a last stop exactly one viewport tall) count as fully climbed
  const t = end - start > 1 ? clamp01((y - start) / (end - start)) : 1
  return { metres: from + (to - from) * t, stop: stop.id }
}

// Scene scale for shaders: most of the 0..1 range is the mountain, space goes by fast.
const SCENE_KEYS: Array<[metres: number, progress: number]> = [
  [0, 0],
  [8_848, 0.6],
  [100_000, 0.8],
  [400_000, 1],
]

export function sceneProgress(metres: number): number {
  for (let i = 1; i < SCENE_KEYS.length; i++) {
    const [m0, p0] = SCENE_KEYS[i - 1]
    const [m1, p1] = SCENE_KEYS[i]
    if (metres <= m1) return p0 + clamp01((metres - m0) / (m1 - m0)) * (p1 - p0)
  }
  return 1
}

const KM_FROM = 10_000

export function formatAltitude(metres: number, locale = 'ru'): { value: string; unit: string } {
  if (metres < KM_FROM) return { value: Math.round(metres).toLocaleString(locale), unit: 'м' }
  return { value: Math.round(metres / 1000).toLocaleString(locale), unit: 'км' }
}

// «0 – 1 000 м», «8 848 м», «8,8 – 100 км»
export function formatRange(from: number, to: number, locale = 'ru'): string {
  if (to < KM_FROM) {
    const f = (m: number) => m.toLocaleString(locale)
    return from === to ? `${f(from)} м` : `${f(from)} – ${f(to)} м`
  }
  const km = (m: number) => (m / 1000).toLocaleString(locale, { maximumFractionDigits: m < KM_FROM ? 1 : 0 })
  return from === to ? `${km(from)} км` : `${km(from)} – ${km(to)} км`
}
