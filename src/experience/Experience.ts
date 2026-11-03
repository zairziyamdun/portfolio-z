import * as THREE from 'three'
import type { Quality } from './quality'
import type { TerrainData, TerrainOptions } from './terrain/generate'
import { CameraRig, MOUNTAIN_END } from './CameraRig'
import { Mountain } from './Mountain'
import { Props } from './Props'
import { createPaletteState, samplePalette } from './palette'
import skyVertex from '../shaders/sky.vert'
import skyFragment from '../shaders/sky.frag'

const TERRAIN_SEED = 7

function loadTerrain(options: TerrainOptions): Promise<TerrainData> {
  return new Promise<TerrainData>((resolve, reject) => {
    const worker = new Worker(new URL('./terrain/terrain.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<TerrainData>) => {
      worker.terminate()
      resolve(e.data)
    }
    worker.onerror = (e) => {
      worker.terminate()
      reject(e)
    }
    worker.postMessage(options)
  }).catch(async () => (await import('./terrain/generate')).generateTerrain(options))
}

export interface ExperienceOptions {
  /** scene progress (0..1) of each camp, in card order */
  camps: number[]
}

/** camp anchor in CSS pixels; `visible` is false when behind the camera or off screen */
export interface CampScreen {
  x: number
  y: number
  visible: boolean
}

const projected = new THREE.Vector3()

// The whole scene is driven by one value: scene progress 0..1 (see sceneProgress in altitude.ts).
export class Experience {
  /** called every frame with camp positions on screen */
  onCamps?: (camps: readonly CampScreen[]) => void
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(50, 1, 1, 6000)
  private sky: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>
  private stars: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>
  private hemi = new THREE.HemisphereLight(0xffffff, 0x0a0d14, 0.5)
  private sun = new THREE.DirectionalLight(0xffffff, 1)
  private fog = new THREE.FogExp2(0x000000, 0.001)
  private palette = createPaletteState()
  private mountain?: Mountain
  private props?: Props
  private rig?: CameraRig
  private campScreens: CampScreen[] = []
  private campScenes: number[]
  private progress = 0
  private dpr: number
  private frameId = 0
  private slowFrames = 0
  private last = performance.now()
  private disposed = false

  constructor(private host: HTMLElement, quality: Quality, options: ExperienceOptions) {
    this.campScenes = options.camps
    this.renderer = new THREE.WebGLRenderer({ antialias: quality.antialias, powerPreference: 'high-performance' })
    this.dpr = Math.min(devicePixelRatio, quality.maxDpr)
    this.renderer.setPixelRatio(this.dpr)
    host.appendChild(this.renderer.domElement)

    this.scene.fog = this.fog
    this.sun.position.set(0, 0, 0)
    this.scene.add(this.hemi, this.sun, this.sun.target)

    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(3000, 32, 16),
      new THREE.ShaderMaterial({
        vertexShader: skyVertex,
        fragmentShader: skyFragment,
        uniforms: {
          uTop: { value: this.palette.top },
          uHorizon: { value: this.palette.horizon },
          uSun: { value: this.palette.sun },
          uSunDir: { value: this.palette.sunDir },
          uSunStrength: { value: 1 },
        },
        side: THREE.BackSide,
        depthWrite: false,
      }),
    )
    this.sky.frustumCulled = false
    this.sky.renderOrder = -1
    this.scene.add(this.sky)

    this.stars = this.createStars(quality.particles)
    this.scene.add(this.stars)

    this.resize()
    addEventListener('resize', this.resize)
    document.addEventListener('visibilitychange', this.onVisibility)

    loadTerrain({
      seed: TERRAIN_SEED,
      segments: quality.terrainSegments,
      trees: quality.trees,
      rocks: quality.rocks,
      camps: options.camps.map((s) => s / MOUNTAIN_END),
    }).then((data) => this.onTerrain(data))
  }

  private async onTerrain(data: TerrainData) {
    if (this.disposed) return
    this.mountain = new Mountain(data)
    this.scene.add(this.mountain.group)
    this.rig = new CameraRig(this.camera, data.path, data.summit)
    const camps = this.placeCamps(data, this.mountain, this.rig)
    this.props = new Props(camps, data.summit)
    this.scene.add(this.props.group)
    this.campScreens = this.props.campAnchors.map(() => ({ x: 0, y: 0, visible: false }))
    this.applyProgress()
    // compile every shader up front so the first scroll never stalls
    await this.renderer.compileAsync(this.scene, this.camera)
    if (this.disposed) return
    this.loop()
    this.host.classList.add('is-ready')
  }

  setProgress(p: number) {
    this.progress = p
  }

  // Pitch each tent where the camera actually looks while its card is read: a ray through the
  // empty side of the frame (right on landscape, centre on portrait) down onto the slope.
  // Returns x, y, z, rotation, scale per camp; the worker's spots are the fallback.
  private placeCamps(data: TerrainData, mountain: Mountain, rig: CameraRig): Float32Array {
    const count = this.campScenes.length
    const out = new Float32Array(count * 5)
    const view = this.camera.clone()
    const pos = new THREE.Vector3()
    const target = new THREE.Vector3()
    const ray = new THREE.Raycaster()
    const ndc = new THREE.Vector2(this.camera.aspect > 1 ? 0.45 : 0.15, -0.2)
    const placed: THREE.Vector3[] = []
    this.campScenes.forEach((s, i) => {
      rig.poseAt(s, pos, target)
      view.position.copy(pos)
      view.lookAt(target)
      view.updateMatrixWorld()
      ray.setFromCamera(ndc, view)
      const hit = ray.intersectObject(mountain.terrain, false)[0]
      const p = hit ? hit.point : new THREE.Vector3(data.camps[i * 4], data.camps[i * 4 + 1], data.camps[i * 4 + 2])
      const distance = p.distanceTo(pos)
      // far tents grow a little so they still read as tents, near ones stay life-size
      const scale = THREE.MathUtils.clamp(distance * 0.035, 9, 22)
      out.set([p.x, p.y, p.z, Math.atan2(pos.x - p.x, pos.z - p.z), scale], i * 5)
      placed.push(p.clone())
    })
    mountain.clearAround(placed, 26)
    return out
  }

  setActiveCamp(index: number) {
    this.props?.setActiveCamp(index)
  }

  private projectCamps() {
    if (!this.props || !this.onCamps) return
    const { clientWidth: w, clientHeight: h } = this.host
    this.props.campAnchors.forEach((anchor, i) => {
      projected.copy(anchor).project(this.camera)
      const out = this.campScreens[i]
      out.x = (projected.x * 0.5 + 0.5) * w
      out.y = (-projected.y * 0.5 + 0.5) * h
      out.visible = projected.z < 1 && Math.abs(projected.x) < 1.1 && Math.abs(projected.y) < 1.1
    })
    this.onCamps(this.campScreens)
  }

  private createStars(count: number) {
    const positions = new Float32Array(count * 3)
    const v = new THREE.Vector3()
    for (let i = 0; i < count; i++) {
      v.randomDirection()
      v.y = Math.abs(v.y) * 0.9 + 0.1
      v.normalize().multiplyScalar(2500)
      positions.set([v.x, v.y, v.z], i * 3)
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const material = new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false })
    const points = new THREE.Points(geometry, material)
    points.frustumCulled = false
    return points
  }

  private resize = () => {
    const { clientWidth: w, clientHeight: h } = this.host
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    // narrow screens get a wider lens so the mountain still fits
    this.camera.fov = w / h < 0.8 ? 62 : 50
    this.camera.updateProjectionMatrix()
  }

  private onVisibility = () => {
    cancelAnimationFrame(this.frameId)
    if (!document.hidden && this.rig) {
      this.last = performance.now()
      this.loop()
    }
  }

  // Drop resolution when frames keep running long instead of stuttering.
  private adaptResolution(dt: number) {
    this.slowFrames = dt > 1000 / 45 ? this.slowFrames + 1 : Math.max(0, this.slowFrames - 1)
    if (this.slowFrames > 60 && this.dpr > 0.6) {
      this.dpr = Math.max(0.6, this.dpr - 0.25)
      this.renderer.setPixelRatio(this.dpr)
      this.resize()
      this.slowFrames = 0
    }
  }

  private applyProgress() {
    const s = this.progress
    const p = samplePalette(s, this.palette)
    this.fog.color.copy(p.horizon)
    this.fog.density = p.fog
    this.sun.color.copy(p.sun)
    this.sun.intensity = p.sunIntensity
    this.sun.position.copy(p.sunDir).multiplyScalar(1000)
    this.hemi.color.copy(p.ambient)
    this.hemi.intensity = p.hemi
    this.stars.material.opacity = THREE.MathUtils.smoothstep(s, 0.5, 0.8)
    this.rig?.update(s)
    // sky and stars travel with the camera: they are at infinity
    this.sky.position.copy(this.camera.position)
    this.stars.position.copy(this.camera.position)
  }

  private loop = () => {
    this.frameId = requestAnimationFrame(this.loop)
    const now = performance.now()
    this.adaptResolution(now - this.last)
    this.last = now
    this.applyProgress()
    this.props?.update(now / 1000)
    this.renderer.render(this.scene, this.camera)
    this.projectCamps()
  }

  dispose() {
    this.disposed = true
    cancelAnimationFrame(this.frameId)
    removeEventListener('resize', this.resize)
    document.removeEventListener('visibilitychange', this.onVisibility)
    this.rig?.dispose()
    this.mountain?.dispose()
    this.props?.dispose()
    this.sky.geometry.dispose()
    this.sky.material.dispose()
    this.stars.geometry.dispose()
    this.stars.material.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}
