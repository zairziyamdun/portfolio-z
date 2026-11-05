export type Tier = 'off' | 'low' | 'mid' | 'high'

export interface Quality {
  tier: Tier
  maxDpr: number
  antialias: boolean
  particles: number
  terrainSegments: number
  trees: number
  rocks: number
  clouds: number
  earthDetail: number
  postprocessing: boolean
}

const PRESETS: Record<Exclude<Tier, 'off'>, Omit<Quality, 'tier'>> = {
  low: { maxDpr: 0.75, antialias: false, particles: 800, terrainSegments: 96, trees: 300, rocks: 100, clouds: 70, earthDetail: 14, postprocessing: false },
  mid: { maxDpr: 1, antialias: false, particles: 2_000, terrainSegments: 160, trees: 800, rocks: 250, clouds: 140, earthDetail: 20, postprocessing: false },
  high: { maxDpr: 1.5, antialias: true, particles: 5_000, terrainSegments: 256, trees: 1_600, rocks: 500, clouds: 260, earthDetail: 28, postprocessing: true },
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
