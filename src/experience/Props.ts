import * as THREE from 'three'

// Procedural low-poly camps and the summit flag: no assets to load, same faceted style as the terrain.

const FLAG_W = 8
const FLAG_H = 5

// Ridge tent as a triangular prism with a dark door, flat-shaded via non-indexed faces.
function tentGeometry() {
  const w = 0.5
  const l = 0.75
  const h = 0.8
  const fl = [-w, 0, l], fr = [w, 0, l], fa = [0, h, l]
  const bl = [-w, 0, -l], br = [w, 0, -l], ba = [0, h, -l]
  const body = [fl, fr, fa, br, bl, ba, fl, fa, ba, fl, ba, bl, fr, br, ba, fr, ba, fa]
  const door = [[-0.18, 0, l + 0.01], [0.18, 0, l + 0.01], [0, 0.5, l + 0.01]]
  const positions = new Float32Array([...body, ...door].flat())
  const colors = new Float32Array(positions.length)
  const canvas = new THREE.Color(0xe46f2a)
  const shade = new THREE.Color(0x2a140a)
  for (let v = 0; v < positions.length / 3; v++) {
    const c = v < body.length ? canvas : shade
    colors.set([c.r, c.g, c.b], v * 3)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  g.computeVertexNormals()
  return g
}

function glowTexture() {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.25, 'rgba(255,255,255,0.45)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  return new THREE.CanvasTexture(canvas)
}

export class Props {
  readonly group = new THREE.Group()
  /** world-space anchor above each tent, for screen markers */
  readonly campAnchors: THREE.Vector3[] = []
  private glows: THREE.Sprite[] = []
  private flagGeometry: THREE.PlaneGeometry
  private flagRest: Float32Array
  private active = -1
  private disposables: Array<{ dispose(): void }> = []

  /** `camps`: x, y, z, rotation, scale per camp */
  constructor(camps: Float32Array, summit: [number, number, number]) {
    const tent = tentGeometry()
    const tentMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: 0xff6a1f, emissiveIntensity: 0.22 })
    const count = camps.length / 5
    const tents = new THREE.InstancedMesh(tent, tentMaterial, count)
    const glowMap = glowTexture()
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const s = new THREE.Vector3()
    const p = new THREE.Vector3()
    const up = new THREE.Vector3(0, 1, 0)

    for (let i = 0; i < count; i++) {
      const [x, y, z, rot, scale] = camps.subarray(i * 5, i * 5 + 5)
      tents.setMatrixAt(i, m.compose(p.set(x, y - 0.05 * scale, z), q.setFromAxisAngle(up, rot), s.setScalar(scale)))

      // lantern glow in front of the door: marks the camp from far away
      const glow = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: glowMap, color: 0xffb347, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }),
      )
      glow.position.set(x + Math.sin(rot) * scale, y + scale * 0.35, z + Math.cos(rot) * scale)
      glow.scale.setScalar(scale * 2)
      glow.userData.base = scale * 2
      this.glows.push(glow)
      this.group.add(glow)
      this.disposables.push(glow.material)
      this.campAnchors.push(new THREE.Vector3(x, y + scale * 1.3, z))
    }
    tents.instanceMatrix.needsUpdate = true
    tents.computeBoundingSphere()
    this.group.add(tents)

    // summit flag: pole + cloth whose vertices wave every frame
    // oversized on purpose: it is seen from ~200 units away and has to read as a flag
    const [sx, sy, sz] = summit
    const summitFlag = new THREE.Group()
    summitFlag.position.set(sx, sy - 2, sz)
    summitFlag.scale.setScalar(2.2)
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 16, 6).translate(0, 8, 0), new THREE.MeshLambertMaterial({ color: 0x9aa3b2 }))
    this.flagGeometry = new THREE.PlaneGeometry(FLAG_W, FLAG_H, 12, 6).translate(FLAG_W / 2, 0, 0)
    this.flagRest = (this.flagGeometry.getAttribute('position').array as Float32Array).slice()
    const flag = new THREE.Mesh(
      this.flagGeometry,
      new THREE.MeshLambertMaterial({ color: 0xffb347, emissive: 0xff8a1f, emissiveIntensity: 0.35, side: THREE.DoubleSide, flatShading: true }),
    )
    flag.position.set(0, 16 - FLAG_H / 2, 0)
    summitFlag.add(pole, flag)
    this.group.add(summitFlag)

    this.disposables.push(tent, tentMaterial, glowMap, pole.geometry, pole.material, this.flagGeometry, flag.material)
  }

  setActiveCamp(index: number) {
    this.active = index
  }

  update(time: number) {
    // wave travels from the pole to the free edge; amplitude grows along the cloth
    const pos = this.flagGeometry.getAttribute('position') as THREE.BufferAttribute
    const arr = pos.array as Float32Array
    for (let i = 0; i < arr.length; i += 3) {
      const x = this.flagRest[i]
      const k = x / FLAG_W
      arr[i + 2] = Math.sin(x * 0.7 - time * 3.2) * 0.9 * k + Math.sin(this.flagRest[i + 1] * 0.8 + time * 2) * 0.2 * k
    }
    pos.needsUpdate = true

    // the active camp's lantern breathes, the others glow steady
    for (let i = 0; i < this.glows.length; i++) {
      const g = this.glows[i]
      const base = g.userData.base as number
      const target = i === this.active ? base * (1.5 + Math.sin(time * 2.4) * 0.15) : base
      g.scale.setScalar(THREE.MathUtils.lerp(g.scale.x, target, 0.08))
    }
  }

  dispose() {
    for (const d of this.disposables) d.dispose()
  }
}
