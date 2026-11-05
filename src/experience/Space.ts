import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { PaletteState } from './palette'
import earthVertex from '../shaders/earth.vert'
import earthFragment from '../shaders/earth.frag'
import shellVertex from '../shaders/shell.vert'
import atmosphereFragment from '../shaders/atmosphere.frag'
import karmanFragment from '../shaders/karman.frag'

// Space above the cloud deck: the planet with its atmosphere, the Kármán line, skill satellites
// on one orbit per skill layer and a satellite per project parked in front of the orbit view.
// It lives in its own corner of the world; the mountain is hidden while it is shown.

export const SPACE_START = 0.64
export const KARMAN_SCENE = 0.8
export const EARTH_RADIUS = 1600
export const EARTH_CENTER = new THREE.Vector3(0, -EARTH_RADIUS, 0)

// Camera altitude in space grows exponentially, so the 100 km line lands at scene 0.8 by itself.
const ALT_START = 12
const ALT_ORBIT = 380
const ATMOSPHERE = 70
const RING_LOW = 75
const RING_HIGH = 250
// arc of each orbit the skill satellites travel along: from just ahead of the camera to past the horizon
const ARC_FROM = 0.03
const ARC_TO = 0.55
const SKILL_SIZE = 2.6
const PROJECT_SIZE = 4.5

export function spaceAltitude(s: number) {
  const t = THREE.MathUtils.clamp((s - SPACE_START) / (1 - SPACE_START), 0, 1)
  return ALT_START * Math.pow(ALT_ORBIT / ALT_START, t)
}

const KARMAN_ALT = spaceAltitude(KARMAN_SCENE)

const tint = (geometry: THREE.BufferGeometry, hex: number) => {
  const c = new THREE.Color(hex)
  const count = geometry.getAttribute('position').count
  const colors = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) colors.set([c.r, c.g, c.b], i * 3)
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return geometry
}

// Gold box body, two blue solar wings and a dish: reads as a satellite at 20 px.
function satelliteGeometry() {
  const parts = [
    tint(new THREE.BoxGeometry(1, 1, 1.4), 0xd9a441),
    tint(new THREE.BoxGeometry(2.6, 0.06, 0.9).translate(-2, 0, 0), 0x2f5fb3),
    tint(new THREE.BoxGeometry(2.6, 0.06, 0.9).translate(2, 0, 0), 0x2f5fb3),
    tint(new THREE.ConeGeometry(0.45, 0.4, 8, 1, true).rotateX(-Math.PI / 2).translate(0, 0, 0.9), 0xd8dde6),
  ]
  const merged = mergeGeometries(parts.map((g) => g.toNonIndexed()))!
  for (const g of parts) g.dispose()
  return merged
}

// Each vertex gets its triangle's centroid, so the shader colours whole faces (the geometry is non-indexed).
function faceted<T extends THREE.BufferGeometry>(geometry: T) {
  const pos = geometry.getAttribute('position').array
  const centroids = new Float32Array(pos.length)
  for (let i = 0; i < pos.length; i += 9) {
    for (let c = 0; c < 3; c++) {
      const v = (pos[i + c] + pos[i + 3 + c] + pos[i + 6 + c]) / 3
      centroids[i + c] = centroids[i + 3 + c] = centroids[i + 6 + c] = v
    }
  }
  geometry.setAttribute('aCentroid', new THREE.BufferAttribute(centroids, 3))
  return geometry
}

export type SatelliteKind = 'project' | 'skill'

const m = new THREE.Matrix4()
const q = new THREE.Quaternion()
const scale = new THREE.Vector3()
const spin = new THREE.Euler()
const hitPoint = new THREE.Vector3()
const toSat = new THREE.Vector3()
const white = new THREE.Color(0xffffff)
const accent = new THREE.Color(0xffb347).multiplyScalar(1.6)

export class Space {
  readonly group = new THREE.Group()
  /** last pick result; `index` is -1 when nothing is under the pointer */
  readonly hit = { kind: 'project' as SatelliteKind, index: -1 }
  private earth: THREE.Mesh<THREE.IcosahedronGeometry, THREE.ShaderMaterial>
  private atmosphere: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>
  private karman: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>
  private rings: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>
  private skills: THREE.InstancedMesh
  private projects: THREE.InstancedMesh
  private skillLayer: Uint8Array
  private skillPhase: Float32Array
  private skillPos: THREE.Vector3[]
  private skillScale: Float32Array
  private projectBase: THREE.Vector3[]
  private projectPos: THREE.Vector3[]
  private projectScale: Float32Array
  private ringRadius: number[]
  private ringUp: THREE.Vector3[]
  private ahead = new THREE.Vector3(0, 0, -1)
  private sphere = new THREE.Sphere(EARTH_CENTER.clone(), EARTH_RADIUS)
  private highlight = { kind: 'project' as SatelliteKind, index: -1 }
  private disposables: Array<{ dispose(): void }> = []

  /** `skillCounts`: skills per layer, lowest layer first; `projectSpots`: one world position per project */
  constructor(skillCounts: number[], projectSpots: THREE.Vector3[], detail: number) {
    this.earth = new THREE.Mesh(
      faceted(new THREE.IcosahedronGeometry(EARTH_RADIUS, detail)),
      new THREE.ShaderMaterial({
        vertexShader: earthVertex,
        fragmentShader: earthFragment,
        uniforms: {
          ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
          uSunDir: { value: new THREE.Vector3() },
          uAtmosphere: { value: new THREE.Color(0x3d7fff) },
          uTime: { value: 0 },
        },
        fog: true,
      }),
    )
    this.earth.position.copy(EARTH_CENTER)

    const additive = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending } as const
    this.atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(EARTH_RADIUS + ATMOSPHERE, 64, 32),
      new THREE.ShaderMaterial({
        vertexShader: shellVertex,
        fragmentShader: atmosphereFragment,
        uniforms: {
          uCenter: { value: EARTH_CENTER },
          uInner: { value: EARTH_RADIUS },
          uOuter: { value: EARTH_RADIUS + ATMOSPHERE },
          uSunDir: { value: new THREE.Vector3() },
          uColor: { value: new THREE.Color(0x2f6dff) },
          uSunColor: { value: new THREE.Color(0xffb27a) },
          uStrength: { value: 1 },
        },
        side: THREE.BackSide,
        ...additive,
      }),
    )
    this.atmosphere.position.copy(EARTH_CENTER)

    this.karman = new THREE.Mesh(
      new THREE.SphereGeometry(EARTH_RADIUS + KARMAN_ALT, 96, 48),
      new THREE.ShaderMaterial({
        vertexShader: shellVertex,
        fragmentShader: karmanFragment,
        uniforms: {
          uCenter: { value: EARTH_CENTER },
          uColor: { value: new THREE.Color(0x8fe8ff) },
          uStrength: { value: 0 },
        },
        side: THREE.DoubleSide,
        ...additive,
      }),
    )
    this.karman.position.copy(EARTH_CENTER)

    // one great circle per skill layer, all passing over the camera's ground point and ahead of it,
    // each tilted a little further to the right so they fan out across the free side of the frame
    const layers = skillCounts.length
    this.ringRadius = skillCounts.map((_, i) => EARTH_RADIUS + THREE.MathUtils.lerp(RING_LOW, RING_HIGH, layers > 1 ? i / (layers - 1) : 0))
    this.ringUp = skillCounts.map((_, i) => {
      const tilt = -0.04 - i * 0.05
      return new THREE.Vector3(-Math.sin(tilt), Math.cos(tilt), 0)
    })
    const ringPoints: number[] = []
    const seg = 160
    const a = new THREE.Vector3()
    const b = new THREE.Vector3()
    for (let l = 0; l < layers; l++) {
      for (let k = 0; k < seg; k++) {
        this.ringPoint(l, (k / seg) * Math.PI * 2, a)
        this.ringPoint(l, ((k + 1) / seg) * Math.PI * 2, b)
        ringPoints.push(a.x, a.y, a.z, b.x, b.y, b.z)
      }
    }
    const ringGeometry = new THREE.BufferGeometry()
    ringGeometry.setAttribute('position', new THREE.Float32BufferAttribute(ringPoints, 3))
    this.rings = new THREE.LineSegments(ringGeometry, new THREE.LineBasicMaterial({ color: 0x8fb4ff, transparent: true, opacity: 0.2, depthWrite: false }))

    const satellite = satelliteGeometry()
    const satMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: 0x334466, emissiveIntensity: 0.6 })
    const total = skillCounts.reduce((sum, n) => sum + n, 0)
    this.skills = new THREE.InstancedMesh(satellite, satMaterial, Math.max(1, total))
    this.skills.count = total
    this.skillLayer = new Uint8Array(total)
    this.skillPhase = new Float32Array(total)
    this.skillScale = new Float32Array(total)
    this.skillPos = Array.from({ length: total }, () => new THREE.Vector3())
    let i = 0
    skillCounts.forEach((n, l) => {
      for (let k = 0; k < n; k++, i++) {
        this.skillLayer[i] = l
        // layers start offset so satellites of neighbouring orbits don't line up
        this.skillPhase[i] = (k + l * 0.37) / n
      }
    })

    this.projects = new THREE.InstancedMesh(satellite, satMaterial, Math.max(1, projectSpots.length))
    this.projects.count = projectSpots.length
    this.projectBase = projectSpots.map((p) => p.clone())
    this.projectPos = projectSpots.map((p) => p.clone())
    this.projectScale = new Float32Array(projectSpots.length)

    for (const mesh of [this.skills, this.projects]) {
      for (let k = 0; k < mesh.count; k++) mesh.setColorAt(k, white)
      // satellites move every frame; their bounds are not worth recomputing
      mesh.frustumCulled = false
    }

    this.earth.renderOrder = 0
    this.atmosphere.renderOrder = 1
    this.karman.renderOrder = 2
    this.rings.renderOrder = 3
    this.group.add(this.earth, this.atmosphere, this.karman, this.rings, this.skills, this.projects)
    this.disposables.push(
      this.earth.geometry, this.earth.material, this.atmosphere.geometry, this.atmosphere.material,
      this.karman.geometry, this.karman.material, ringGeometry, this.rings.material, satellite, satMaterial,
    )
  }

  // Point on orbit `l` at angle `angle` from the camera's ground point toward the view direction.
  private ringPoint(l: number, angle: number, out: THREE.Vector3) {
    return out
      .copy(this.ringUp[l])
      .multiplyScalar(Math.cos(angle))
      .addScaledVector(this.ahead, Math.sin(angle))
      .multiplyScalar(this.ringRadius[l])
      .add(EARTH_CENTER)
  }

  /** highlight one satellite (hovered or its card is hovered); index -1 clears */
  setHighlight(kind: SatelliteKind, index: number) {
    const h = this.highlight
    if (h.kind === kind && h.index === index) return
    if (h.index >= 0) this.paint(h.kind, h.index, white)
    h.kind = kind
    h.index = index
    if (index >= 0) this.paint(kind, index, accent)
  }

  private paint(kind: SatelliteKind, index: number, color: THREE.Color) {
    const mesh = kind === 'project' ? this.projects : this.skills
    if (index >= mesh.count) return
    mesh.setColorAt(index, color)
    mesh.instanceColor!.needsUpdate = true
  }

  positionOf(kind: SatelliteKind, index: number): THREE.Vector3 | undefined {
    return kind === 'project' ? this.projectPos[index] : this.skillPos[index]
  }

  /** the satellite under the ray, generous enough for a 20 px target; the planet blocks the ones behind it */
  pick(ray: THREE.Ray) {
    let best = Infinity
    this.hit.index = -1
    const planet = ray.intersectSphere(this.sphere, hitPoint) ? ray.origin.distanceTo(hitPoint) : Infinity
    const test = (kind: SatelliteKind, positions: THREE.Vector3[], scales: Float32Array, size: number) => {
      for (let i = 0; i < positions.length; i++) {
        if (scales[i] < size * 0.4) continue
        const p = positions[i]
        const along = toSat.subVectors(p, ray.origin).dot(ray.direction)
        if (along <= 0 || along > planet || along > best) continue
        const radius = Math.max(size * 1.6, along * 0.03)
        if (ray.distanceSqToPoint(p) > radius * radius) continue
        best = along
        this.hit.kind = kind
        this.hit.index = i
      }
    }
    test('project', this.projectPos, this.projectScale, PROJECT_SIZE)
    test('skill', this.skillPos, this.skillScale, SKILL_SIZE)
    return this.hit.index >= 0
  }

  update(s: number, time: number, palette: PaletteState, veil: number) {
    const clear = 1 - veil
    const earthU = this.earth.material.uniforms
    earthU.uSunDir.value.copy(palette.sunDir)
    earthU.uTime.value = time
    // the planet turns under the camera, as if the orbit carried it forward
    this.earth.rotation.x = time * 0.0025

    const atmoU = this.atmosphere.material.uniforms
    atmoU.uSunDir.value.copy(palette.sunDir)
    atmoU.uStrength.value = clear
    const flare = Math.exp(-(((s - KARMAN_SCENE) / 0.018) ** 2))
    this.karman.material.uniforms.uStrength.value = (0.12 + flare * 1.6) * clear
    this.rings.material.opacity = 0.2 * clear

    const hi = this.highlight
    for (let i = 0; i < this.skillPos.length; i++) {
      const l = this.skillLayer[i]
      const f = (this.skillPhase[i] + time * (0.006 + l * 0.0012)) % 1
      this.ringPoint(l, THREE.MathUtils.lerp(ARC_FROM, ARC_TO, f), this.skillPos[i])
      // shrink to nothing at both ends of the arc so the loop never pops
      const boost = hi.kind === 'skill' && hi.index === i ? 1.6 : 1
      this.skillScale[i] = SKILL_SIZE * Math.sqrt(Math.sin(f * Math.PI)) * boost
      spin.set(time * 0.3 + i, time * 0.2, 0)
      m.compose(this.skillPos[i], q.setFromEuler(spin), scale.setScalar(this.skillScale[i]))
      this.skills.setMatrixAt(i, m)
    }
    this.skills.instanceMatrix.needsUpdate = true

    // project satellites drift in as the orbit comes into view
    const arrive = THREE.MathUtils.smoothstep(s, 0.86, 0.97)
    for (let i = 0; i < this.projectPos.length; i++) {
      const p = this.projectPos[i].copy(this.projectBase[i])
      p.y += Math.sin(time * 0.6 + i * 1.7) * 1.5
      const boost = hi.kind === 'project' && hi.index === i ? 1.35 : 1
      this.projectScale[i] = PROJECT_SIZE * arrive * boost
      spin.set(0.3, time * 0.15 + i * 1.3, Math.sin(time * 0.4 + i) * 0.2)
      m.compose(p, q.setFromEuler(spin), scale.setScalar(this.projectScale[i]))
      this.projects.setMatrixAt(i, m)
    }
    this.projects.instanceMatrix.needsUpdate = true
  }

  dispose() {
    for (const d of this.disposables) d.dispose()
  }
}
