import * as THREE from 'three'

// Sky, fog and light keyed by scene progress. The ground keys match the CSS fallback gradient
// in main.css, so the canvas fades in without a colour jump. The sun rises as you climb; past the
// cloud veil (0.64) it jumps ahead of the camera, just under the planet's limb, and dawns at the Kármán line.

interface Key {
  at: number
  top: number
  horizon: number
  ambient: number
  sun: number
  sunElevation: number
  sunAzimuth: number
  sunIntensity: number
  hemi: number
  fog: number
}

// `ambient` is the cool sky light that keeps shadowed snow blue-grey instead of brown.
const KEYS: Key[] = [
  { at: 0, top: 0x12223f, horizon: 0x52434f, ambient: 0x6c7fae, sun: 0xff8a5c, sunElevation: 0.04, sunAzimuth: 2.3, sunIntensity: 0.9, hemi: 0.7, fog: 0.0011 },
  { at: 0.6, top: 0x08122e, horizon: 0x1f335c, ambient: 0x9db1de, sun: 0xffd2a8, sunElevation: 0.14, sunAzimuth: 2.3, sunIntensity: 1.5, hemi: 0.95, fog: 0.0005 },
  { at: 0.64, top: 0x040a1e, horizon: 0x15254a, ambient: 0x8496c4, sun: 0xffdcb8, sunElevation: 0.17, sunAzimuth: 2.3, sunIntensity: 1.7, hemi: 0.75, fog: 0.0004 },
  { at: 0.645, top: 0x000005, horizon: 0x03081a, ambient: 0x58698f, sun: 0xffc896, sunElevation: -0.3, sunAzimuth: -1.1, sunIntensity: 2.0, hemi: 0.4, fog: 0.00002 },
  { at: 1, top: 0x000003, horizon: 0x02050f, ambient: 0x58698f, sun: 0xfff1dc, sunElevation: -0.2, sunAzimuth: -1.1, sunIntensity: 2.0, hemi: 0.45, fog: 0.00001 },
]

export interface PaletteState {
  top: THREE.Color
  horizon: THREE.Color
  ambient: THREE.Color
  sun: THREE.Color
  sunDir: THREE.Vector3
  sunIntensity: number
  hemi: number
  fog: number
}

const a = new THREE.Color()
const b = new THREE.Color()

export function createPaletteState(): PaletteState {
  return { top: new THREE.Color(), horizon: new THREE.Color(), ambient: new THREE.Color(), sun: new THREE.Color(), sunDir: new THREE.Vector3(), sunIntensity: 0, hemi: 0, fog: 0 }
}

// Writes into `out` to avoid per-frame allocations.
export function samplePalette(s: number, out: PaletteState): PaletteState {
  let i = 1
  while (i < KEYS.length - 1 && s > KEYS[i].at) i++
  const k0 = KEYS[i - 1]
  const k1 = KEYS[i]
  const t = THREE.MathUtils.smoothstep(s, k0.at, k1.at)
  const lerp = THREE.MathUtils.lerp

  out.top.copy(a.setHex(k0.top)).lerp(b.setHex(k1.top), t)
  out.horizon.copy(a.setHex(k0.horizon)).lerp(b.setHex(k1.horizon), t)
  out.ambient.copy(a.setHex(k0.ambient)).lerp(b.setHex(k1.ambient), t)
  out.sun.copy(a.setHex(k0.sun)).lerp(b.setHex(k1.sun), t)
  const elevation = lerp(k0.sunElevation, k1.sunElevation, t)
  const azimuth = lerp(k0.sunAzimuth, k1.sunAzimuth, t)
  out.sunDir.set(Math.cos(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.sin(azimuth) * Math.cos(elevation)).normalize()
  out.sunIntensity = lerp(k0.sunIntensity, k1.sunIntensity, t)
  out.hemi = lerp(k0.hemi, k1.hemi, t)
  out.fog = lerp(k0.fog, k1.fog, t)
  return out
}
