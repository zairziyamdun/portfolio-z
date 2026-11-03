export type Tier = 'off' | 'low' | 'mid' | 'high'

export interface Quality {
  tier: Tier
  maxDpr: number
  particles: number
  postprocessing: boolean
}

const PRESETS: Record<Exclude<Tier, 'off'>, Omit<Quality, 'tier'>> = {
  low: { maxDpr: 0.75, particles: 800, postprocessing: false },
  mid: { maxDpr: 1, particles: 2_000, postprocessing: false },
  high: { maxDpr: 1.5, particles: 5_000, postprocessing: true },
}

// Cheap heuristic; adaptive DPR at runtime corrects a wrong guess.
export function detectTier(): Tier {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return 'off'
  const gl = document.createElement('canvas').getContext('webgl2')
  if (!gl) return 'off'

  const cores = navigator.hardwareConcurrency ?? 4
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4
  const mobile = matchMedia('(pointer: coarse)').matches
  gl.getExtension('WEBGL_lose_context')?.loseContext()

  if (cores <= 4 || memory <= 2) return 'low'
  if (mobile || memory <= 4) return 'mid'
  return 'high'
}

export function qualityFor(tier: Exclude<Tier, 'off'>): Quality {
  return { tier, ...PRESETS[tier] }
}
