import * as THREE from 'three'
import { mulberry32 } from './terrain/noise'
import cloudVertex from '../shaders/cloud.vert'
import cloudFragment from '../shaders/cloud.frag'

// Cloud deck above the summit: one InstancedMesh of camera-facing puffs. The camera climbs
// through it, and while inside, the fog closes in — that is the veil hiding the swap to space.

const BAND = 140

// Lumpy puff drawn once on a canvas: several soft discs, brightest in the middle.
function puffTexture() {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const random = mulberry32(11)
  for (let i = 0; i < 9; i++) {
    const r = size * (0.16 + random() * 0.16)
    const x = size / 2 + (random() - 0.5) * size * 0.4
    const y = size / 2 + (random() - 0.5) * size * 0.25
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, 'rgba(255,255,255,0.55)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, size, size)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.NoColorSpace
  return texture
}

export class Clouds {
  readonly mesh: THREE.InstancedMesh<THREE.PlaneGeometry, THREE.ShaderMaterial>
  private texture: THREE.CanvasTexture

  /** `centre`: where the camera is when it is deepest in the deck */
  constructor(centre: THREE.Vector3, count: number) {
    this.texture = puffTexture()
    const material = new THREE.ShaderMaterial({
      vertexShader: cloudVertex,
      fragmentShader: cloudFragment,
      uniforms: {
        ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
        uMap: { value: this.texture },
        uLight: { value: new THREE.Color() },
        uShade: { value: new THREE.Color() },
        uOpacity: { value: 1 },
      },
      transparent: true,
      depthWrite: false,
      fog: true,
    })
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), material, count)

    // a wide deck for the view from the summit, plus a dense column the camera rises through
    const random = mulberry32(23)
    const m = new THREE.Matrix4()
    const p = new THREE.Vector3()
    const q = new THREE.Quaternion()
    const s = new THREE.Vector3()
    for (let i = 0; i < count; i++) {
      const column = i < count * 0.3
      const angle = random() * Math.PI * 2
      const radius = column ? Math.sqrt(random()) * 260 : 200 + Math.sqrt(random()) * 1500
      p.set(centre.x + Math.cos(angle) * radius, centre.y + (random() - 0.6) * BAND, centre.z + Math.sin(angle) * radius)
      s.setScalar((column ? 90 : 160) + random() * 180)
      this.mesh.setMatrixAt(i, m.compose(p, q, s))
    }
    this.mesh.instanceMatrix.needsUpdate = true
    this.mesh.computeBoundingSphere()
    // billboards grow past their matrices' extent, so culling would drop puffs at the edges
    this.mesh.frustumCulled = false
  }

  /** `light` and `shade` in linear space; `opacity` fades the deck in on the way up */
  update(light: THREE.Color, shade: THREE.Color, opacity: number) {
    const u = this.mesh.material.uniforms
    u.uLight.value.copy(light)
    u.uShade.value.copy(shade)
    u.uOpacity.value = opacity
  }

  dispose() {
    this.mesh.geometry.dispose()
    this.mesh.material.dispose()
    this.texture.dispose()
  }
}
