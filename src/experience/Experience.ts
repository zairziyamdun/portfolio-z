import * as THREE from 'three'
import type { Quality } from './quality'
import skyVertex from '../shaders/sky.vert'
import skyFragment from '../shaders/sky.frag'

// The whole scene is driven by one value: scroll progress 0..1.
export class Experience {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(50, 1, 0.1, 2000)
  private sky: THREE.ShaderMaterial
  private stars: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>
  private progress = 0
  private dpr: number
  private frameId = 0
  private slowFrames = 0
  private last = performance.now()

  constructor(private host: HTMLElement, quality: Quality) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' })
    this.dpr = Math.min(devicePixelRatio, quality.maxDpr)
    this.renderer.setPixelRatio(this.dpr)
    host.appendChild(this.renderer.domElement)

    this.sky = new THREE.ShaderMaterial({
      vertexShader: skyVertex,
      fragmentShader: skyFragment,
      uniforms: { uProgress: { value: 0 } },
      depthWrite: false,
    })
    const skyMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.sky)
    skyMesh.frustumCulled = false
    this.scene.add(skyMesh)

    this.stars = this.createStars(quality.particles)
    this.scene.add(this.stars)

    this.resize()
    addEventListener('resize', this.resize)
    document.addEventListener('visibilitychange', this.onVisibility)
    this.renderer.compile(this.scene, this.camera)
    this.loop()
  }

  setProgress(p: number) {
    this.progress = p
  }

  private createStars(count: number) {
    const positions = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(500 + Math.random() * 500)
      positions.set([v.x, Math.abs(v.y), v.z], i * 3)
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const material = new THREE.PointsMaterial({ size: 1.5, sizeAttenuation: false, transparent: true, opacity: 0 })
    return new THREE.Points(geometry, material)
  }

  private resize = () => {
    const { clientWidth: w, clientHeight: h } = this.host
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  private onVisibility = () => {
    cancelAnimationFrame(this.frameId)
    if (!document.hidden) {
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

  private loop = () => {
    this.frameId = requestAnimationFrame(this.loop)
    const now = performance.now()
    this.adaptResolution(now - this.last)
    this.last = now

    const p = this.progress
    this.sky.uniforms.uProgress.value = p
    this.stars.material.opacity = THREE.MathUtils.smoothstep(p, 0.55, 0.8)
    this.camera.position.set(0, p * 50, 0)
    this.camera.rotation.x = THREE.MathUtils.lerp(0, 0.35, p)

    this.renderer.render(this.scene, this.camera)
  }

  dispose() {
    cancelAnimationFrame(this.frameId)
    removeEventListener('resize', this.resize)
    document.removeEventListener('visibilitychange', this.onVisibility)
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}
