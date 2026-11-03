import { createNoise2D, fbm, mulberry32, ridged } from './noise'

// Pure terrain generation: heightfield, vertex colours, scattered props and the camera path.
// Runs in a worker; no three.js here so the worker chunk stays tiny.

export interface TerrainOptions {
  seed: number
  segments: number
  trees: number
  rocks: number
  /** camera-path positions (0..1) where camps are pitched */
  camps: number[]
}

export interface TerrainData {
  positions: Float32Array
  normals: Float32Array
  colors: Float32Array
  index: Uint32Array
  /** x, y, z, scale, rotation per tree */
  trees: Float32Array
  /** x, y, z, scale, rotation per rock */
  rocks: Float32Array
  /** x, y, z per camera path sample, base camp → summit */
  path: Float32Array
  /** x, y, z, rotation per camp, on the flattest ground near its spot */
  camps: Float32Array
  summit: [number, number, number]
}

export const TERRAIN_SIZE = 2600
const HEIGHT = 620
const RADIUS = 820
const PATH_SAMPLES = 240

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

type RGB = [number, number, number]
const hex = (h: number): RGB => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255]
const mix = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))

// Pre-dawn palette: dark enough that light text over the scene keeps its contrast.
const GRASS_LOW = hex(0x1c2a24)
const GRASS_HIGH = hex(0x2a3328)
const ROCK = hex(0x46434d)
const ROCK_DARK = hex(0x2c2a33)
const SNOW = hex(0xc4cfdf)

export function generateTerrain({ seed, segments, trees, rocks, camps }: TerrainOptions): TerrainData {
  const n1 = createNoise2D(seed)
  const n2 = createNoise2D(seed + 1)
  const n3 = createNoise2D(seed + 2)
  const random = mulberry32(seed + 3)

  const height = (x: number, z: number) => {
    const d = Math.hypot(x, z) / RADIUS
    const cone = Math.exp(-d * d * 1.8)
    // domain warp bends the ridges so they don't look like a noise texture
    const wx = fbm(n2, x * 0.001, z * 0.001, 3) * 140
    const wz = fbm(n2, x * 0.001 + 31.7, z * 0.001 - 12.3, 3) * 140
    // fewer octaves near the peak: high-frequency ridges turn into spikes at grid resolution
    const r = ridged(n1, (x + wx) * 0.0019, (z + wz) * 0.0019, 4)
    const foothills = fbm(n1, x * 0.004 + 100, z * 0.004, 4) * 38 * (1 - cone * 0.6)
    const detail = fbm(n3, x * 0.02, z * 0.02, 3) * 6 * (1 - cone * 0.7)
    return HEIGHT * cone * (0.72 + 0.32 * r) + foothills + detail
  }

  // summit: highest point near the centre
  let summit: [number, number, number] = [0, height(0, 0), 0]
  for (let x = -260; x <= 260; x += 10) {
    for (let z = -260; z <= 260; z += 10) {
      const y = height(x, z)
      if (y > summit[1]) summit = [x, y, z]
    }
  }
  const peak = summit[1]

  // heightfield grid
  const verts = segments + 1
  const step = TERRAIN_SIZE / segments
  const half = TERRAIN_SIZE / 2
  const heights = new Float32Array(verts * verts)
  for (let iz = 0; iz < verts; iz++) {
    for (let ix = 0; ix < verts; ix++) heights[iz * verts + ix] = height(ix * step - half, iz * step - half)
  }

  const positions = new Float32Array(verts * verts * 3)
  const normals = new Float32Array(verts * verts * 3)
  const colors = new Float32Array(verts * verts * 3)
  const h = (ix: number, iz: number) => heights[Math.min(verts - 1, Math.max(0, iz)) * verts + Math.min(verts - 1, Math.max(0, ix))]

  for (let iz = 0; iz < verts; iz++) {
    for (let ix = 0; ix < verts; ix++) {
      const i = iz * verts + ix
      const x = ix * step - half
      const z = iz * step - half
      const y = heights[i]
      positions.set([x, y, z], i * 3)

      const dx = (h(ix + 1, iz) - h(ix - 1, iz)) / (2 * step)
      const dz = (h(ix, iz + 1) - h(ix, iz - 1)) / (2 * step)
      const len = Math.hypot(dx, 1, dz)
      const ny = 1 / len
      normals.set([-dx / len, ny, -dz / len], i * 3)

      const h01 = y / peak
      const slope = 1 - ny
      const vary = fbm(n3, x * 0.008, z * 0.008, 2)
      let c = mix(GRASS_LOW, GRASS_HIGH, smoothstep(0.05, 0.4, h01 + vary * 0.05))
      const rock = Math.max(smoothstep(0.22, 0.42, slope), smoothstep(0.42, 0.55, h01 + vary * 0.04))
      c = mix(c, mix(ROCK_DARK, ROCK, smoothstep(0.3, 0.8, h01) + vary * 0.2), rock)
      // snow holds on steeper faces the higher it is, so the peak reads white
      const snowline = 0.6 + vary * 0.06
      const snowSlope = lerp(0.45, 0.8, smoothstep(0.6, 0.95, h01))
      const snow = smoothstep(snowline - 0.03, snowline + 0.03, h01) * (1 - smoothstep(snowSlope - 0.15, snowSlope, slope))
      c = mix(c, SNOW, snow)
      // three.js treats vertex colours as linear; the palette above is authored in sRGB
      colors.set([toLinear(c[0]), toLinear(c[1]), toLinear(c[2])], i * 3)
    }
  }

  const index = new Uint32Array(segments * segments * 6)
  let k = 0
  for (let iz = 0; iz < segments; iz++) {
    for (let ix = 0; ix < segments; ix++) {
      const a = iz * verts + ix
      const b = a + 1
      const c = a + verts
      const d = c + 1
      index.set([a, c, b, b, c, d], k)
      k += 6
    }
  }

  const slopeAt = (x: number, z: number) => {
    const e = 4
    const dx = (height(x + e, z) - height(x - e, z)) / (2 * e)
    const dz = (height(x, z + e) - height(x, z - e)) / (2 * e)
    return 1 - 1 / Math.hypot(dx, 1, dz)
  }

  const scatter = (count: number, accept: (h01: number, slope: number, x: number, z: number) => boolean, scale: [number, number]) => {
    const out = new Float32Array(count * 5)
    let placed = 0
    for (let tries = 0; placed < count && tries < count * 40; tries++) {
      const a = random() * Math.PI * 2
      const r = Math.sqrt(random()) * 1150
      const x = Math.cos(a) * r
      const z = Math.sin(a) * r
      const y = height(x, z)
      if (!accept(y / peak, slopeAt(x, z), x, z)) continue
      out.set([x, y, z, lerp(scale[0], scale[1], random()), random() * Math.PI * 2], placed * 5)
      placed++
    }
    return out.subarray(0, placed * 5)
  }

  const treeData = scatter(trees, (h01, slope, x, z) => h01 < 0.34 && slope < 0.12 && fbm(n2, x * 0.006, z * 0.006, 2) > -0.15, [7, 15])
  const rockData = scatter(rocks, (h01, slope) => h01 > 0.15 && h01 < 0.8 && slope > 0.12 && slope < 0.5, [3, 10])

  // Camera path: an ascending spiral around the peak, kept clear of the ground.
  const path = new Float32Array(PATH_SAMPLES * 3)
  const groundClear = (x: number, z: number) => {
    let g = height(x, z)
    for (const [ox, oz] of [[30, 0], [-30, 0], [0, 30], [0, -30]]) g = Math.max(g, height(x + ox, z + oz))
    return g
  }
  const startY = groundClear(Math.cos(0.6) * 1150, Math.sin(0.6) * 1150) + 16
  for (let s = 0; s < PATH_SAMPLES; s++) {
    const t = s / (PATH_SAMPLES - 1)
    const angle = 0.6 + t * Math.PI * 2 * 1.6
    // ends beside the peak, slightly above it, so the summit reads as a silhouette against the sky
    const r = lerp(1150, 190, Math.pow(t, 0.85))
    const x = summit[0] + Math.cos(angle) * r
    const z = summit[2] + Math.sin(angle) * r
    const climb = lerp(startY, peak + 40, Math.pow(t, 1.35))
    path.set([x, Math.max(climb, groundClear(x, z) + lerp(16, 40, t)), z], s * 3)
  }
  // smooth the height so ridges under the path don't make the camera jitter
  const smoothed = path.slice()
  for (let s = 2; s < PATH_SAMPLES - 2; s++) {
    let sum = 0
    for (let o = -2; o <= 2; o++) sum += path[(s + o) * 3 + 1]
    smoothed[s * 3 + 1] = Math.max(sum / 5, path[s * 3 + 1])
  }

  // Camps: a little ahead of the camera on the trail and pulled toward the peak, so they
  // land in frame while their card is read; then the flattest spot within a few metres.
  const campData = new Float32Array(camps.length * 4)
  const pathAt = (t: number, axis: number) => {
    const f = Math.min(1, Math.max(0, t)) * (PATH_SAMPLES - 1)
    const i = Math.min(PATH_SAMPLES - 2, Math.floor(f))
    return lerp(smoothed[i * 3 + axis], smoothed[(i + 1) * 3 + axis], f - i)
  }
  camps.forEach((t, c) => {
    const ax = lerp(pathAt(t + 0.07, 0), summit[0], 0.3)
    const az = lerp(pathAt(t + 0.07, 2), summit[2], 0.3)
    let best = [ax, az]
    let bestSlope = Infinity
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2
      const r = k % 2 ? 18 : 36
      const x = ax + Math.cos(a) * r
      const z = az + Math.sin(a) * r
      const sl = slopeAt(x, z)
      if (sl < bestSlope) {
        bestSlope = sl
        best = [x, z]
      }
    }
    // tent door faces the trail
    const rot = Math.atan2(pathAt(t, 0) - best[0], pathAt(t, 2) - best[1])
    campData.set([best[0], height(best[0], best[1]), best[1], rot], c * 4)
  })

  // clear the pitch: no tree or rock through a tent
  const clearOfCamps = (data: Float32Array) => {
    const kept: number[] = []
    for (let i = 0; i < data.length; i += 5) {
      let free = true
      for (let c = 0; c < campData.length; c += 4) {
        if (Math.hypot(data[i] - campData[c], data[i + 2] - campData[c + 2]) < 24) free = false
      }
      if (free) for (let k = 0; k < 5; k++) kept.push(data[i + k])
    }
    return new Float32Array(kept)
  }

  return { positions, normals, colors, index, trees: clearOfCamps(treeData), rocks: clearOfCamps(rockData), path: smoothed, camps: campData, summit }
}
